type StreamingTtsOptions = {
  baseUrl: string;
  apiKey: string;
  model?: string;
  voice?: string;
  speed: number;
  format: "pcm" | "opus" | "mp3";
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function resolveResponseFormat(format: StreamingTtsOptions["format"]): string {
  if (format === "pcm") {
    return "pcm";
  }
  if (format === "opus") {
    return "opus";
  }
  return "mp3";
}

export class OpenAIStreamingTtsAdapter {
  constructor(private readonly options: StreamingTtsOptions) {}

  async *streamSpeech(text: string, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
    const url = `${normalizeBaseUrl(this.options.baseUrl)}/audio/speech`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        speed: this.options.speed,
        response_format: resolveResponseFormat(this.options.format),
        ...(this.options.model ? { model: this.options.model } : {}),
        ...(this.options.voice ? { voice: this.options.voice } : {}),
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Streaming TTS failed (${response.status})`);
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value && value.length > 0) {
        yield value;
      }
    }
  }
}
