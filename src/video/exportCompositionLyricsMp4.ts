import { renderOfflineBackingAudio } from "../audio/backingExport";
import { runExclusiveAudioExport } from "../audio/player";
import type { AccompanimentOptions, PlaybackMeasure } from "../audio/accompanimentScore";
import type { InstrumentId } from "../music/instruments";
import { buildLyricVideoPlan } from "./lyricVideoPlan";
import { exportLyricMp4 } from "./exportLyricMp4";

/** Renders the same accompaniment as MP3, then encodes its original PCM with timed lyrics. */
export async function exportCompositionLyricsMp4(
  measures: readonly PlaybackMeasure[],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  accompaniment?: AccompanimentOptions,
  onProgress: (percent: number) => void = () => undefined,
  signal?: AbortSignal,
  options: Readonly<{ title?: string }> = {}
): Promise<Blob | null> {
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException("영상 만들기를 멈췄어요.", "AbortError");
  };
  checkAbort();
  const hasLyrics = measures.some((measure) => measure.notes.some((note) =>
    note.pitch !== null && Boolean(note.lyric?.trim())));
  if (!hasLyrics) throw new Error("가사를 한 글자 이상 적은 뒤 다시 저장해 주세요.");

  return runExclusiveAudioExport(async () => {
    onProgress(2);
    const { audioBuffer, introSeconds } = await renderOfflineBackingAudio(
      measures, instrumentId, bpm, accompaniment, signal
    );
    checkAbort();
    onProgress(35);
    const plan = buildLyricVideoPlan(options.title ?? "", measures, bpm, introSeconds, audioBuffer.duration);
    const blob = await exportLyricMp4(audioBuffer, plan, (percent) => {
      onProgress(35 + Math.round(percent * .65));
    }, signal);
    checkAbort();
    return blob;
  });
}
