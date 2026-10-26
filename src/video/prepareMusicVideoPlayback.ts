import { renderOfflineBackingAudio } from "../audio/backingExport";
import type { AccompanimentOptions, PlaybackMeasure } from "../audio/accompanimentScore";
import type { InstrumentId } from "../music/instruments";
import type { LyricVideoPlan } from "./lyricVideoPlan";
import { buildMusicVideoPlan, getMusicVideoMeasures, isIntroScene, validateMusicVideoScenes, withMusicVideoMeasureIndices,
  type MusicVideoPlan, type MusicVideoScene } from "./musicVideoModel";
import { ensureSceneVectorEngine } from "./sceneVectorEngine";

export type MusicVideoExportOptions = Readonly<{
  measures: readonly PlaybackMeasure[];
  instrumentId: InstrumentId;
  bpm: number;
  accompaniment: AccompanimentOptions;
  scenes: readonly MusicVideoScene[];
  animated: boolean;
  title: string;
  composer?: string;
  /** The caller supplies this only while its recording snapshot still matches the song. */
  recording?: Readonly<{ audioUrl: string; plan: LyricVideoPlan }>;
}>;

export type PreparedMusicVideoPlayback = Readonly<{
  audio: string | AudioBuffer;
  plan: MusicVideoPlan;
  duration: number;
}>;

export function checkMusicVideoPlaybackAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("뮤직비디오 준비를 멈췄어요.", "AbortError");
}

/** Keep validation before the audio lock as well as before preparing a direct preview. */
export function validateMusicVideoPlaybackOptions(options: MusicVideoExportOptions, signal?: AbortSignal): readonly MusicVideoScene[] {
  checkMusicVideoPlaybackAbort(signal);
  if (!Number.isFinite(options.bpm) || options.bpm <= 0) throw new Error("노래의 빠르기를 다시 설정해 주세요.");
  const error = validateMusicVideoScenes(options.scenes, getMusicVideoMeasures(options.measures, options.bpm), options.bpm);
  if (error) throw new Error(error);
  return options.animated ? options.scenes : options.scenes.map((scene) => ({ ...scene, choreography: undefined }));
}

/** Callers own the audio lock. Preview and MP4 share the exact intro, outro, recording and scene plan. */
export async function prepareMusicVideoPlayback(options: MusicVideoExportOptions, signal?: AbortSignal,
  onProgress: (percent: number) => void = () => undefined): Promise<PreparedMusicVideoPlayback> {
  const scenes = validateMusicVideoPlaybackOptions(options, signal);
  onProgress(2);
  if (options.animated && options.scenes.some((scene) => !isIntroScene(scene) && scene.choreography?.actions.length &&
    !scene.elements.some((element) => element.motion !== undefined))) {
    await ensureSceneVectorEngine(signal);
    checkMusicVideoPlaybackAbort(signal);
  }
  let audio: string | AudioBuffer;
  let introSeconds: number;
  let duration: number;
  if (options.recording) {
    audio = options.recording.audioUrl;
    const frames = options.recording.plan.frames;
    introSeconds = frames.find((frame) => frame.measureIndex !== null)?.startSeconds ?? 0;
    duration = frames.at(-1)?.endSeconds ?? 0;
    if (!audio || !options.recording.plan.hasLyrics || duration <= introSeconds) {
      throw new Error("녹음 파일과 가사를 다시 확인해 주세요.");
    }
  } else {
    const rendered = await renderOfflineBackingAudio(options.measures, options.instrumentId,
      options.bpm, options.accompaniment, signal, { includeMelody: true });
    audio = rendered.audioBuffer;
    introSeconds = rendered.introSeconds;
    duration = rendered.audioBuffer.duration;
  }
  checkMusicVideoPlaybackAbort(signal);
  onProgress(35);
  const generated = buildMusicVideoPlan(options.title, options.measures, options.bpm, introSeconds, duration, scenes, options.composer);
  const plan = options.recording ? { ...generated,
    lyrics: withMusicVideoMeasureIndices(options.recording.plan, options.measures) } : generated;
  return { audio, plan, duration };
}
