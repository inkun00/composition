import { describe, expect, it } from "vitest";
import { isSavedDraft, type SavedDraft } from "./draft";
import { extractLostDrawingCandidates } from "./lostDrawingRecoveryModel";
import { hasMissingRecoveredDrawing, makeRecoveredDrawingProject, shouldOfferLostDrawingAutomatically } from "./lostDrawingRecoveryChoice";

function draft(): SavedDraft {
  return { version: 1, updatedAt: 10, projectId: "original", cloudOwnerId: "owner", cloudScoreId: "original-cloud",
    sourceHash: "#old-shared-song", title: "지구를 지켜요", creator: "작곡가", originalCreator: "작곡가",
    presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano", showArrangement: true,
    lyrics: Array(8).fill(""), measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null })),
    musicVideoScenes: [{ id: "scene", endLyric: null, endMeasureIndex: 7, background: "#ffffff", motion: "bounce",
      elements: [{ id: "line", tool: "brush", color: "#123456", width: 8,
        points: [[10, 20, .5], [30, 40, .5]], motion: "move-left", motionGroupId: "hands" }] }] };
}

describe("유실 그림 확인과 안전한 사본 복구", () => {
  it("현재 보이는 그림과 개체 ID·동작만 다른 기록은 다시 복구하라고 안내하지 않는다", () => {
    const source = draft();
    const [candidate] = extractLostDrawingCandidates(source, "backup", "backup");
    const scenes = source.musicVideoScenes!.map((scene) => ({ ...scene, id: "new-scene", motion: "still" as const,
      elements: scene.elements.map((element) => ({ ...element, id: "new-line", motion: "still" as const, motionGroupId: undefined })) }));
    expect(hasMissingRecoveredDrawing(candidate, scenes)).toBe(false);
  });

  it("이어서 완성한 획 안에 이미 포함된 중간 체크포인트는 유실로 취급하지 않는다", () => {
    const source = draft();
    const [candidate] = extractLostDrawingCandidates(source, "backup", "backup");
    const scenes = source.musicVideoScenes!.map((scene) => ({ ...scene, elements: scene.elements.map((element) => ({ ...element,
      points: [...element.points, [50, 60, .5] as const] })) }));
    expect(hasMissingRecoveredDrawing(candidate, scenes)).toBe(false);
  });

  it("이전 백업에만 남아 있는 그림은 복구 대상으로 안내한다", () => {
    const source = draft();
    const [candidate] = extractLostDrawingCandidates(source, "backup", "backup");
    expect(shouldOfferLostDrawingAutomatically(candidate, { ...source, musicVideoScenes: [] })).toBe(true);
  });

  it("다른 프로젝트의 정상 보관본은 수동 검색에 남기고 자동 팝업으로 열지 않는다", () => {
    const [candidate] = extractLostDrawingCandidates(draft(), "archive", "archive");
    expect(shouldOfferLostDrawingAutomatically(candidate, { ...draft(), projectId: "new-project", musicVideoScenes: [] })).toBe(false);
  });

  it("연결 정보가 없는 별개의 계정 악보를 현재 프로젝트로 오인하지 않는다", () => {
    const source = { ...draft(), projectId: undefined, cloudOwnerId: undefined, cloudScoreId: undefined };
    const [candidate] = extractLostDrawingCandidates(source, "cloud:owner:other-score", "cloud");
    expect(shouldOfferLostDrawingAutomatically(candidate, { ...source, projectId: "current", musicVideoScenes: [] })).toBe(false);
    expect(shouldOfferLostDrawingAutomatically(candidate, { ...source, projectId: "current", musicVideoScenes: [],
      cloudOwnerId: "owner", cloudScoreId: "other-score" })).toBe(true);
  });

  it("정상 프로젝트는 노래·그림·모션 전체를 독립 사본으로 복구하며 원본을 바꾸지 않는다", () => {
    const source = draft();
    const current = { ...draft(), projectId: "current", title: "지금 작업", musicVideoScenes: [] };
    const [candidate] = extractLostDrawingCandidates(source, "backup", "backup");
    const snapshot = JSON.stringify({ source, current, candidate });
    const restored = makeRecoveredDrawingProject(candidate, current, "recovered-copy");
    expect(isSavedDraft(restored)).toBe(true);
    expect(restored).toMatchObject({ projectId: "recovered-copy", sourceHash: "", title: "지구를 지켜요 · 복구",
      musicVideoScenes: source.musicVideoScenes, measures: source.measures });
    expect(restored.cloudScoreId).toBeUndefined();
    expect(restored.cloudOwnerId).toBeUndefined();
    expect(restored.musicVideoScenes).not.toBe(source.musicVideoScenes);
    expect(JSON.stringify({ source, current, candidate })).toBe(snapshot);
  });

  it("악보가 손상된 경우 현재 곡의 별도 사본에 실제 남은 그림만 넣고 깨진 음표를 되살리지 않는다", () => {
    const broken = { ...draft(), measures: null, updatedAt: 1e308 };
    const [candidate] = extractLostDrawingCandidates(broken, "recovery", "damaged");
    const current = { ...draft(), title: "현재 노래" };
    const restored = makeRecoveredDrawingProject(candidate, current, "recovered-drawing");
    expect(isSavedDraft(restored)).toBe(true);
    expect(restored.measures).toEqual(current.measures);
    expect(restored.musicVideoScenes).toEqual(broken.musicVideoScenes);
    expect(restored.updatedAt).toBeLessThan(8.64e15);
    expect(candidate.draft).toBeUndefined();
  });
});
