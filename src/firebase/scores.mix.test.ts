import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedDraft } from "../music/draft";

const { setDoc } = vi.hoisted(() => ({ setDoc: vi.fn() }));
vi.mock("./client", () => ({ firestore: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...path: string[]) => path.join("/")),
  doc: vi.fn((_db, ...path: string[]) => ({ id: path.at(-1) ?? "new-score" })),
  setDoc,
  deleteDoc: vi.fn(), getDocs: vi.fn(), onSnapshot: vi.fn(),
  Timestamp: { fromMillis: (value: number) => ({ toMillis: () => value }) }
}));

import { saveCloudScore } from "./scores";

const draft: SavedDraft = {
  version: 1, updatedAt: 123, sourceHash: "", title: "반주 균형", creator: "새봄", originalCreator: "새봄",
  presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano",
  accompanimentInstrumentIds: ["flute"], accompanimentTrackMix: { flute: { volume: 50, muted: false } },
  lyrics: Array(8).fill(""), showArrangement: true,
  measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null }))
};

beforeEach(() => vi.clearAllMocks());

describe("클라우드 반주 믹스", () => {
  it("수정 저장은 초안을 한 필드로 교체해 삭제된 악기의 옛 믹스를 누적하지 않는다", async () => {
    const saved = await saveCloudScore("user-id", draft, "existing-score");
    const [_ref, data, options] = setDoc.mock.calls[0];
    expect(data.draft.accompanimentTrackMix).toEqual(draft.accompanimentTrackMix);
    expect(options).toEqual({ mergeFields: expect.arrayContaining(["draft"]) });
    expect(options.mergeFields.every((field: string) => !field.startsWith("draft."))).toBe(true);
    expect(data.createdAt).toBeUndefined();
    expect(saved.draft.accompanimentTrackMix).toEqual(draft.accompanimentTrackMix);
  });

  it("초기화한 믹스를 빈 지도 그대로 저장하고 첫 생성 시간은 새 악보에만 넣는다", async () => {
    await saveCloudScore("user-id", { ...draft, accompanimentTrackMix: {} });
    const [_ref, data, options] = setDoc.mock.calls[0];
    expect(data.draft.accompanimentTrackMix).toEqual({});
    expect(options.mergeFields).toContain("createdAt");
    expect(options.mergeFields).toContain("draft");
  });
});
