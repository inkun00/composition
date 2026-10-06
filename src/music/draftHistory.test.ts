import { describe, expect, it } from "vitest";
import { archiveDraft, deleteArchivedDraft, DRAFT_HISTORY_KEY, readDraftHistory } from "./draftHistory";
import type { SavedDraft } from "./draft";

const draft: SavedDraft = {
  version: 1,
  updatedAt: 1,
  sourceHash: "",
  title: "첫 노래",
  creator: "어린이",
  originalCreator: "어린이",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 8,
  instrumentId: "piano",
  lyrics: Array(8).fill(""),
  measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null })),
  showArrangement: false
};

describe("이전 작업 보관", () => {
  it("다른 작품을 열기 전에 현재 작업을 보관하고 다시 읽는다", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); }
    };

    expect(archiveDraft(storage, draft)).toBe(true);
    expect(archiveDraft(storage, { ...draft, updatedAt: 2 })).toBe(true);
    expect(readDraftHistory(storage)).toHaveLength(1);
    expect(archiveDraft(storage, { ...draft, title: "두 번째 노래" })).toBe(true);
    expect(readDraftHistory(storage).map((entry) => entry.draft.title))
      .toEqual(["두 번째 노래", "첫 노래"]);
    expect(deleteArchivedDraft(storage, readDraftHistory(storage)[1].id)).toBe(true);
    expect(readDraftHistory(storage).map((entry) => entry.draft.title)).toEqual(["두 번째 노래"]);
    expect(memory.has(DRAFT_HISTORY_KEY)).toBe(true);
  });

  it("기기 저장 공간이 부족하면 보관 실패를 알리고 기존 목록은 보존한다", () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("quota exceeded"); }
    };
    expect(archiveDraft(storage, draft)).toBe(false);
  });
});
