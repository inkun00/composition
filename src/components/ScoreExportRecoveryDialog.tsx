import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileMusic, RefreshCw, X } from "./AppArtworkIcons";
import { useDialogFocus } from "../hooks/useDialogFocus";
import "./ScoreExportRecoveryDialog.css";

type Props = Readonly<{
  onSave: () => Promise<boolean>;
  onBeforeRefresh: () => void;
  onClose: () => void;
  reload?: () => void;
  recording?: Readonly<{ url: string; fileName: string }>;
}>;

export default function ScoreExportRecoveryDialog({
  onSave, onBeforeRefresh, onClose, reload = () => window.location.reload(), recording
}: Props) {
  const dialogRef = useDialogFocus();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmedRecordingUrl, setConfirmedRecordingUrl] = useState("");
  const recordingNeedsSave = Boolean(recording && confirmedRecordingUrl !== recording.url);

  useEffect(() => { setConfirmedRecordingUrl(""); }, [recording?.url]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  async function refresh() {
    if (busy.current || recordingNeedsSave) return;
    busy.current = true;
    setSaving(true);
    setError("");
    let saved = false;
    try { saved = await onSave(); }
    catch { /* A rejected save must keep the current project on screen. */ }
    if (!saved) {
      setError("노래와 그림을 저장하지 못해 화면을 새로고침하지 않았어요. 브라우저 저장 공간을 확인하고 다시 시도해 주세요.");
      busy.current = false;
      setSaving(false);
      return;
    }
    try {
      onBeforeRefresh();
      reload();
    } catch {
      setError("작업은 저장했지만 최신 화면을 열지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
      busy.current = false;
      setSaving(false);
    }
  }

  function close() {
    if (!busy.current) onClose();
  }

  return createPortal(<div className="score-export-recovery-overlay" ref={dialogRef}
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }}>
    <section className="score-export-recovery-dialog" data-testid="score-export-recovery"
      role="dialog" aria-modal="true" aria-labelledby="score-export-recovery-title"
      aria-describedby="score-export-recovery-description" aria-busy={saving} tabIndex={-1}>
      <header>
        <span className="score-export-recovery-mark"><FileMusic size={27} aria-hidden="true" /></span>
        <div>
          <span className="score-export-recovery-eyebrow">악보 만들기</span>
          <h2 id="score-export-recovery-title">악보 만들기 기능을 다시 불러와 주세요</h2>
        </div>
        <button type="button" className="score-export-recovery-close" aria-label="악보 오류 안내 닫기"
          disabled={saving} onClick={close}><X size={21} aria-hidden="true" /></button>
      </header>
      <div className="score-export-recovery-content">
        <p id="score-export-recovery-description">
          인터넷 연결이 끊겼거나 앱이 업데이트되어 악보 만들기 기능을 불러오지 못했어요.
          연결을 확인한 뒤 최신 화면을 열어 주세요.
        </p>
        <p className="score-export-recovery-preserve">
          현재 노래와 그린 장면을 이 브라우저에 먼저 저장한 뒤 새로고침해요.
          최신 화면에서 악보 만들기를 다시 눌러 주세요.
        </p>
        {recording && <div className="score-export-recovery-recording">
          <strong>현재 녹음 파일을 먼저 저장해 주세요</strong>
          <p>프로젝트에는 녹음 파일이 포함되지 않아요. 새로고침하면 현재 녹음의 미리듣기와 보정 정보가 사라져요.</p>
          <a href={recording.url} download={recording.fileName} data-testid="score-export-recording-save"
            aria-disabled={saving} onClick={(event) => { if (busy.current) event.preventDefault(); }}>
            녹음 MP3 먼저 저장
          </a>
          <label>
            <input type="checkbox" data-testid="score-export-recording-confirm" disabled={saving}
              checked={!recordingNeedsSave} onChange={(event) => setConfirmedRecordingUrl(event.target.checked ? recording.url : "")} />
            녹음 파일을 저장했어요
          </label>
        </div>}
        {error && <p className="score-export-recovery-error" role="alert">{error}</p>}
      </div>
      <footer>
        <button type="button" className="score-export-recovery-secondary" disabled={saving} onClick={close}>나중에</button>
        <button type="button" className="score-export-recovery-primary" disabled={saving || recordingNeedsSave}
          data-testid="score-export-refresh" onClick={() => void refresh()}>
          <RefreshCw size={18} aria-hidden="true" />
          {saving ? "노래와 그림 저장 중…" : "작업 저장하고 최신 화면 열기"}
        </button>
      </footer>
    </section>
  </div>, document.body);
}
