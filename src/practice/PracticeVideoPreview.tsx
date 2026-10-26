import { useEffect, useMemo, useRef, useState } from "react";
import { buildPracticeVideoPreviewPlan } from "./practiceVideoPlan";
import { preparePracticeVideoRenderer } from "./practiceVideoRenderer";
import type { PracticeDraft } from "./practiceStorage";
import type { PracticeVideoMode } from "./practiceVideoTypes";

type PracticeVideoPreviewProps = {
  draft: PracticeDraft;
  step: "rhythm" | "melody";
  mode: PracticeVideoMode;
  disabled?: boolean;
};

export default function PracticeVideoPreview({ draft, step, mode, disabled = false }: PracticeVideoPreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<Awaited<ReturnType<typeof preparePracticeVideoRenderer>> | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState("");
  const plan = useMemo(() => {
    try {
      return buildPracticeVideoPreviewPlan({
        measures: draft.measures,
        rhythmLayers: draft.rhythmLayers,
        meter: draft.meter,
        bpm: draft.bpm,
        melodyInstrumentId: draft.melodyInstrumentId,
        rhythmInstrumentId: draft.rhythmInstrumentId,
        title: draft.title,
        mode: draft.mode ?? undefined,
        step
      });
    } catch {
      return null;
    }
  }, [draft, step]);
  const duration = plan?.durationSeconds ?? 0;

  useEffect(() => {
    let cancelled = false;
    renderer.current = null;
    setSeconds(0);
    if (!plan) {
      setStatus("음표를 넣으면 영상 미리보기가 열려요.");
      return;
    }
    setStatus("영상 화면을 준비하고 있어요.");
    void preparePracticeVideoRenderer(plan, mode).then((next) => {
      if (cancelled || !host.current) return;
      renderer.current = next;
      const label = mode === "lyrics" ? "가사" : mode === "bars" ? "막대" : "악보";
      next.canvas.setAttribute("aria-label", `${label} 모드 영상 미리보기`);
      next.canvas.setAttribute("role", "img");
      host.current.replaceChildren(next.canvas);
      next.draw(0);
      setStatus("");
    }).catch(() => {
      if (!cancelled) setStatus("영상 미리보기를 표시하지 못했어요. 저장을 다시 시도하거나 화면을 새로 열어 주세요.");
    });
    return () => {
      cancelled = true;
      renderer.current = null;
      host.current?.replaceChildren();
    };
  }, [plan, mode]);

  function seek(value: number) {
    setSeconds(value);
    renderer.current?.draw(value);
  }

  return (
    <figure className="practice-video-preview">
      <div ref={host} className="practice-video-preview-canvas" />
      {status && <p role="status">{status}</p>}
      <figcaption>영상 미리보기</figcaption>
      <label>미리보기 위치
        <input type="range" aria-label="영상 미리보기 위치" min={0} max={Math.max(0, duration - 0.001)}
          step={0.1} value={seconds} disabled={disabled || duration <= 0 || Boolean(status)}
          onChange={(event) => seek(Number(event.target.value))} />
        <output>{seconds.toFixed(1)} / {duration.toFixed(1)}초</output>
      </label>
    </figure>
  );
}
