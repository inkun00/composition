import { useEffect, useRef, useState } from "react";
import type { AccompanimentOptions, PlaybackMeasure } from "../audio/accompanimentScore";
import type { InstrumentId } from "../music/instruments";
import { exportMusicVideoMp4 } from "../video/exportMusicVideoMp4";
import type { LyricVideoPlan } from "../video/lyricVideoPlan";
import { getMusicVideoMeasures, validateMusicVideoScenes, type MusicVideoScene } from "../video/musicVideoModel";
import { matchingMusicVideoRecording } from "../video/musicVideoRecording";

type Options = Readonly<{
  audioUrl: string;
  plan: LyricVideoPlan | null;
  scenes: readonly MusicVideoScene[];
  measures: readonly PlaybackMeasure[];
  title: string;
  composer: string;
  instrumentId: InstrumentId;
  bpm: number;
  accompaniment: AccompanimentOptions;
  complete: boolean;
  disabled: boolean;
  fileName: string;
  onStatus: (message: string) => void;
}>;

type Job = Readonly<{
  abort: AbortController;
  audioUrl: string;
  plan: LyricVideoPlan;
}>;

function match(options: Options) {
  return matchingMusicVideoRecording(options.audioUrl, options.plan, options.measures,
    options.bpm, options.instrumentId, options.accompaniment);
}

function videoUnavailable(options: Options): string | null {
  if (!options.audioUrl) return "먼저 노래를 녹음해 주세요.";
  if (!options.complete) return "모든 마디의 박자를 완성하면 뮤직비디오를 저장할 수 있어요.";
  if (!match(options)) return "녹음한 뒤 곡이 바뀌었어요. 현재 곡으로 다시 녹음해 주세요.";
  if (!options.scenes.length) return "뮤직비디오 장면을 먼저 만들어 주세요.";
  try {
    return validateMusicVideoScenes(options.scenes, getMusicVideoMeasures(options.measures, options.bpm), options.bpm);
  } catch (error) {
    return error instanceof Error ? error.message : "뮤직비디오 장면과 노래를 다시 확인해 주세요.";
  }
}

function download(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
}

/** The current processed recording is the sole audio source for either file choice. */
export function useRecordingFileExport(options: Options) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const opened = useRef(false);
  const job = useRef<Job | null>(null);
  const mounted = useRef(true);
  const latest = useRef(options);
  const generatedUrls = useRef(new Map<string, number>());
  latest.current = options;

  function currentSource(currentJob: Job) {
    const current = latest.current;
    return current.audioUrl === currentJob.audioUrl && current.plan === currentJob.plan &&
      current.complete && Boolean(match(current));
  }

  function notify(message: string) {
    if (!mounted.current) return;
    setStatus(message);
    latest.current.onStatus(message);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      job.current?.abort.abort();
      for (const [url, timer] of generatedUrls.current) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      generatedUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    if (job.current && !currentSource(job.current)) job.current.abort.abort();
    if (!options.audioUrl && !job.current) {
      opened.current = false;
      setOpen(false);
    }
  }, [options.audioUrl, options.plan, options.complete, options.measures,
    options.bpm, options.instrumentId, options.accompaniment]);

  function show() {
    if (job.current || !latest.current.audioUrl || latest.current.disabled) return;
    opened.current = true;
    setOpen(true);
    setProgress(0);
    setStatus("");
  }

  function close() {
    if (job.current) return;
    opened.current = false;
    setOpen(false);
  }

  function saveMp3() {
    const current = latest.current;
    if (!opened.current || job.current || !current.audioUrl || current.disabled) return;
    try {
      download(current.audioUrl, current.fileName);
      close();
      notify("녹음한 노래를 MP3 파일로 저장했어요.");
    } catch {
      notify("MP3 파일을 저장하지 못했어요. 다시 눌러 주세요.");
    }
  }

  async function saveMp4() {
    const current = latest.current;
    if (!opened.current || job.current || !current.audioUrl || current.disabled) return;
    const reason = videoUnavailable(current);
    const recording = match(current);
    if (reason || !recording) {
      notify(reason ?? "현재 곡으로 다시 녹음해 주세요.");
      return;
    }
    const currentJob = { abort: new AbortController(), audioUrl: recording.audioUrl, plan: recording.plan };
    job.current = currentJob;
    setBusy(true);
    setProgress(0);
    notify("녹음한 노래와 뮤직비디오를 합치고 있어요.");
    try {
      const blob = await exportMusicVideoMp4({
        title: current.title, composer: current.composer, measures: current.measures,
        instrumentId: current.instrumentId, bpm: current.bpm, accompaniment: current.accompaniment,
        scenes: current.scenes, animated: true, recording
      }, (value) => {
        if (mounted.current && !currentJob.abort.signal.aborted && currentSource(currentJob)) setProgress(value);
      }, currentJob.abort.signal);
      if (!mounted.current) return;
      if (!currentSource(currentJob)) {
        notify("녹음 파일이나 곡이 바뀌어 영상 만들기를 멈췄어요. 다시 선택해 주세요.");
        return;
      }
      if (currentJob.abort.signal.aborted) {
        notify("영상 만들기를 취소했어요. 녹음과 그림은 그대로 남아 있어요.");
        return;
      }
      if (!blob) throw new Error("다른 연주나 녹음이 끝난 뒤 다시 저장해 주세요.");
      const url = URL.createObjectURL(blob);
      generatedUrls.current.set(url, window.setTimeout(() => {
        URL.revokeObjectURL(url);
        generatedUrls.current.delete(url);
      }, 60_000));
      download(url, `${current.fileName.replace(/\.mp3$/i, "")}-뮤직비디오.mp4`);
      setProgress(100);
      opened.current = false;
      setOpen(false);
      notify("녹음한 노래를 합친 뮤직비디오 MP4를 저장했어요.");
    } catch (error) {
      if (!mounted.current) return;
      notify(!currentSource(currentJob) ? "녹음 파일이나 곡이 바뀌어 영상 만들기를 멈췄어요. 다시 선택해 주세요."
        : currentJob.abort.signal.aborted || error instanceof DOMException && error.name === "AbortError"
          ? "영상 만들기를 취소했어요. 녹음과 그림은 그대로 남아 있어요."
          : error instanceof Error ? error.message : "뮤직비디오를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (job.current === currentJob) {
        job.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  }

  return { open, show, close, busy, progress, status, videoUnavailableReason: videoUnavailable(options),
    saveMp3, saveMp4, cancel: () => job.current?.abort.abort() };
}

export type RecordingFileExportController = ReturnType<typeof useRecordingFileExport>;
