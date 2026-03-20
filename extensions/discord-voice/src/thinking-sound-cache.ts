/// <reference types="node" />

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { OpenAIStreamingTtsAdapter } from "./adapters/openai-streaming-tts.js";

type ThinkingSoundParams = {
  cacheDir: string;
  phrase: string;
  providerKey: string;
  model: string;
  voice: string;
  sampleRate: number;
};

function resolveCacheRoot(cacheDir: string): string {
  if (cacheDir.startsWith("/")) {
    return cacheDir;
  }
  return join(homedir(), cacheDir);
}

function toPcmWav(pcm: Uint8Array, sampleRate: number): Buffer {
  const channels = 1;
  const bytesPerSample = 2;
  const byteRate = sampleRate * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  Buffer.from(pcm).copy(buffer, 44);
  return buffer;
}

export class ThinkingSoundCache {
  async ensure(params: ThinkingSoundParams, tts: OpenAIStreamingTtsAdapter): Promise<string> {
    const root = resolveCacheRoot(params.cacheDir);
    const key = `${params.providerKey}:${params.model}:${params.voice}`;
    const hash = createHash("sha1").update(key).digest("hex");
    const outputPath = join(root, `${hash}.wav`);

    try {
      await readFile(outputPath);
      return outputPath;
    } catch {
      // cache miss
    }

    await mkdir(dirname(outputPath), { recursive: true });

    const buffers: Buffer[] = [];
    for await (const chunk of tts.streamSpeech(params.phrase)) {
      buffers.push(Buffer.from(chunk));
    }

    const merged = Buffer.concat(buffers);
    const wav = toPcmWav(merged, params.sampleRate);
    await writeFile(outputPath, wav);
    return outputPath;
  }
}
