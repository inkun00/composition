import { FileDown, Music2, X } from "lucide-react";
import { useEffect } from "react";
import "./ScoreExportDialog.css";

type Props = Readonly<{
  onCancel: () => void;
  onSelect: (includeAccompaniment: boolean) => void;
}>;

export default function ScoreExportDialog({ onCancel, onSelect }: Props) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div className="score-export-overlay" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="score-export-dialog" role="dialog" aria-modal="true"
        aria-labelledby="score-export-title" data-testid="score-export-dialog">
        <button type="button" className="score-export-close" aria-label="악보 저장 창 닫기"
          onClick={onCancel}><X size={19} aria-hidden="true" /></button>
        <header>
          <span><FileDown size={17} aria-hidden="true" /> 악보 저장</span>
          <h2 id="score-export-title">어떤 악보로 저장할까요?</h2>
          <p>노래를 부를 때 필요한 내용에 맞춰 골라 보세요.</p>
        </header>
        <div className="score-export-options">
          <button type="button" data-testid="score-export-without-accompaniment"
            onClick={() => onSelect(false)}>
            <span className="score-export-option-icon">🎼</span>
            <strong>반주 미포함</strong>
            <small>가락과 가사를 중심으로 깔끔하게 저장해요.</small>
            <em>악보만 연습할 때</em>
          </button>
          <button type="button" data-testid="score-export-with-accompaniment"
            onClick={() => onSelect(true)}>
            <span className="score-export-option-icon"><Music2 size={29} aria-hidden="true" /></span>
            <strong>반주 포함</strong>
            <small>고른 반주와 악기 정보도 악보에 함께 적어요.</small>
            <em>함께 연주할 때</em>
          </button>
        </div>
        <footer>
          <button type="button" onClick={onCancel}>취소</button>
        </footer>
      </section>
    </div>
  );
}
