import { useEffect, useRef, useState } from "react";
import { exportBackingCompositionMp3, type AccompanimentOptions, type PlaybackMeasure } from "../audio/player";
import type { InstrumentId } from "../music/instruments";

export type CompositionExportFormat = "mp3" | "mp4";
export type CompositionExportPhase = "idle" | "working" | "done" | "error";

type Options = Readonly<{
  measures: readonly PlaybackMeasure[];
  complete: boolean;
  title: string;
  instrumentId: InstrumentId;
  bpm: number;
  accompaniment: AccompanimentOptions;
  disabled: boolean;
  onStatus: (message: string) => void;
}>;

function download(blob: Blob, title: string, format: CompositionExportFormat) {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "maeum-melody";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeTitle}-${format === "mp4" ? "가사포함" : "반주음악"}.${format}`;
  try {
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** One owner for composition audio/video export, including the synchronous job lock. */
export function useCompositionMediaExport(options: Options) {
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState<CompositionExportFormat | null>(null);
  const [phase, setPhase] = useState<CompositionExportPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const job = useRef<Readonly<{ format: CompositionExportFormat; abort: AbortController }> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; job.current?.abort.abort(); };
  }, []);
  const hasLyrics = options.measures.some((measure) => measure.notes.some((note) =>
    note.pitch !== null && Boolean(note.lyric?.trim())));

  async function save(nextFormat: CompositionExportFormat) {
    if (job.current) return;
    if (!options.complete) {
      options.onStatus("먼저 모든 마디를 정확한 박자로 완성해 주세요.");
      return;
    }
    if (options.disabled) {
      options.onStatus("다른 연주나 저장이 끝난 뒤에 다시 저장해 주세요.");
      return;
    }
    if (nextFormat === "mp4" && !hasLyrics) {
      options.onStatus("가사를 한 글자 이상 입력하면 가사 포함 MP4를 저장할 수 있어요.");
      return;
    }
    const currentJob = { format: nextFormat, abort: new AbortController() };
    job.current = currentJob;
    setFormat(nextFormat);
    setPhase("working");
    setProgress(0);
    setExporting(true);
    const updateStatus = (message: string) => {
      if (!mounted.current) return;
      setStatus(message);
      options.onStatus(message);
    };
    updateStatus(nextFormat === "mp4" ? "반주와 가사가 함께 나오는 영상을 만들고 있어요."
      : "인트로와 아웃트로가 들어간 반주 음악을 만들고 있어요.");
    let feedbackMs = 0;
    try {
      const blob = nextFormat === "mp3"
        ? await exportBackingCompositionMp3(options.measures, options.instrumentId, options.bpm, options.accompaniment)
        : await (await import("../video/exportCompositionLyricsMp4")).exportCompositionLyricsMp4(
          options.measures, options.instrumentId, options.bpm, options.accompaniment,
          (value) => { if (mounted.current) setProgress(value); }, currentJob.abort.signal,
          { title: options.title }
        );
      if (!mounted.current) return;
      if (currentJob.abort.signal.aborted) {
        updateStatus("가사 영상 만들기를 취소했어요.");
        return;
      }
      if (!blob) throw new Error("다른 연주나 녹음이 끝난 뒤에 다시 저장해 주세요.");
      download(blob, options.title, nextFormat);
      setProgress(100);
      setPhase("done");
      updateStatus(nextFormat === "mp4" ? "가사 포함 MP4를 저장했어요." : "반주 음악 MP3를 저장했어요.");
      feedbackMs = 900;
    } catch (error) {
      if (!mounted.current) return;
      if (currentJob.abort.signal.aborted || error instanceof DOMException && error.name === "AbortError") {
        updateStatus("가사 영상 만들기를 취소했어요.");
      } else {
        console.error(error);
        setPhase("error");
        updateStatus(error instanceof Error ? error.message : "파일을 만드는 중 문제가 생겼어요. 다시 시도해 주세요.");
        feedbackMs = 1200;
      }
    } finally {
      if (feedbackMs > 0 && mounted.current) await new Promise((resolve) => window.setTimeout(resolve, feedbackMs));
      if (job.current === currentJob) {
        job.current = null;
        if (mounted.current) {
          setExporting(false);
          setPhase("idle");
          setFormat(null);
        }
      }
    }
  }

  return { exporting, format, phase, progress, status, hasLyrics,
    saveMp3: () => save("mp3"), saveMp4: () => save("mp4"), cancel: () => {
      if (job.current?.format === "mp4") job.current.abort.abort();
    } };
}

export type CompositionMediaExportController = ReturnType<typeof useCompositionMediaExport>;
