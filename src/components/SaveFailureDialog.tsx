import { AlertTriangle, LocateFixed, X } from "./AppArtworkIcons";
import type { SaveIssue } from "../music/draftValidation";
import "./SaveFailureDialog.css";

type SaveFailureDialogProps = Readonly<{
  issues: readonly SaveIssue[];
  onClose: () => void;
  onLocate: (issue: SaveIssue) => void;
}>;

export default function SaveFailureDialog({ issues, onClose, onLocate }: SaveFailureDialogProps) {
  if (issues.length === 0) return null;
  return (
    <div className="save-failure-overlay" role="dialog" aria-modal="true" aria-labelledby="save-failure-title">
      <section className="save-failure-dialog">
        <header>
          <span><AlertTriangle size={24} aria-hidden="true" /></span>
          <div><h2 id="save-failure-title">악보를 저장하지 못했어요</h2></div>
          <button type="button" aria-label="저장 오류 닫기" onClick={onClose}><X size={20} /></button>
        </header>
        <ul>
          {issues.map((issue, index) => (
            <li key={`${issue.target}-${issue.measureIndex ?? "all"}-${index}`}>
              <span>{issue.message}</span>
              {issue.target !== "cloud" && (
                <button type="button" onClick={() => onLocate(issue)}><LocateFixed size={15} /> 위치 보기</button>
              )}
            </li>
          ))}
        </ul>
        <footer><button type="button" onClick={onClose}>확인</button></footer>
      </section>
    </div>
  );
}
