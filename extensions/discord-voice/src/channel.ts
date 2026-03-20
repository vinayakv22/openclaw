import { createTopLevelChannelConfigBase } from "openclaw/plugin-sdk/channel-config-helpers";
import { DEFAULT_ACCOUNT_ID, type ChannelPlugin } from "openclaw/plugin-sdk/core";
import { discordVoiceConfigSchema, resolveDiscordVoiceAccount } from "./config.js";
import { getDiscordVoiceRuntime } from "./runtime.js";
import type { ResolvedDiscordVoiceAccount } from "./types.js";
import { DiscordVoiceSessionManager } from "./voice/session-manager.js";

const CHANNEL_ID = "discord-voice" as const;

const managerStore = new WeakMap<object, DiscordVoiceSessionManager>();

function getManager(): DiscordVoiceSessionManager {
  const runtime = getDiscordVoiceRuntime();
  const key = runtime as unknown as object;
  const existing = managerStore.get(key);
  if (existing) {
    return existing;
  }
  const created = new DiscordVoiceSessionManager(runtime);
  managerStore.set(key, created);
  return created;
}

const config = {
  ...createTopLevelChannelConfigBase<ResolvedDiscordVoiceAccount>({
    sectionKey: CHANNEL_ID,
    resolveAccount: (cfg) => resolveDiscordVoiceAccount(cfg),
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    deleteMode: "clear-fields",
    clearBaseFields: ["agentId", "provider", "providers", "openai", "stt", "tts"],
  }),
  isEnabled: (account: ResolvedDiscordVoiceAccount) => account.enabled,
  isConfigured: (account: ResolvedDiscordVoiceAccount) => account.configured,
  describeAccount: (account: ResolvedDiscordVoiceAccount) => ({
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: account.configured,
    running: false,
  }),
};

export const discordVoicePlugin: ChannelPlugin<ResolvedDiscordVoiceAccount> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "Discord Voice",
    selectionLabel: "Discord (Voice)",
    detailLabel: "Discord Voice Agent",
    docsPath: "/channels/discord",
    docsLabel: "discord",
    blurb: "Real-time Discord voice with streaming STT/TTS and barge-in.",
    order: 205,
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
    nativeCommands: false,
    threads: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.discord-voice"] },
  configSchema: discordVoiceConfigSchema,
  config,
  lifecycle: {
    onAccountConfigChanged: async ({ nextCfg, accountId }) => {
      const account = resolveDiscordVoiceAccount(nextCfg, accountId);
      const manager = getManager();
      await manager.stop(account.accountId);
      if (account.enabled) {
        await manager.start(account);
      }
    },
    onAccountRemoved: async ({ accountId }) => {
      await getManager().stop(accountId);
    },
  },
  gateway: {
    startAccount: async ({ cfg, accountId }) => {
      const account = resolveDiscordVoiceAccount(cfg, accountId);
      if (!account.enabled) {
        return { ok: false, reason: "Discord Voice account is disabled" };
      }
      await getManager().start(account);
      return { ok: true };
    },
    stopAccount: async ({ accountId }) => {
      await getManager().stop(accountId);
    },
  },
};
