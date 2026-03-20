import { describe, expect, it } from "vitest";
import { resolveDiscordVoiceAccount, listDiscordVoiceAccountIds } from "./config.js";

describe("discord-voice config", () => {
  it("resolves default values", () => {
    const account = resolveDiscordVoiceAccount({} as never);
    expect(account.enabled).toBe(true);
    expect(account.agentId).toBe("default");
    expect(account.stt.model).toBeUndefined();
    expect(account.tts.model).toBeUndefined();
    expect(account.configured).toBe(true);
  });

  it("resolves account overrides", () => {
    const cfg = {
      channels: {
        "discord-voice": {
          accounts: {
            alpha: {
              agentId: "agent-alpha",
              tts: {
                voice: "nova",
              },
            },
          },
        },
      },
    };

    const account = resolveDiscordVoiceAccount(cfg as never, "alpha");
    expect(account.accountId).toBe("alpha");
    expect(account.configured).toBe(true);
    expect(account.tts.voice).toBe("nova");
    expect(account.agentId).toBe("agent-alpha");
  });

  it("lists default and explicit accounts", () => {
    const cfg = {
      channels: {
        "discord-voice": {
          accounts: {
            alpha: {},
            beta: {},
          },
        },
      },
    };

    const ids = listDiscordVoiceAccountIds(cfg as never);
    expect(ids).toContain("default");
    expect(ids).toContain("alpha");
    expect(ids).toContain("beta");
  });

  it("resolves shared openai baseUrl and per-surface overrides", () => {
    const cfg = {
      channels: {
        "discord-voice": {
          openai: {
            baseUrl: "https://openai-compatible.example/v1/",
            apiKey: "shared-key",
            sttModel: "stt-shared",
            ttsModel: "tts-shared",
            voice: "verse",
          },
          stt: {
            baseUrl: "https://stt.example/v1/",
          },
          tts: {
            baseUrl: "https://tts.example/v1/",
          },
        },
      },
    };

    const account = resolveDiscordVoiceAccount(cfg as never);
    expect(account.openai.baseUrl).toBe("https://openai-compatible.example/v1");
    expect(account.stt.baseUrl).toBe("https://stt.example/v1");
    expect(account.tts.baseUrl).toBe("https://tts.example/v1");
    expect(account.stt.apiKey).toBe("shared-key");
    expect(account.tts.apiKey).toBe("shared-key");
    expect(account.stt.model).toBe("stt-shared");
    expect(account.tts.model).toBe("tts-shared");
    expect(account.tts.voice).toBe("verse");
    expect(account.stt.realtimeUrl).toBe("wss://stt.example/v1/realtime?intent=transcription");
  });

  it("selects named providers and allows optional model and voice", () => {
    const cfg = {
      channels: {
        "discord-voice": {
          provider: "myCustomProvider",
          providers: {
            myCustomProvider: {
              baseUrl: "https://custom-provider.example/v1",
              apiKey: "provider-key",
            },
          },
        },
      },
    };

    const account = resolveDiscordVoiceAccount(cfg as never);
    expect(account.provider).toBe("myCustomProvider");
    expect(account.stt.baseUrl).toBe("https://custom-provider.example/v1");
    expect(account.tts.baseUrl).toBe("https://custom-provider.example/v1");
    expect(account.stt.apiKey).toBe("provider-key");
    expect(account.tts.apiKey).toBe("provider-key");
    expect(account.stt.model).toBeUndefined();
    expect(account.tts.model).toBeUndefined();
    expect(account.tts.voice).toBeUndefined();
  });
});
