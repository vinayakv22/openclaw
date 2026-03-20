import {
  AudioPlayerStatus,
  EndBehaviorType,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import type { DiscordVoiceSessionManager } from "./session-manager.js";

type TransportEntry = {
  accountId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  speakingHandler: (userId: string) => void;
};

export type DecodeToPcm = (opusChunk: Uint8Array) => Uint8Array;

const DEFAULT_SILENCE_MS = 900;

export class DiscordVoiceTransport {
  readonly #entries = new Map<string, TransportEntry>();

  constructor(
    private readonly manager: DiscordVoiceSessionManager,
    private readonly decodeToPcm: DecodeToPcm,
  ) {}

  attach(params: { accountId: string; connection: VoiceConnection; player: AudioPlayer }): void {
    this.detach(params.accountId);

    const speakingHandler = (userId: string) => {
      if (!userId) {
        return;
      }
      if (params.player.state.status === AudioPlayerStatus.Playing) {
        void this.manager.onBargeIn(params.accountId);
      }

      const stream = params.connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: DEFAULT_SILENCE_MS,
        },
      });

      stream.on("data", (chunk: Buffer) => {
        const pcm = this.decodeToPcm(new Uint8Array(chunk));
        this.manager.ingestPcmFrame(params.accountId, pcm);
      });

      stream.on("end", () => {
        this.manager.commitUtterance(params.accountId);
      });

      stream.on("error", () => {
        this.manager.commitUtterance(params.accountId);
      });
    };

    params.connection.receiver.speaking.on("start", speakingHandler);

    this.#entries.set(params.accountId, {
      accountId: params.accountId,
      connection: params.connection,
      player: params.player,
      speakingHandler,
    });
  }

  detach(accountId: string): void {
    const existing = this.#entries.get(accountId);
    if (!existing) {
      return;
    }
    existing.connection.receiver.speaking.off("start", existing.speakingHandler);
    this.#entries.delete(accountId);
  }

  destroy(): void {
    for (const accountId of this.#entries.keys()) {
      this.detach(accountId);
    }
  }
}
