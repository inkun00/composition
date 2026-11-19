import { useId } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { COMPOSITION_EXPORT_MIX_LABELS, type CompositionExportFormat, type CompositionExportMix } from "../hooks/useCompositionMediaExport";
import { ArrowRight, X } from "./AppArtworkIcons";
import AppArtwork from "./AppArtwork";

type Props = Readonly<{
  format: CompositionExportFormat;
  onSelect: (mix: CompositionExportMix) => void;
  onClose: () => void;
}>;

const choices = [
  { id: "backing", artwork: "rhythm-stage", description: "반주만 담아요." },
  { id: "performance", artwork: "melody-stage", description: "악기로 연주한 가락과 반주를 함께 담아요." }
] as const;

export default function CompositionExportChoiceDialog({ format, onSelect, onClose }: Props) {
  const id = useId();
  const dialog = useDialogFocus<HTMLElement>();
  const isVideo = format === "mp4";
  return createPortal(
    <div className="composition-export-choice-overlay" role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialog} className="composition-export-choice-dialog" role="dialog" aria-modal="true" tabIndex={-1}
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}>
        <header>
          <h2 id={`${id}-title`}>{isVideo ? "가사 포함 영상" : "음악 저장"}</h2>
          <button type="button" className="composition-export-choice-close" aria-label="저장 선택 닫기" onClick={onClose}>
            <X size={24} />
          </button>
        </header>
        <p id={`${id}-help`}>{isVideo ? "가사 영상(MP4)에 넣을 음악을 골라요." : "MP3로 저장할 음악을 골라요."}</p>
        <div className="composition-export-choice-options">
          {choices.map(({ id: mix, artwork, description }) => (
            <button key={mix} type="button" className="composition-export-choice-option"
              data-testid={`composition-source-${mix}`} aria-labelledby={`${id}-${mix}-label`}
              aria-describedby={`${id}-${mix}-description`} onClick={() => onSelect(mix)}>
              <AppArtwork name={artwork} size={48} />
              <span>
                <strong id={`${id}-${mix}-label`}>{COMPOSITION_EXPORT_MIX_LABELS[mix]}</strong>
                <span id={`${id}-${mix}-description`}>{description}</span>
              </span>
              <ArrowRight size={20} />
            </button>
          ))}
        </div>
      </section>
    </div>, document.body
  );
}
