import { describe, expect, it } from "vitest";
import { cloudScoreListItem } from "./scores";
import type { SavedDraft } from "../music/draft";

function draft(songLength: SavedDraft["songLength"]): SavedDraft {
  return {
    version: 1,
    updatedAt: 123,
    sourceHash: "",
    title: `${songLength}마디 노래`,
    creator: "새봄",
    originalCreator: "새봄",
    presetId: "H001",
    meter: { beats: 4, beatUnit: 4 },
    songLength,
    instrumentId: "piano",
    lyrics: Array(songLength).fill(""),
    measures: Array.from({ length: songLength }, () => ({ candidateId: null, candidateName: null, notes: null })),
    showArrangement: false
  };
}

describe("클라우드 악보 목록 호환성", () => {
  it.each([8, 12, 16, 20, 24, 28, 32] as const)("%s마디 악보를 열 수 있는 항목으로 만든다", (length) => {
    const item = cloudScoreListItem(`score-${length}`, { draft: draft(length) });
    expect(item.draft?.songLength).toBe(length);
    expect(item.unavailableReason).toBeUndefined();
  });

  it("현재 형식으로 열 수 없는 저장 문서도 목록에서 제거하지 않는다", () => {
    const item = cloudScoreListItem("legacy-score", {
      title: "아주 오래된 노래",
      creator: "하늘",
      songLength: 4,
      draft: { version: 0, title: "아주 오래된 노래" }
    });
    expect(item).toMatchObject({
      id: "legacy-score",
      title: "아주 오래된 노래",
      songLength: 4,
      draft: null
    });
    expect(item.unavailableReason).toContain("목록에는 보관");
  });

  it("제목과 수정시간이 없는 저장 문서도 이름 없는 자료로 표시한다", () => {
    const item = cloudScoreListItem("partial-score", { draft: null });
    expect(item.title).toBe("이름 없는 저장 자료");
    expect(item.updatedAt).toBe(0);
  });
});
