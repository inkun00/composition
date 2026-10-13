import { useEffect, useRef, useState } from "react";
import {
  encodePracticeMp3,
  exportPracticeMp4,
  practiceAudioFileName,
  practiceMeasureAudioInput,
  practiceNoteAtTime,
  practiceNotesAtTime,
  renderPracticeAudio,
  type PracticeAudioInput,
  type PracticeRenderedAudio
} from "./practiceAudio";

type Session = {
  controller: AbortController;
  context: AudioContext | null;
  source: AudioBufferSourceNode | null;
  animationFrame: number | null;
};

function disposeSession(session: Session): void {
  session.controller.abort();
  if (session.animationFrame !== null) cancelAnimationFrame(session.animationFrame);
  if (session.source) {
    session.source.onended = null;
    try { session.source.stop(); } catch { /* Already stopped or not started. */ }
    session.source.disconnect();
  }
  if (session.context && session.context.state !== "closed") {
    void session.context.close().catch(() => undefined);
  }
}

function fallbackMessage(rendered: PracticeRenderedAudio): string {
  return rendered.usedFallback ? " 악기 샘플을 불러오지 못해 기본 연주 소리를 사용했어요." : "";
}

export function usePracticeAudio(input: PracticeAudioInput) {
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);
  const [playingNoteIds, setPlayingNoteIds] = useState<readonly string[]>([]);
  const [previewMeasureIndex, setPreviewMeasureIndex] = useState<number | null>(null);
  const [previewScoreIndex, setPreviewScoreIndex] = useState<number | null>(null);
  const [previewRhythmMixing, setPreviewRhythmMixing] = useState(false);
  const mounted = useRef(false);
  const activeSession = useRef<Session | null>(null);
  const cached = useRef<{ key: string; rendered: PracticeRenderedAudio } | null>(null);
  const downloadUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (activeSession.current) disposeSession(activeSession.current);
      activeSession.current = null;
      cached.current = null;
      for (const [url, timer] of downloadUrls.current) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      downloadUrls.current.clear();
    };
  }, []);

  function isCurrent(session: Session): boolean {
    return mounted.current && activeSession.current === session && !session.controller.signal.aborted;
  }

  function begin(measureIndex: number | null = null, scoreIndex: number | null = null, rhythmMix = false): Session | null {
    // A ref closes the gap between two clicks before React renders busy=true.
    if (!mounted.current || activeSession.current) return null;
    const session: Session = {
      controller: new AbortController(), context: null, source: null, animationFrame: null
    };
    activeSession.current = session;
    setBusy(true);
    setProgress(0);
    setPlayingNoteId(null);
    setPlayingNoteIds([]);
    setPreviewMeasureIndex(measureIndex);
    setPreviewScoreIndex(scoreIndex);
    setPreviewRhythmMixing(rhythmMix);
    return session;
  }

  function finish(session: Session, message?: string): void {
    if (!isCurrent(session)) return;
    activeSession.current = null;
    disposeSession(session);
    setBusy(false);
    setPlaying(false);
    setPlayingNoteId(null);
    setPlayingNoteIds([]);
    setPreviewMeasureIndex(null);
    setPreviewScoreIndex(null);
    setPreviewRhythmMixing(false);
    if (message) setStatus(message);
  }

  async function prepare(
    session: Session,
    preparationShare: number,
    renderInput: PracticeAudioInput = input,
    measureIndex: number | null = null,
    scoreIndex: number | null = null,
    rhythmMix = false
  ): Promise<PracticeRenderedAudio> {
    const key = JSON.stringify({
      scope: rhythmMix ? "rhythm-mix" : measureIndex === null ? "all" : { measureIndex, scoreIndex },
      measures: renderInput.measures,
      rhythmLayers: renderInput.rhythmLayers,
      meter: renderInput.meter,
      bpm: renderInput.bpm,
      instrument: renderInput.step === "rhythm" ? renderInput.rhythmInstrumentId : renderInput.melodyInstrumentId,
      step: renderInput.step
    });
    if (cached.current?.key === key) {
      if (isCurrent(session)) setProgress(preparationShare);
      return cached.current.rendered;
    }
    const rendered = await renderPracticeAudio(renderInput, {
      signal: session.controller.signal,
      onProgress: (percent) => {
        if (isCurrent(session)) setProgress(Math.round(percent * preparationShare / 100));
      }
    });
    if (isCurrent(session)) cached.current = { key, rendered };
    return rendered;
  }

  function stop(): void {
    const session = activeSession.current;
    if (!session) return;
    activeSession.current = null;
    disposeSession(session);
    if (!mounted.current) return;
    setBusy(false);
    setPlaying(false);
    setProgress(0);
    setPlayingNoteId(null);
    setPlayingNoteIds([]);
    setPreviewMeasureIndex(null);
    setPreviewScoreIndex(null);
    setPreviewRhythmMixing(false);
    setStatus("연주와 파일 만들기를 멈췄어요.");
  }

  async function playPreview(measureIndex: number | null, scoreIndex: number | null = null, rhythmMix = false): Promise<void> {
    const session = begin(measureIndex, scoreIndex, rhythmMix);
    if (!session) return;
    setStatus("연주할 악기를 준비하고 있어요.");
    try {
      const renderInput = measureIndex === null
        ? rhythmMix ? { ...input, step: "rhythm" as const } : input
        : practiceMeasureAudioInput(input, measureIndex, scoreIndex ?? 0);
      // Create and resume synchronously inside the click, before awaiting rendering.
      session.context = new AudioContext();
      const resuming = session.context.resume();
      await resuming;
      if (!isCurrent(session)) return;
      const rendered = await prepare(session, 100, renderInput, measureIndex, scoreIndex, rhythmMix);
      if (!isCurrent(session)) return;
      const context = session.context;
      const source = context.createBufferSource();
      session.source = source;
      source.buffer = rendered.buffer;
      source.connect(context.destination);
      const start = context.currentTime;
      source.onended = () => {
        if (!isCurrent(session)) return;
        setProgress(100);
        const label = rhythmMix ? "리듬 함께 듣기 " : measureIndex === null ? "" :
          `${scoreIndex ? `${scoreIndex + 1}번 악보 ` : ""}${measureIndex + 1}마디 리듬 `;
        finish(session, `${label}미리듣기를 마쳤어요.${fallbackMessage(rendered)}`);
      };
      const update = () => {
        if (!isCurrent(session)) return;
        const elapsed = Math.max(0, context.currentTime - start);
        setProgress(Math.min(100, Math.round(elapsed / rendered.timeline.durationSeconds * 100)));
        setPlayingNoteId(practiceNoteAtTime(rendered.timeline, elapsed));
        setPlayingNoteIds(practiceNotesAtTime(rendered, elapsed));
        session.animationFrame = requestAnimationFrame(update);
      };
      source.start(start);
      setBusy(false);
      setPlaying(true);
      const label = rhythmMix ? "여러 악보의 리듬을 함께" : measureIndex === null
        ? `내가 만든 ${renderInput.step === "rhythm" ? "리듬" : "가락"}`
        : `${scoreIndex ? `${scoreIndex + 1}번 악보 ` : ""}${measureIndex + 1}마디에 입력한 리듬`;
      setStatus(`${label}${rhythmMix ? " " : "을 "}듣고 있어요.${fallbackMessage(rendered)}`);
      update();
    } catch (error) {
      finish(session, error instanceof Error
        ? `미리듣기를 시작하지 못했어요. ${error.message}`
        : "미리듣기를 시작하지 못했어요. 브라우저에서 소리 재생을 허용해 주세요.");
    }
  }

  function preview(): Promise<void> {
    return playPreview(null);
  }

  function previewMeasure(index: number, scoreIndex = 0): Promise<void> {
    return playPreview(index, scoreIndex);
  }

  function previewRhythmMix(): Promise<void> {
    return playPreview(null, null, true);
  }

  function download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    try {
      link.click();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    } finally {
      link.remove();
    }
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      downloadUrls.current.delete(url);
    }, 60_000);
    downloadUrls.current.set(url, timer);
  }

  async function save(format: "mp3" | "mp4"): Promise<void> {
    const session = begin();
    if (!session) return;
    setStatus(format === "mp4" ? "검은 화면으로 연습 곡 MP4를 만들고 있어요." : "연습 곡 MP3를 만들고 있어요.");
    try {
      const rendered = await prepare(session, 45);
      if (!isCurrent(session)) return;
      const options = {
        signal: session.controller.signal,
        onProgress: (percent: number) => {
          if (isCurrent(session)) setProgress(45 + Math.round(percent * 0.55));
        }
      };
      const blob = format === "mp3"
        ? await encodePracticeMp3(rendered.buffer, options)
        : await exportPracticeMp4(rendered, input, options);
      if (!isCurrent(session)) return;
      download(blob, practiceAudioFileName(input.title, format));
      setProgress(100);
      finish(session, `${format.toUpperCase()} 파일을 저장했어요.${fallbackMessage(rendered)}`);
    } catch (error) {
      finish(session, error instanceof Error ? error.message : "파일을 만들지 못했어요. 다시 시도해 주세요.");
    }
  }

  return {
    busy,
    playing,
    progress,
    status,
    playingNoteId,
    playingNoteIds,
    previewMeasureIndex,
    previewScoreIndex,
    previewRhythmMixing,
    preview,
    previewMeasure,
    previewRhythmMix,
    stop,
    save
  };
}
