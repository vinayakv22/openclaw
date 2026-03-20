import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/core";
import type { DiscordVoiceAccountConfig, ResolvedDiscordVoiceAccount } from "./types.js";

type DiscordVoiceSection = DiscordVoiceAccountConfig & {
  accounts?: Record<string, DiscordVoiceAccountConfig>;
};

const DEFAULTS: ResolvedDiscordVoiceAccount = {
  accountId: DEFAULT_ACCOUNT_ID,
  configured: true,
  enabled: true,
  name: undefined,
  agentId: "default",
  provider: "default",
  providers: {},
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    sttModel: "",
    ttsModel: "",
    voice: "",
  },
  stt: {
    realtimeUrl: "wss://api.openai.com/v1/realtime?intent=transcription",
    apiKey: "",
    model: "gpt-4o-transcribe",
    language: "en",
    fallbackToFileTranscribe: true,
    vadSilenceMs: 800,
    vadThreshold: 0.5,
  },
  tts: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: undefined,
    voice: undefined,
    format: "pcm",
    speed: 1,
    fallbackToBufferedTts: true,
  },
  bargeIn: {
    enabled: true,
    minSpeechMs: 250,
  },
  thinkingSound: {
    enabled: true,
    phrase: "hmm uhmm",
    cacheDir: ".openclaw/discord-voice/thinking-sounds",
  },
};

function section(cfg: OpenClawConfig): DiscordVoiceSection {
  return (cfg.channels?.["discord-voice"] as DiscordVoiceSection | undefined) ?? {};
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  const next = raw?.trim() ?? "";
  if (!next) {
    return fallback;
  }
  return next.replace(/\/+$/, "");
}

function resolveRealtimeUrl(baseUrl: string, explicitRealtimeUrl?: string): string {
  const realtime = explicitRealtimeUrl?.trim() ?? "";
  if (realtime) {
    return realtime;
  }
  const wsBase = baseUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return `${wsBase}/realtime?intent=transcription`;
}

function optionalString(raw: string | undefined): string | undefined {
  const next = raw?.trim() ?? "";
  return next ? next : undefined;
}

export function listDiscordVoiceAccountIds(cfg: OpenClawConfig): string[] {
  const s = section(cfg);
  const ids = new Set<string>([DEFAULT_ACCOUNT_ID]);
  for (const key of Object.keys(s.accounts ?? {})) {
    ids.add(normalizeAccountId(key));
  }
  return [...ids];
}

export function resolveDiscordVoiceAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedDiscordVoiceAccount {
  const s = section(cfg);
  const id = normalizeAccountId(accountId ?? DEFAULT_ACCOUNT_ID);
  const raw = id === DEFAULT_ACCOUNT_ID ? s : { ...s, ...(s.accounts?.[id] ?? {}) };

  const provider = optionalString(raw.provider) ?? DEFAULTS.provider;
  const providers = raw.providers ?? {};
  const providerEntry = providers[provider] ?? {};

  const openaiBaseUrl = normalizeBaseUrl(
    providerEntry.baseUrl ?? raw.openai?.baseUrl,
    DEFAULTS.openai.baseUrl,
  );
  const openaiApiKey = optionalString(providerEntry.apiKey) ?? raw.openai?.apiKey?.trim() ?? "";
  const openaiSttModel =
    optionalString(providerEntry.sttModel) ?? optionalString(raw.openai?.sttModel);
  const openaiTtsModel =
    optionalString(providerEntry.ttsModel) ?? optionalString(raw.openai?.ttsModel);
  const openaiVoice = optionalString(providerEntry.voice) ?? optionalString(raw.openai?.voice);

  const providerStt = providerEntry.stt ?? {};
  const providerTts = providerEntry.tts ?? {};

  const merged: ResolvedDiscordVoiceAccount = {
    ...DEFAULTS,
    accountId: id,
    name: raw.name?.trim() || (id === DEFAULT_ACCOUNT_ID ? "Discord Voice" : id),
    enabled: raw.enabled ?? DEFAULTS.enabled,
    provider,
    providers,
    agentId: (raw.agentId ?? DEFAULTS.agentId).trim() || DEFAULTS.agentId,
    openai: {
      ...DEFAULTS.openai,
      ...(raw.openai ?? {}),
      baseUrl: openaiBaseUrl,
      apiKey: openaiApiKey,
      sttModel: openaiSttModel ?? "",
      ttsModel: openaiTtsModel ?? "",
      voice: openaiVoice ?? "",
    },
    stt: {
      ...DEFAULTS.stt,
      ...(raw.stt ?? {}),
      baseUrl: normalizeBaseUrl(raw.stt?.baseUrl ?? providerStt.baseUrl, openaiBaseUrl),
      realtimeUrl: resolveRealtimeUrl(
        normalizeBaseUrl(raw.stt?.baseUrl ?? providerStt.baseUrl, openaiBaseUrl),
        raw.stt?.realtimeUrl ?? providerStt.realtimeUrl,
      ),
      apiKey: raw.stt?.apiKey?.trim() || providerStt.apiKey?.trim() || openaiApiKey,
      model:
        optionalString(raw.stt?.model) ??
        optionalString(providerStt.model) ??
        openaiSttModel ??
        undefined,
      language: raw.stt?.language?.trim() || providerStt.language?.trim() || DEFAULTS.stt.language,
      fallbackToFileTranscribe:
        raw.stt?.fallbackToFileTranscribe ?? DEFAULTS.stt.fallbackToFileTranscribe,
      vadSilenceMs: raw.stt?.vadSilenceMs ?? DEFAULTS.stt.vadSilenceMs,
      vadThreshold: raw.stt?.vadThreshold ?? DEFAULTS.stt.vadThreshold,
    },
    tts: {
      ...DEFAULTS.tts,
      ...(raw.tts ?? {}),
      baseUrl: normalizeBaseUrl(raw.tts?.baseUrl ?? providerTts.baseUrl, openaiBaseUrl),
      apiKey: raw.tts?.apiKey?.trim() || providerTts.apiKey?.trim() || openaiApiKey,
      model:
        optionalString(raw.tts?.model) ??
        optionalString(providerTts.model) ??
        openaiTtsModel ??
        undefined,
      voice:
        optionalString(raw.tts?.voice) ??
        optionalString(providerTts.voice) ??
        openaiVoice ??
        undefined,
      format: raw.tts?.format ?? DEFAULTS.tts.format,
      speed: raw.tts?.speed ?? DEFAULTS.tts.speed,
      fallbackToBufferedTts: raw.tts?.fallbackToBufferedTts ?? DEFAULTS.tts.fallbackToBufferedTts,
    },
    bargeIn: {
      ...DEFAULTS.bargeIn,
      ...(raw.bargeIn ?? {}),
      enabled: raw.bargeIn?.enabled ?? DEFAULTS.bargeIn.enabled,
      minSpeechMs: raw.bargeIn?.minSpeechMs ?? DEFAULTS.bargeIn.minSpeechMs,
    },
    thinkingSound: {
      ...DEFAULTS.thinkingSound,
      ...(raw.thinkingSound ?? {}),
      enabled: raw.thinkingSound?.enabled ?? DEFAULTS.thinkingSound.enabled,
      phrase: raw.thinkingSound?.phrase?.trim() || DEFAULTS.thinkingSound.phrase,
      cacheDir: raw.thinkingSound?.cacheDir?.trim() || DEFAULTS.thinkingSound.cacheDir,
    },
    configured: true,
  };

  return merged;
}

export const discordVoiceConfigSchema = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      agentId: { type: "string" },
      provider: { type: "string" },
      providers: {
        type: "object",
        additionalProperties: {
          type: "object",
          additionalProperties: false,
          properties: {
            baseUrl: { type: "string" },
            apiKey: { type: "string" },
            sttModel: { type: "string" },
            ttsModel: { type: "string" },
            voice: { type: "string" },
            stt: {
              type: "object",
              additionalProperties: false,
              properties: {
                baseUrl: { type: "string" },
                realtimeUrl: { type: "string" },
                apiKey: { type: "string" },
                model: { type: "string" },
                language: { type: "string" },
              },
            },
            tts: {
              type: "object",
              additionalProperties: false,
              properties: {
                baseUrl: { type: "string" },
                apiKey: { type: "string" },
                model: { type: "string" },
                voice: { type: "string" },
              },
            },
          },
        },
      },
      openai: {
        type: "object",
        additionalProperties: false,
        properties: {
          baseUrl: { type: "string" },
          apiKey: { type: "string" },
          sttModel: { type: "string" },
          ttsModel: { type: "string" },
          voice: { type: "string" },
        },
      },
      stt: {
        type: "object",
        additionalProperties: false,
        properties: {
          baseUrl: { type: "string" },
          realtimeUrl: { type: "string" },
          apiKey: { type: "string" },
          model: { type: "string" },
          language: { type: "string" },
          fallbackToFileTranscribe: { type: "boolean" },
          vadSilenceMs: { type: "number" },
          vadThreshold: { type: "number" },
        },
      },
      tts: {
        type: "object",
        additionalProperties: false,
        properties: {
          baseUrl: { type: "string" },
          apiKey: { type: "string" },
          model: { type: "string" },
          voice: { type: "string" },
          format: { type: "string", enum: ["pcm", "opus", "mp3"] },
          speed: { type: "number" },
          fallbackToBufferedTts: { type: "boolean" },
        },
      },
      bargeIn: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean" },
          minSpeechMs: { type: "number" },
        },
      },
      thinkingSound: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean" },
          phrase: { type: "string" },
          cacheDir: { type: "string" },
        },
      },
      accounts: {
        type: "object",
        additionalProperties: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  },
  uiHints: {
    provider: { label: "Provider Name" },
    agentId: { label: "Agent ID" },
    providers: { label: "Named Providers", advanced: true },
    "openai.baseUrl": { label: "OpenAI-Compatible Base URL", advanced: true },
    "openai.apiKey": { label: "OpenAI-Compatible API Key", sensitive: true, advanced: true },
    "openai.sttModel": { label: "Default STT Model", advanced: true },
    "openai.ttsModel": { label: "Default TTS Model", advanced: true },
    "openai.voice": { label: "Default Voice", advanced: true },
    "stt.baseUrl": { label: "STT Base URL Override", advanced: true },
    "stt.realtimeUrl": { label: "STT Realtime URL", advanced: true },
    "stt.apiKey": { label: "STT API Key", sensitive: true, advanced: true },
    "stt.model": { label: "STT Model", advanced: true },
    "tts.baseUrl": { label: "TTS Base URL", advanced: true },
    "tts.apiKey": { label: "TTS API Key", sensitive: true, advanced: true },
    "tts.model": { label: "TTS Model", advanced: true },
    "tts.voice": { label: "TTS Voice", advanced: true },
    "thinkingSound.enabled": { label: "Thinking Sound", advanced: true },
  },
} as const;
