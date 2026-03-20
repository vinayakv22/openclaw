import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { discordVoicePlugin } from "./src/channel.js";
import { setDiscordVoiceRuntime } from "./src/runtime.js";

export { discordVoicePlugin } from "./src/channel.js";
export { setDiscordVoiceRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "discord-voice",
  name: "Discord Voice",
  description: "Discord voice channel plugin",
  plugin: discordVoicePlugin,
  setRuntime: setDiscordVoiceRuntime,
});
