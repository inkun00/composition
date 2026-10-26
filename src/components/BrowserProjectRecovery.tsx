import { useEffect, useState } from "react";
import type { SavedDraft } from "../music/draft";
import { FileMusic } from "./AppArtworkIcons";

type Props = Readonly<{ onLoad: (draft: SavedDraft) => void; busy: boolean }>;

export default function BrowserProjectRecovery({ onLoad, busy }: Props) {
  const [projects, setProjects] = useState<readonly SavedDraft[]>([]);
  useEffect(() => {
    let active = true;
    void import("../music/projectStorage").then(({ listBrowserProjects }) => listBrowserProjects())
      .then((drafts) => {
        if (active) setProjects(drafts.filter((draft) => draft.musicVideoScenes?.some((scene) => scene.elements.length > 0)));
      }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  if (!projects.length) return null;
  return <details className="account-local-projects">
    <summary>이 기기에 자동 보관한 그림 · {projects.length}개 프로젝트</summary>
    <p className="account-sync-explain">다른 곡을 열거나 새 곡을 시작해도 이전 그림을 여기서 다시 열 수 있어요.</p>
    <ul className="account-score-list">
      {projects.map((draft) => <li key={draft.projectId}>
        <FileMusic size={24} aria-hidden="true" />
        <div><strong>{draft.title || "이름 없는 프로젝트"}</strong>
          <span>{draft.musicVideoScenes?.length ?? 0}개 장면 · {new Intl.DateTimeFormat("ko-KR", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
          }).format(new Date(draft.updatedAt))}</span></div>
        <button type="button" className="account-secondary" disabled={busy} onClick={() => onLoad(draft)}>그림 복구</button>
      </li>)}
    </ul>
  </details>;
}
