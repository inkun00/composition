import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ScanLine, X } from "lucide-react";
import AudiverisInstaller from "./AudiverisInstaller";
import "./AudiverisInstallDialog.css";

type AudiverisInstallDialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onChooseMxl: () => void;
}>;

export default function AudiverisInstallDialog({ open, onClose, onChooseMxl }: AudiverisInstallDialogProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="audiveris-install-dialog-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="audiveris-install-dialog" role="dialog" aria-modal="true"
        aria-labelledby="audiveris-install-dialog-heading" data-testid="audiveris-install-dialog">
        <header>
          <div>
            <span><ScanLine size={15} /> 이미지 악보 준비</span>
            <h2 id="audiveris-install-dialog-heading">Audiveris 설치하고 악보 변환하기</h2>
            <p>사용 중인 기기를 확인해 맞는 공식 설치 파일만 보여드려요.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Audiveris 설치 안내 닫기"
            data-testid="audiveris-install-dialog-close"><X size={20} /></button>
        </header>
        <div className="audiveris-install-dialog-body">
          <AudiverisInstaller onChooseMxl={onChooseMxl} />
        </div>
      </section>
    </div>,
    document.body
  );
}
