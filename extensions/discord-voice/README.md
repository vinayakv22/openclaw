# Discord Voice Plugin (WIP)

This plugin scaffolds a Discord voice channel integration that keeps plugin-sdk read-only and implements streaming orchestration inside the extension.

## Implemented

- Channel plugin entry and runtime store
- Account config parsing and schema hints
- OpenAI-compatible realtime STT adapter (WebSocket)
- OpenAI-compatible streaming TTS adapter (chunked HTTP response)
- Thinking sound cache keyed by provider/model/voice
- Voice session manager with:
  - STT speech/final transcript event handling
  - barge-in cancellation hooks
  - embedded Pi agent invocation
  - streamed text-to-TTS chunk writing scaffold

## Remaining

- Discord voice transport wiring (join voice channel, Opus decode, PCM feed)
- Real-time playback output into Discord voice connection
- Fallback paths to non-streaming SDK STT/TTS helpers
- Integration tests

## Configuration (`openclaw.json`)

```json
{
  "channels": {
    "discord-voice": {
      "enabled": true,
      "agentId": "default",
      "provider": "openaiCompatible",
      "providers": {
        "openaiCompatible": {
          "baseUrl": "https://api.openai.com/v1",
          "apiKey": "<api-key>"
        },
        "myCustomProvider": {
          "baseUrl": "https://my-provider.example/v1",
          "apiKey": "<provider-key>",
          "sttModel": "transcribe-x"
        }
      },
      "openai": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "<api-key>",
        "sttModel": "gpt-4o-transcribe",
        "ttsModel": "gpt-4o-mini-tts",
        "voice": "alloy"
      },
      "stt": {
        "baseUrl": "https://api.openai.com/v1",
        "realtimeUrl": "wss://api.openai.com/v1/realtime?intent=transcription"
      },
      "tts": {
        "baseUrl": "https://api.openai.com/v1"
      }
    }
  }
}
```

- This plugin assumes Discord transport is configured in your main OpenClaw config.
- `provider` picks a named entry from `providers`, and provider names can be any string.
- `openai.baseUrl` is the shared default for both STT and TTS.
- `stt.baseUrl` and `tts.baseUrl` can override the shared base URL independently.
- `stt.realtimeUrl` has highest priority for STT streaming endpoint selection.
- `model` and `voice` are optional; providers that infer defaults from API key/base URL are supported.
