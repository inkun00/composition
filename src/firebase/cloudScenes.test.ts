import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedDraft } from "../music/draft";
import { encodeCloudDraft } from "./cloudDraft";
import { cloudScoreListItem, listCloudScores, saveCloudScore, subscribeCloudScores } from "./scores";
import { listPublishedSongs, publishScoreToAlbum } from "./communityAlbums";

const mocks = vi.hoisted(() => ({ setDoc: vi.fn(), getDocs: vi.fn(), onSnapshot: vi.fn() }));
vi.mock("./client", () => ({ firestore: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  doc: (_parent: unknown, ...segments: string[]) => ({ id: segments.at(-1) ?? "new-score", path: segments.join("/") }),
  setDoc: mocks.setDoc,
  getDocs: mocks.getDocs,
  onSnapshot: mocks.onSnapshot,
  deleteDoc: vi.fn(), updateDoc: vi.fn(), writeBatch: vi.fn(),
  serverTimestamp: () => "server-time",
  Timestamp: { fromMillis: (value: number) => ({ toMillis: () => value }) }
}));

const draft: SavedDraft = {
  version: 1, updatedAt: 123, sourceHash: "", title: "구름 그림", creator: "새봄", originalCreator: "새봄",
  presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano",
  lyrics: Array(8).fill("별"), showArrangement: true,
  measures: Array.from({ length: 8 }, (_, index) => ({ candidateId: "custom", candidateName: "가락",
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "별" }] })),
  musicVideoScenes: [{ id: "scene", background: "#ffffff", motion: "auto",
    endLyric: { measureIndex: 7, noteId: "note-7" },
    elements: [{ id: "stroke", tool: "brush", color: "#123456", width: 8,
      points: [[10, 20, .5], [30, 40, .75]] }] }]
};

function hasNestedArray(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => Array.isArray(item) || hasNestedArray(item));
  return Boolean(value && typeof value === "object" && Object.values(value).some(hasNestedArray));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setDoc.mockResolvedValue(undefined);
});

describe("클라우드와 앨범의 뮤직비디오 장면 보존", () => {
  it("손상된 악보도 정상 그림을 복구 후보로 노출하지만 악보 열기는 계속 차단한다", () => {
    const item = cloudScoreListItem("broken-score", { title: draft.title, draft: {
      ...encodeCloudDraft(draft), instrumentId: "removed-instrument", projectId: "drawing-project"
    } });
    expect(item).toMatchObject({ id: "broken-score", draft: null, unavailableReason: expect.any(String),
      recoveryScenes: draft.musicVideoScenes, recoveryProjectId: "drawing-project" });
    expect(item).not.toHaveProperty("musicVideoScenesJson");
  });

  it("손상·빈 그림은 후보로 내보내지 않고 잘못된 프로젝트 연결 힌트는 제거한다", () => {
    const encoded = encodeCloudDraft(draft);
    for (const raw of [{ ...encoded, musicVideoScenesJson: "broken" }, { ...encoded, musicVideoScenesJson: "[]" },
      { ...encoded, musicVideoScenes: draft.musicVideoScenes }]) {
      const item = cloudScoreListItem("broken-score", { draft: { ...raw, version: 99 } });
      expect(item.draft).toBeNull();
      expect(item).not.toHaveProperty("recoveryScenes");
      expect(item).not.toHaveProperty("recoveryProjectId");
    }
    for (const projectId of [123, "", "p".repeat(161)]) {
      const item = cloudScoreListItem("broken-score", { draft: { ...encoded, version: 99, projectId } });
      expect(item).toMatchObject({ draft: null, recoveryScenes: draft.musicVideoScenes });
      expect(item).not.toHaveProperty("recoveryProjectId");
    }
  });

  it("악보 저장은 Firestore에 중첩 배열을 보내지 않고 호출자에게 원래 그림을 돌려준다", async () => {
    const saved = await saveCloudScore("owner", draft, "score-one");
    const [, data, options] = mocks.setDoc.mock.calls[0];
    expect(hasNestedArray(data)).toBe(false);
    expect(data.draft).not.toHaveProperty("musicVideoScenes");
    expect(data.draft.musicVideoScenesJson).toBe(JSON.stringify(draft.musicVideoScenes));
    expect(options.mergeFields).toContain("draft");
    expect(saved.draft.musicVideoScenes).toEqual(draft.musicVideoScenes);
    expect(saved.draft).not.toHaveProperty("musicVideoScenesJson");
    mocks.getDocs.mockResolvedValue({ docs: [{ id: "score-one", data: () => data }] });
    const loaded = await listCloudScores("owner");
    expect(loaded[0].draft?.musicVideoScenes).toEqual(draft.musicVideoScenes);
  });

  it("실시간 목록은 그림을 복원하고 손상된 그림 문서를 사용 불가 항목으로 보존한다", () => {
    const onUpdate = vi.fn();
    subscribeCloudScores("owner", onUpdate, vi.fn());
    const encoded = encodeCloudDraft(draft);
    const { musicVideoScenes: _scenes, ...legacy } = draft;
    mocks.onSnapshot.mock.calls[0][2]({
      docs: [
        { id: "drawn", data: () => ({ draft: encoded }) },
        { id: "legacy", data: () => ({ draft: legacy }) },
        { id: "damaged", data: () => ({ draft: { ...encoded, musicVideoScenesJson: "broken" } }) }
      ],
      metadata: { fromCache: false, hasPendingWrites: false }
    });
    const [items, cached] = onUpdate.mock.calls[0];
    expect(cached).toBe(false);
    expect(items.find((item: { id: string }) => item.id === "drawn").draft.musicVideoScenes).toEqual(draft.musicVideoScenes);
    expect(items.find((item: { id: string }) => item.id === "legacy").draft).not.toHaveProperty("musicVideoScenes");
    expect(items.find((item: { id: string }) => item.id === "damaged")).toMatchObject({ draft: null,
      unavailableReason: expect.any(String) });
  });

  it("앨범 게시도 같은 형식으로 그림을 저장하고 다시 읽거나 리메이크할 때 복원한다", async () => {
    const score = { id: "score-one", title: draft.title, creator: draft.creator, songLength: draft.songLength,
      updatedAt: draft.updatedAt, draft };
    await publishScoreToAlbum("owner", "새봄", "album", score, "project");
    const [, data, options] = mocks.setDoc.mock.calls[0];
    expect(hasNestedArray(data)).toBe(false);
    expect(data.draft.musicVideoScenesJson).toBe(JSON.stringify(draft.musicVideoScenes));
    expect(options).toEqual({ mergeFields: expect.arrayContaining(["draft"]) });
    const { musicVideoScenes: _scenes, ...legacy } = draft;
    mocks.getDocs.mockResolvedValue({ docs: [
      { id: "drawn", data: () => data },
      { id: "legacy", data: () => ({ ...data, draft: legacy }) },
      { id: "damaged", data: () => ({ ...data, draft: { ...data.draft, musicVideoScenesJson: "{}" } }) }
    ] });
    const loaded = await listPublishedSongs("album");
    expect(loaded).toHaveLength(2);
    expect(loaded.find((item) => item.id === "drawn")?.draft.musicVideoScenes).toEqual(draft.musicVideoScenes);
    expect(loaded.find((item) => item.id === "legacy")?.draft).not.toHaveProperty("musicVideoScenes");
    expect(draft.musicVideoScenes?.[0].elements[0].points).toEqual([[10, 20, .5], [30, 40, .75]]);
  });
});
