import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedDraft } from "./draft";
import { recoverCloudProjectDraft } from "./projectRecovery";

const { readProject, listProjects } = vi.hoisted(() => ({ readProject: vi.fn(), listProjects: vi.fn() }));
vi.mock("./projectStorage", () => ({ readBrowserProject: readProject, listBrowserProjects: listProjects }));

function draft(updatedAt: number, drawn = true): SavedDraft {
  return { version: 1, updatedAt, projectId: "song-one", cloudScoreId: "cloud-one", cloudOwnerId: "owner",
    sourceHash: "", title: "지구를 지켜요", creator: "작곡가", originalCreator: "",
    presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano",
    showArrangement: true, lyrics: Array(8).fill(""),
    measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null })),
    musicVideoScenes: drawn ? [{ id: "intro", section: "intro", endLyric: null, background: "#ffffff", motion: "still",
      elements: [{ id: "stroke", tool: "brush", color: "#123456", width: 8, points: [[10, 20, .5]],
        motion: "bounce", motionGroupId: "hands" }] }] : [] };
}
function score(snapshot: SavedDraft) {
  return { id: "cloud-one", title: snapshot.title, creator: snapshot.creator,
    updatedAt: snapshot.updatedAt, songLength: snapshot.songLength, draft: snapshot };
}
beforeEach(() => { readProject.mockReset(); readProject.mockResolvedValue(null); listProjects.mockResolvedValue([]); });

describe("계정 프로젝트를 열 때 최신 그림 복구", () => {
  it("그림이 없던 이전 계정 저장본보다 최신 브라우저 그림과 그룹 모션을 복원한다", async () => {
    const local = draft(20);
    readProject.mockResolvedValue(local);
    const restored = await recoverCloudProjectDraft(score(draft(10, false)), "owner");
    expect(restored.musicVideoScenes).toEqual(local.musicVideoScenes);
    expect(restored).toMatchObject({ projectId: "song-one", cloudScoreId: "cloud-one", cloudOwnerId: "owner", updatedAt: 20 });
  });

  it("다른 기기에서 더 최근에 수정한 그림은 오래된 브라우저 복구본으로 바꾸지 않는다", async () => {
    readProject.mockResolvedValue(draft(10));
    const remote = { ...draft(30), title: "최신 제목" };
    expect(await recoverCloudProjectDraft(score(remote), "owner")).toEqual(remote);
  });

  it("사용자가 최근에 모든 장면을 삭제한 프로젝트에 옛 그림을 되살리지 않는다", async () => {
    readProject.mockResolvedValue(draft(10));
    expect((await recoverCloudProjectDraft(score(draft(30, false)), "owner")).musicVideoScenes).toEqual([]);
  });

  it("이전 버전이 같은 시각으로 저장했어도 로컬 그림을 없는 클라우드 그림으로 지우지 않는다", async () => {
    readProject.mockResolvedValue(draft(10));
    expect((await recoverCloudProjectDraft(score(draft(10, false)), "owner")).musicVideoScenes).toEqual(draft(10).musicVideoScenes);
  });

  it("다른 프로젝트의 그림을 같은 제목의 프로젝트에 붙이지 않는다", async () => {
    const other = { ...draft(50), projectId: "other-project", cloudScoreId: "other-cloud" };
    expect((await recoverCloudProjectDraft(score(draft(10, false)), "owner", other)).musicVideoScenes).toEqual([]);
  });

  it("다른 곡을 편집 중이어도 예전 계정 악보와 연결된 복구본을 찾는다", async () => {
    const remote = { ...draft(10, false), projectId: undefined };
    const archived = { ...draft(40), projectId: "archived-legacy" };
    listProjects.mockResolvedValue([archived, { ...draft(99), projectId: "other-owner", cloudOwnerId: "someone-else" }]);
    const restored = await recoverCloudProjectDraft(score(remote), "owner");
    expect(restored.musicVideoScenes).toEqual(archived.musicVideoScenes);
    expect(restored.updatedAt).toBe(40);
  });

  it("프로젝트 ID가 없던 이전 버전의 동일한 곡도 현재 그림을 보존하며 계정 연결을 복구한다", async () => {
    const remote = { ...draft(10, false), projectId: undefined, cloudScoreId: undefined, cloudOwnerId: undefined };
    const local = { ...draft(20), projectId: "migrated-local", cloudScoreId: undefined, cloudOwnerId: undefined };
    const restored = await recoverCloudProjectDraft(score(remote), "owner", local);
    expect(restored.musicVideoScenes).toEqual(local.musicVideoScenes);
    expect(restored).toMatchObject({ projectId: "cloud-one", cloudScoreId: "cloud-one", cloudOwnerId: "owner" });
  });
});
