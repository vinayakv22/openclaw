/// <reference types="node" />

import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { TranscriptEvent } from "../types.js";

type RealtimeSttOptions = {
  url: string;
  apiKey: string;
  model?: string;
  language: string;
  vadSilenceMs: number;
  vadThreshold: number;
};

type RealtimeSttCallbacks = {
  onEvent: (event: TranscriptEvent) => void;
};

export class OpenAIRealtimeSttSession {
  #ws: WebSocket | null = null;
  #callbacks: RealtimeSttCallbacks;
  #closed = false;

  constructor(
    private readonly options: RealtimeSttOptions,
    callbacks: RealtimeSttCallbacks,
  ) {
    this.#callbacks = callbacks;
  }

  async connect(signal?: AbortSignal): Promise<void> {
    if (this.#ws) {
      return;
    }

    const ws = new WebSocket(this.options.url, {
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    this.#ws = ws;

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              language: this.options.language,
              turn_detection: {
                type: "server_vad",
                silence_duration_ms: this.options.vadSilenceMs,
                threshold: this.options.vadThreshold,
              },
              ...(this.options.model ? { model: this.options.model } : {}),
            },
          }),
        );
        resolve();
      });
      ws.on("error", () => {
        reject(new Error("Failed to connect to STT realtime endpoint"));
      });
    });

    ws.on("message", (data: WebSocket.RawData) => {
      this.#handleMessage(data.toString());
    });

    ws.on("close", () => {
      if (!this.#closed) {
        this.#callbacks.onEvent({ type: "speech-end" });
      }
      this.#closed = true;
      this.#ws = null;
    });

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          this.close();
        },
        { once: true },
      );
    }
  }

  sendPcmChunk(chunk: Uint8Array): void {
    if (!this.#ws || this.#closed) {
      return;
    }
    const payload = Buffer.from(chunk).toString("base64");
    this.#ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: payload,
      }),
    );
  }

  commit(): void {
    if (!this.#ws || this.#closed) {
      return;
    }
    this.#ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    this.#ws.send(JSON.stringify({ type: "response.create" }));
  }

  close(): void {
    this.#closed = true;
    this.#ws?.close();
    this.#ws = null;
  }

  #handleMessage(raw: unknown): void {
    let evt: Record<string, unknown>;
    if (typeof raw !== "string") {
      return;
    }
    try {
      evt = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = typeof evt.type === "string" ? evt.type : "";
    if (type === "input_audio_buffer.speech_started") {
      this.#callbacks.onEvent({ type: "speech-start" });
      return;
    }
    if (type === "input_audio_buffer.speech_stopped") {
      this.#callbacks.onEvent({ type: "speech-end" });
      return;
    }
    if (type === "response.audio_transcript.delta") {
      const text = typeof evt.delta === "string" ? evt.delta.trim() : "";
      if (text) {
        this.#callbacks.onEvent({ type: "partial", text });
      }
      return;
    }
    if (type === "response.audio_transcript.done") {
      const text = typeof evt.transcript === "string" ? evt.transcript.trim() : "";
      if (text) {
        this.#callbacks.onEvent({ type: "final", text });
      }
      return;
    }
    if (type === "error") {
      const message =
        (evt.error as { message?: string } | undefined)?.message ?? "Realtime STT error";
      this.#callbacks.onEvent({ type: "error", error: String(message) });
    }
  }
}

export class OpenAIRealtimeSttAdapter extends EventEmitter {
  createSession(params: RealtimeSttOptions): OpenAIRealtimeSttSession {
    return new OpenAIRealtimeSttSession(params, {
      onEvent: (event) => {
        this.emit("event", event);
      },
    });
  }
}
