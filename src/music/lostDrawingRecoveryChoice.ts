import type { SavedDraft } from "./draft";
import type { MusicVideoScene, SceneElement } from "../video/musicVideoModel";
import type { LostDrawingRecoveryCandidate } from "./lostDrawingRecoveryModel";

function sameElement(saved: SceneElement, current: SceneElement): boolean {
  if (saved.tool !== current.tool || saved.color !== current.color || saved.width !== current.width) return false;
  // A checkpoint taken halfway through a stroke is already represented by its completed stroke.
  if (saved.id === current.id && saved.tool === "brush" && saved.points.length <= current.points.length) {
    return saved.points.every((point, index) => point.every((value, axis) => value === current.points[index][axis]));
  }
  return JSON.stringify(saved.points) === JSON.stringify(current.points);
}

export function hasMissingRecoveredDrawing(candidate: LostDrawingRecoveryCandidate, current: readonly MusicVideoScene[]): boolean {
  return candidate.scenes.some((saved) => saved.elements.length > 0 && !current.some((scene) =>
    saved.elements.every((element) => scene.elements.some((item) => sameElement(element, item)))));
}

export function shouldOfferLostDrawingAutomatically(candidate: LostDrawingRecoveryCandidate, current: SavedDraft): boolean {
  if (!hasMissingRecoveredDrawing(candidate, current.musicVideoScenes ?? [])) return false;
  // Ordinary saved projects are available through the manual search, without interrupting another song.
  if (candidate.sourceKind === "archive" && candidate.draft && !candidate.currentPointer) return false;
  if (candidate.sourceKind === "cloud" && candidate.draft) {
    const sameProject = Boolean(candidate.projectId) && candidate.projectId === current.projectId;
    const sameCloud = Boolean(current.cloudScoreId && current.cloudOwnerId) &&
      candidate.source === `cloud:${current.cloudOwnerId}:${current.cloudScoreId}`;
    if (!sameProject && !sameCloud) return false;
  }
  return true;
}

export function makeRecoveredDrawingProject(candidate: LostDrawingRecoveryCandidate, current: SavedDraft,
  projectId: string, cloudOwnerId?: string): SavedDraft {
  const base = candidate.draft ?? current;
  return {
    ...JSON.parse(JSON.stringify(base)) as SavedDraft,
    projectId, cloudScoreId: undefined, cloudOwnerId, sourceHash: "",
    updatedAt: Date.now(),
    title: `${(candidate.title || base.title || "그림").slice(0, 51)} · ${candidate.draft ? "복구" : "그림 복구"}`,
    musicVideoScenes: JSON.parse(JSON.stringify(candidate.scenes)) as readonly MusicVideoScene[],
    showArrangement: true
  };
}
