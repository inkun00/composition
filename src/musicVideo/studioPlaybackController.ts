import { runExclusiveAudioExport } from "../audio/player";
import { checkMusicVideoPlaybackAbort, prepareMusicVideoPlayback,
  type MusicVideoExportOptions } from "../video/prepareMusicVideoPlayback";
import type { MusicVideoPlan } from "../video/musicVideoModel";

export type StudioPlaybackState = Readonly<{
  plan: MusicVideoPlan | null;
  duration: number;
  time: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
}>;

export const INITIAL_STUDIO_PLAYBACK: StudioPlaybackState = {
  plan: null, duration: 0, time: 0, playing: false, loading: false, error: null
};

/** The audio clock owns time; animation frames only publish transport updates. */
export class StudioPlaybackController {
  private state: StudioPlaybackState = INITIAL_STUDIO_PLAYBACK;
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private pending: Promise<void> | null = null;
  private readonly abort = new AbortController();
  private disposed = false;
  private wantsPlayback = false;
  private offset = 0;
  private startedAt = 0;
  private animation = 0;
  private updatedAt = 0;

  constructor(private readonly options: MusicVideoExportOptions,
    private readonly onState: (state: StudioPlaybackState) => void) {}

  getCurrentTime = (): number => {
    const elapsed = this.state.playing && this.context ? Math.max(0, this.context.currentTime - this.startedAt) : 0;
    return Math.max(0, Math.min(this.state.duration, this.offset + elapsed));
  };

  play = (): Promise<void> => {
    if (this.disposed) return Promise.resolve();
    this.wantsPlayback = true;
    if (this.pending) return this.pending;
    let resumed: Promise<void>;
    try {
      // Both creation and resume happen synchronously in the user's play/restart gesture.
      if (!this.context || this.context.state === "closed") {
        const AudioContextClass = globalThis.AudioContext ??
          (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) throw new Error("이 브라우저에서는 음악 미리보기를 사용할 수 없어요.");
        this.context = new AudioContextClass();
      }
      resumed = this.context.resume();
    } catch (error) {
      this.fail(error);
      return Promise.resolve();
    }
    if (this.state.playing) return resumed.catch((error) => this.fail(error));
    this.publish({ loading: !this.buffer, error: null });
    const task = this.prepareAndPlay(resumed);
    this.pending = task;
    void task.finally(() => {
      if (this.pending === task) this.pending = null;
    });
    return task;
  };

  pause = (): void => {
    if (this.disposed) return;
    this.wantsPlayback = false;
    this.offset = this.getCurrentTime();
    this.stopSource();
    this.publish({ playing: false, time: this.offset });
  };

  seek = (seconds: number): void => {
    if (this.disposed) return;
    const wasPlaying = this.state.playing;
    this.stopSource();
    this.offset = Math.max(0, Math.min(this.state.duration, Number.isFinite(seconds) ? seconds : 0));
    this.publish({ playing: false, time: this.offset });
    if (wasPlaying && this.offset < this.state.duration) {
      try {
        this.startSource();
      } catch (error) {
        this.fail(error);
      }
    } else if (this.offset === this.state.duration) {
      this.wantsPlayback = false;
    }
  };

  restart = (): Promise<void> => {
    this.seek(0);
    return this.play();
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.wantsPlayback = false;
    this.abort.abort();
    this.stopSource();
    this.closeContext();
    this.buffer = null;
  };

  private publish(next: Partial<StudioPlaybackState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...next };
    this.onState(this.state);
  }

  private async prepareAndPlay(resumed: Promise<void>): Promise<void> {
    try {
      await resumed;
      checkMusicVideoPlaybackAbort(this.abort.signal);
      if (!this.buffer) {
        const prepared = await runExclusiveAudioExport(async () => {
          const playback = await prepareMusicVideoPlayback(this.options, this.abort.signal);
          const buffer = typeof playback.audio === "string" ? await this.decodeRecording(playback.audio) : playback.audio;
          checkMusicVideoPlaybackAbort(this.abort.signal);
          return { playback, buffer };
        });
        checkMusicVideoPlaybackAbort(this.abort.signal);
        if (!prepared) throw new Error("다른 연주나 녹음이 끝난 뒤 미리보기를 다시 재생해 주세요.");
        const duration = Math.min(prepared.playback.duration, prepared.buffer.duration);
        if (!Number.isFinite(duration) || duration <= 0) throw new Error("음악의 재생 길이를 확인해 주세요.");
        this.buffer = prepared.buffer;
        this.publish({ plan: prepared.playback.plan, duration, loading: false });
      }
      if (this.wantsPlayback) {
        if (this.offset >= this.state.duration) this.offset = 0;
        this.startSource();
      } else {
        this.publish({ loading: false, time: this.offset });
      }
    } catch (error) {
      if (!this.disposed) this.fail(error);
    }
  }

  private async decodeRecording(url: string): Promise<AudioBuffer> {
    const response = await fetch(url, { signal: this.abort.signal });
    if (!response.ok) throw new Error("녹음 파일을 읽지 못했어요. 다시 녹음해 주세요.");
    const data = await response.arrayBuffer();
    checkMusicVideoPlaybackAbort(this.abort.signal);
    const decoded = await this.context!.decodeAudioData(data);
    checkMusicVideoPlaybackAbort(this.abort.signal);
    return decoded;
  }

  private startSource(): void {
    if (!this.buffer || !this.context || this.disposed) return;
    this.stopSource();
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      if (this.source === source && !this.disposed) this.finish();
    };
    this.source = source;
    this.startedAt = this.context.currentTime;
    source.start(0, this.offset, this.state.duration - this.offset);
    this.updatedAt = 0;
    this.publish({ playing: true, loading: false, time: this.offset });
    this.animation = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    if (this.disposed || !this.state.playing) return;
    const time = this.getCurrentTime();
    if (time >= this.state.duration) {
      this.finish();
      return;
    }
    const now = performance.now();
    if (now - this.updatedAt >= 100) {
      this.updatedAt = now;
      this.publish({ time });
    }
    this.animation = requestAnimationFrame(this.tick);
  };

  private finish(): void {
    this.offset = this.state.duration;
    this.wantsPlayback = false;
    this.stopSource();
    this.publish({ playing: false, time: this.offset });
  }

  private stopSource(): void {
    cancelAnimationFrame(this.animation);
    this.animation = 0;
    const source = this.source;
    this.source = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // A source can already have reached its scheduled end.
    }
    source.disconnect();
  }

  private closeContext(): void {
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }

  private fail(error: unknown): void {
    this.wantsPlayback = false;
    this.offset = this.getCurrentTime();
    this.stopSource();
    this.closeContext();
    this.publish({ playing: false, loading: false, time: this.offset,
      error: error instanceof Error ? error.message : "음악 미리보기를 준비하지 못했어요. 다시 시도해 주세요." });
  }
}
