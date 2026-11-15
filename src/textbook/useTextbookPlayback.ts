import { useEffect, useRef, useState } from "react";
import { playComposition, type PlaybackMeasure } from "../audio/player";
import { toNumber } from "../music/rational";

type Preview = number | "all" | null;
type ActiveNote = { bar: number; id: string } | null;

export function useTextbookPlayback() {
  const request = useRef<AbortController | null>(null);
  const frame = useRef<number | null>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [sounding, setSounding] = useState<ActiveNote>(null);
  const [error, setError] = useState("");

  function cancelFrame() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }

  function cancel() {
    cancelFrame();
    const previous = request.current;
    request.current = null;
    previous?.abort();
  }

  function stop() {
    cancel();
    setPreview(null);
    setSounding(null);
  }

  useEffect(() => cancel, []);

  async function listen(measures: readonly PlaybackMeasure[], previewId: Exclude<Preview, null>, bpm: number) {
    if (request.current) return;
    const current = new AbortController();
    request.current = current;
    setPreview(previewId);
    setError("");
    let beat = 0;
    const events = measures.flatMap((bar, index) => bar.notes.map((note) => {
      const start = beat;
      beat += toNumber(note.duration);
      return { start, end: beat, bar: bar.measureIndex ?? index, id: note.id };
    }));
    try {
      const duration = await playComposition(measures, "piano", bpm, undefined, false, {
        melodyOnly: true,
        signal: current.signal,
        onStarted: ({ getElapsedSeconds }) => {
          function refresh() {
            if (request.current !== current) return;
            const position = getElapsedSeconds() * bpm / 60;
            const event = events.find(({ start, end }) => start <= position && position < end);
            setSounding((previous) => previous?.id === event?.id && previous?.bar === event?.bar
              ? previous : event ? { id: event.id, bar: event.bar } : null);
            frame.current = requestAnimationFrame(refresh);
          }
          refresh();
        },
        onEnded: () => {
          if (request.current !== current) return;
          cancelFrame();
          request.current = null;
          setPreview(null);
          setSounding(null);
        }
      });
      if (duration === null && !current.signal.aborted && (!request.current || request.current === current)) {
        stop();
        setError("재생을 시작하지 못했어요. 잠시 후 다시 눌러 주세요.");
      }
    } catch {
      if (current.signal.aborted || (request.current && request.current !== current)) return;
      stop();
      setError("소리를 불러오지 못했어요. 기기의 소리를 확인하고 다시 눌러 주세요.");
    }
  }

  return { preview, sounding, error, listen, stop };
}
