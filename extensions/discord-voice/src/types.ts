export type DiscordVoiceSessionState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking";

export type DiscordVoiceNamedProviderConfig = {
  baseUrl?: string;
  apiKey?: string;
  sttModel?: string;
  ttsModel?: string;
  voice?: string;
  stt?: {
    baseUrl?: string;
    realtimeUrl?: string;
    apiKey?: string;
    model?: string;
    language?: string;
  };
  tts?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    voice?: string;
  };
};

export type DiscordVoiceAccountConfig = {
  enabled?: boolean;
  name?: string;
  agentId?: string;
  provider?: string;
  providers?: Record<string, DiscordVoiceNamedProviderConfig>;
  openai?: {
    baseUrl?: string;
    apiKey?: string;
    sttModel?: string;
    ttsModel?: string;
    voice?: string;
  };
  stt?: {
    baseUrl?: string;
    realtimeUrl?: string;
    apiKey?: string;
    model?: string;
    language?: string;
    fallbackToFileTranscribe?: boolean;
    vadSilenceMs?: number;
    vadThreshold?: number;
  };
  tts?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    voice?: string;
    format?: "pcm" | "opus" | "mp3";
    speed?: number;
    fallbackToBufferedTts?: boolean;
  };
  bargeIn?: {
    enabled?: boolean;
    minSpeechMs?: number;
  };
  thinkingSound?: {
    enabled?: boolean;
    phrase?: string;
    cacheDir?: string;
  };
};

export type ResolvedDiscordVoiceAccount = {
  accountId: string;
  configured: boolean;
  enabled: boolean;
  name?: string;
  agentId: string;
  provider: string;
  providers: Record<string, DiscordVoiceNamedProviderConfig>;
  openai: Required<NonNullable<DiscordVoiceAccountConfig["openai"]>>;
  stt: {
    baseUrl: string;
    realtimeUrl: string;
    apiKey: string;
    model?: string;
    language: string;
    fallbackToFileTranscribe: boolean;
    vadSilenceMs: number;
    vadThreshold: number;
  };
  tts: {
    baseUrl: string;
    apiKey: string;
    model?: string;
    voice?: string;
    format: "pcm" | "opus" | "mp3";
    speed: number;
    fallbackToBufferedTts: boolean;
  };
  bargeIn: Required<NonNullable<DiscordVoiceAccountConfig["bargeIn"]>>;
  thinkingSound: Required<NonNullable<DiscordVoiceAccountConfig["thinkingSound"]>>;
};

export type TranscriptEvent =
  | { type: "speech-start" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "speech-end" }
  | { type: "error"; error: string };

export type TtsAudioChunk = {
  chunk: Uint8Array;
  done: boolean;
};
