import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setDiscordVoiceRuntime, getRuntime: getDiscordVoiceRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Discord Voice runtime not initialized");

export { getDiscordVoiceRuntime, setDiscordVoiceRuntime };
