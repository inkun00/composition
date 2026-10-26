import type { CloudScore } from "../firebase/scores";
import { draftFingerprint, type SavedDraft } from "./draft";
import { listBrowserProjects, readBrowserProject } from "./projectStorage";

function sameSongWithoutDrawings(left: SavedDraft, right: SavedDraft): boolean {
  return draftFingerprint({ ...left, musicVideoScenes: undefined }) ===
    draftFingerprint({ ...right, musicVideoScenes: undefined });
}

/** Reopening an older cloud snapshot must not replace newer local drawings. */
export async function recoverCloudProjectDraft(score: CloudScore, uid: string, current?: SavedDraft): Promise<SavedDraft> {
  const projectId = score.draft.projectId ?? score.id;
  const archived = await readBrowserProject(projectId);
  const linked = !score.draft.projectId ? (await listBrowserProjects()).filter((draft) =>
    draft.cloudScoreId === score.id && draft.cloudOwnerId === uid) : [];
  const candidates = [score.draft, archived,
    current && (current.projectId === projectId || current.cloudScoreId === score.id && current.cloudOwnerId === uid ||
      !current.cloudScoreId && !score.draft.projectId && sameSongWithoutDrawings(current, score.draft)) ? current : null]
    .filter((draft): draft is SavedDraft => Boolean(draft)).concat(linked);
  const latest = candidates.reduce((left, right) => right.updatedAt >= left.updatedAt ? right : left);
  return { ...latest, projectId, cloudScoreId: score.id, cloudOwnerId: uid };
}
