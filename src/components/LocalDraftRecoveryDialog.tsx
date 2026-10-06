import { useState } from "react";
import { createPortal } from "react-dom";
import type { ArchivedDraft } from "../music/draftHistory";
import { deleteArchivedDraft } from "../music/draftHistory";
import "./LocalDraftRecoveryDialog.css";

type Props = Readonly<{
  drafts: readonly ArchivedDraft[];
  onRestore: (entry: ArchivedDraft) => boolean;
  onClose: () => void;
}>;

export default function LocalDraftRecoveryDialog({ drafts, onRestore, onClose }: Props) {
  const [error, setError] = useState("");
  const [items, setItems] = useState(drafts);

  return createPortal(
    <div className="draft-recovery-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="draft-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-recovery-title">
        <header>
          <div><h2 id="draft-recovery-title">이전 작업 다시 열기</h2><p>이 기기에서 전에 만들던 노래예요.</p></div>
          <button type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>
        {items.length === 0 ? <p className="draft-recovery-empty">아직 보관된 작업이 없어요.</p> : (
          <div className="draft-recovery-list">
            {items.map((entry) => (
              <div className="draft-recovery-item" key={entry.id}>
                <button type="button" onClick={() => {
                  if (onRestore(entry)) onClose();
                  else setError("현재 작업을 보관하지 못했어요. 저장 공간을 확인해 주세요.");
                }}>
                  <strong>{entry.draft.title || "제목 없는 노래"}</strong>
                  <span>{entry.draft.songLength}마디 · {new Date(entry.savedAt).toLocaleString("ko-KR")}</span>
                </button>
                <button type="button" className="draft-recovery-delete" aria-label={`${entry.draft.title} 보관 기록 지우기`}
                  onClick={() => {
                    if (!window.confirm("이전 작업 기록을 지울까요? 지우면 다시 열 수 없어요.")) return;
                    try {
                      if (deleteArchivedDraft(window.localStorage, entry.id)) {
                        setItems((current) => current.filter((item) => item.id !== entry.id));
                        setError("");
                        return;
                      }
                    } catch { /* Storage may be unavailable. */ }
                    setError("이전 작업 기록을 지우지 못했어요.");
                  }}>지우기</button>
              </div>
            ))}
          </div>
        )}
        {error && <p role="alert" className="draft-recovery-error">{error}</p>}
      </section>
    </div>, document.body
  );
}
