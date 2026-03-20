/// <reference types="node" />

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { OpenAIRealtimeSttAdapter } from "../adapters/openai-realtime-stt.js";
import type { OpenAIRealtimeSttSession } from "../adapters/openai-realtime-stt.js";
import { OpenAIStreamingTtsAdapter } from "../adapters/openai-streaming-tts.js";
import { ThinkingSoundCache } from "../thinking-sound-cache.js";
import type { ResolvedDiscordVoiceAccount } from "../types.js";

type ReplyBlockPayload = {
  text?: string;
};

type SessionEntry = {
  account: ResolvedDiscordVoiceAccount;
  sessionKey: string;
  sttSession: OpenAIRealtimeSttSession;
  sttListener: (event: { type: string; text?: string }) => void;
  abortController: AbortController | null;
  ttsAbortController: AbortController | null;
  active: boolean;
};

export class DiscordVoiceSessionManager {
  readonly #sessions = new Map<string, SessionEntry>();
  readonly #stt = new OpenAIRealtimeSttAdapter();
  readonly #thinkingCache = new ThinkingSoundCache();

  constructor(private readonly runtime: PluginRuntime) {}

  async start(account: ResolvedDiscordVoiceAccount): Promise<void> {
    const key = account.accountId;
    const current = this.#sessions.get(key);
    if (current?.active) {
      return;
    }

    const sttSession = this.#stt.createSession({
      url: account.stt.realtimeUrl,
      apiKey: account.stt.apiKey,
      model: account.stt.model,
      language: account.stt.language,
      vadSilenceMs: account.stt.vadSilenceMs,
      vadThreshold: account.stt.vadThreshold,
    });

    const sessionKey = `discord-voice:${account.provider}:${account.accountId}`;

    const onEvent = (event: { type: string; text?: string }) => {
      if (event.type === "speech-start" && account.bargeIn.enabled) {
        void this.onBargeIn(account.accountId);
        return;
      }
      if (event.type === "final" && event.text) {
        void this.handleFinalTranscript({
          account,
          sessionKey,
          transcript: event.text,
        });
      }
    };
    this.#stt.on("event", onEvent);

    await sttSession.connect().catch((err: unknown) => {
      this.runtime.logging
        .getChildLogger({ channel: "discord-voice" })
        .warn(`STT connect failed: ${String(err)}`);
    });

    this.#sessions.set(key, {
      account,
      sessionKey,
      sttSession,
      sttListener: onEvent,
      abortController: null,
      ttsAbortController: null,
      active: true,
    });

    // TODO: connect to Discord voice receive pipeline. This first pass focuses on
    // streaming adapters and the agent/TTS orchestration surface.
  }

  async stop(accountId: string): Promise<void> {
    const session = this.#sessions.get(accountId);
    if (!session) {
      return;
    }
    session.abortController?.abort();
    session.ttsAbortController?.abort();
    session.sttSession.close();
    this.#stt.off("event", session.sttListener);
    session.active = false;
    this.#sessions.delete(accountId);
  }

  async onBargeIn(accountId: string): Promise<void> {
    const session = this.#sessions.get(accountId);
    if (!session) {
      return;
    }
    session.abortController?.abort();
    session.ttsAbortController?.abort();
  }

  ingestPcmFrame(accountId: string, pcmFrame: Uint8Array): void {
    const session = this.#sessions.get(accountId);
    if (!session || !session.active) {
      return;
    }
    session.sttSession.sendPcmChunk(pcmFrame);
  }

  commitUtterance(accountId: string): void {
    const session = this.#sessions.get(accountId);
    if (!session || !session.active) {
      return;
    }
    session.sttSession.commit();
  }

  async handleFinalTranscript(params: {
    account: ResolvedDiscordVoiceAccount;
    sessionKey: string;
    transcript: string;
  }): Promise<void> {
    const entry = this.#sessions.get(params.account.accountId);
    if (!entry) {
      return;
    }

    entry.abortController?.abort();
    entry.abortController = new AbortController();

    const tts = new OpenAIStreamingTtsAdapter({
      baseUrl: params.account.tts.baseUrl,
      apiKey: params.account.tts.apiKey,
      model: params.account.tts.model,
      voice: params.account.tts.voice,
      speed: params.account.tts.speed,
      format: params.account.tts.format,
    });

    const thinkingSoundPath = params.account.thinkingSound.enabled
      ? await this.#thinkingCache.ensure(
          {
            cacheDir: params.account.thinkingSound.cacheDir,
            phrase: params.account.thinkingSound.phrase,
            providerKey: params.account.tts.baseUrl,
            model: params.account.tts.model,
            voice: params.account.tts.voice,
            sampleRate: 24000,
          },
          tts,
        )
      : null;

    if (thinkingSoundPath) {
      // TODO: play short looping thinking WAV in Discord until first TTS chunk.
      this.runtime.logging
        .getChildLogger({ channel: "discord-voice" })
        .debug?.(`thinking sound ready: ${thinkingSoundPath}`);
    }

    const result = await this.runtime.agent.runEmbeddedPiAgent({
      sessionId: params.sessionKey,
      sessionKey: params.sessionKey,
      agentId: params.account.agentId,
      messageProvider: "discord-voice",
      messageChannel: "discord-voice",
      workspaceDir: this.runtime.agent.resolveAgentWorkspaceDir(
        await this.runtime.config.loadConfig(),
        params.account.agentId,
      ),
      sessionFile: this.runtime.agent.session.resolveSessionFilePath(params.sessionKey),
      config: await this.runtime.config.loadConfig(),
      prompt: params.transcript,
      timeoutMs: this.runtime.agent.resolveAgentTimeoutMs({
        cfg: await this.runtime.config.loadConfig(),
      }),
      runId: randomUUID(),
      abortSignal: entry.abortController.signal,
      onBlockReply: async (payload) => {
        await this.#streamReplyChunkToTts(tts, entry, params.account, payload);
      },
    });

    this.runtime.logging
      .getChildLogger({ channel: "discord-voice" })
      .debug?.(`agent run finished (aborted=${result.meta.aborted})`);
  }

  async #streamReplyChunkToTts(
    tts: OpenAIStreamingTtsAdapter,
    entry: SessionEntry,
    account: ResolvedDiscordVoiceAccount,
    payload: ReplyBlockPayload,
  ): Promise<void> {
    const text = payload.text?.trim();
    if (!text) {
      return;
    }

    entry.ttsAbortController?.abort();
    entry.ttsAbortController = new AbortController();

    const outputPath = join(tmpdir(), `openclaw-discord-voice-${Date.now()}.pcm`);
    const chunks: Buffer[] = [];

    try {
      for await (const chunk of tts.streamSpeech(text, entry.ttsAbortController.signal)) {
        chunks.push(Buffer.from(chunk));
      }
    } catch (err) {
      if (!account.tts.fallbackToBufferedTts) {
        throw err;
      }
      const cfg = await this.runtime.config.loadConfig();
      const fallback = await this.runtime.tts.textToSpeech({
        text,
        cfg,
        channel: "discord-voice",
      });
      if (!fallback.success) {
        throw new Error(fallback.error ?? "TTS fallback failed");
      }
      chunks.push(readFileSync(fallback.audioPath));
    }

    await mkdir(join(tmpdir(), "openclaw-discord-voice"), { recursive: true });
    await writeFile(outputPath, Buffer.concat(chunks));

    // TODO: stream chunks directly into Discord playback instead of writing temp PCM.
  }
}
