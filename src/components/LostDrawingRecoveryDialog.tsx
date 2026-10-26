import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileMusic, X } from "./AppArtworkIcons";
import { useDialogFocus } from "../hooks/useDialogFocus";
import SceneArt from "../musicVideo/SceneArt";
import type { LostDrawingRecoveryCandidate } from "../music/lostDrawingRecoveryModel";
import "./LostDrawingRecoveryDialog.css";

type Props = Readonly<{
  candidates: readonly LostDrawingRecoveryCandidate[];
  working: boolean;
  scanning: boolean;
  error: string;
  onRestore: (candidate: LostDrawingRecoveryCandidate) => void;
  onDismiss: () => void;
  onClose: () => void;
  onScan: () => void;
}>;

const sourceLabels: Record<LostDrawingRecoveryCandidate["sourceKind"], string> = {
  primary: "이전 작업 기록", backup: "이전 임시 저장", damaged: "오류로 보관된 기록",
  archive: "이 기기의 프로젝트", legacy: "이전 버전의 작업", cloud: "계정 프로젝트"
};

function savedTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0 || Number.isNaN(new Date(value).getTime())) return "저장 시각을 알 수 없는 기록";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

export default function LostDrawingRecoveryDialog(props: Props) {
  const ref = useDialogFocus();
  const [selected, setSelected] = useState(props.candidates[0]?.id ?? "");
  const candidate = props.candidates.find((item) => item.id === selected) ?? props.candidates[0];
  const disabled = props.working || props.scanning;
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  return createPortal(<div className="lost-drawing-overlay" ref={ref} onKeyDown={(event) => {
    if (event.key === "Escape" && !disabled) { event.stopPropagation(); props.onClose(); }
  }}>
    <section className="lost-drawing-dialog" role="dialog" aria-modal="true" aria-labelledby="lost-drawing-title"
      aria-describedby="lost-drawing-description" tabIndex={-1} data-testid="lost-drawing-recovery-dialog">
      <header><span className="lost-drawing-mark"><FileMusic size={25} aria-hidden="true" /></span>
        <div><span className="lost-drawing-eyebrow">그림 복구</span>
          <h2 id="lost-drawing-title">{props.candidates.length ? "이전에 그린 그림을 찾았어요" : "남아 있는 그림 기록 확인"}</h2></div>
        <button type="button" className="lost-drawing-close" aria-label="그림 복구 나중에 하기"
          disabled={disabled} onClick={props.onClose}><X size={21} /></button>
      </header>
      <p id="lost-drawing-description">{props.candidates.length
        ? "남아 있는 기록에서 복구할 그림을 골라 주세요. 현재 작품과 원본 기록은 그대로 보관합니다."
        : props.scanning ? "남아 있는 임시 저장과 프로젝트 기록을 확인하고 있어요."
          : "현재 그림과 다른 복구 가능한 기록을 찾지 못했어요. 같은 브라우저와 계정에서 다시 확인할 수 있어요."}</p>
      <div className="lost-drawing-candidates" role="radiogroup" aria-label="복구할 그림 기록">
        {props.candidates.map((item) => <label key={item.id} className={`lost-drawing-card${item.id === candidate?.id ? " selected" : ""}`}>
          <div className="lost-drawing-choice"><input type="radio" name="lost-drawing-candidate" value={item.id}
            checked={item.id === candidate?.id} onChange={() => setSelected(item.id)} disabled={disabled} />
            <strong>{item.title || "이름 없는 그림"}</strong><span>{sourceLabels[item.sourceKind]}</span></div>
          <div className="lost-drawing-thumbnails">{item.scenes.filter((scene) => scene.elements.length > 0).slice(0, 4).map((scene) =>
            <div key={scene.id}><SceneArt scene={scene} /></div>)}</div>
          <div className="lost-drawing-details"><span>{item.scenes.length}개 장면 · {item.scenes.reduce((sum, scene) => sum + scene.elements.length, 0)}개 선·도형</span>
            <time>{savedTime(item.updatedAt)}</time></div>
          {item.partial && <p className="lost-drawing-partial">기록에서 읽을 수 있는 장면만 복구합니다.</p>}
          {!item.draft && <p className="lost-drawing-partial">노래 전체를 열 수 없어 그림을 현재 곡의 새 사본에 복구합니다.</p>}
        </label>)}
      </div>
      <p className="lost-drawing-note">한 번도 저장되지 않았거나 남은 기록까지 지워진 그림은 복구할 수 없어요.</p>
      {props.error && <p className="lost-drawing-error" role="alert">{props.error}</p>}
      <footer>
        <button type="button" className="lost-drawing-secondary" onClick={props.onScan} disabled={disabled}>
          {props.scanning ? "기록 확인 중…" : "다시 찾기"}</button>
        {candidate ? <>
          <button type="button" className="lost-drawing-secondary" onClick={props.onDismiss} disabled={disabled}>복구하지 않기</button>
          <button type="button" className="lost-drawing-primary" data-testid="restore-lost-drawing"
            onClick={() => props.onRestore(candidate)} disabled={disabled}>
            {props.working ? "복구 중…" : candidate.draft ? "프로젝트 사본으로 복구" : "그림 사본으로 복구"}</button>
        </> : <button type="button" className="lost-drawing-primary" onClick={props.onClose} disabled={disabled}>확인</button>}
      </footer>
    </section>
  </div>, document.body);
}
