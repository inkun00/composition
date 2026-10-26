// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPracticeExportModuleLoadError, savePracticeAndRefresh } from "./practiceExportRefresh";
import { emptyPracticeDraft, readPracticeDraft } from "./practiceStorage";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("MP4 기능 모듈을 불러오지 못했을 때의 복구 판별", () => {
  it.each([
    new TypeError("Failed to fetch dynamically imported module: https://example.com/assets/exportPracticeVideoMp4-old.js"),
    new TypeError("error loading dynamically imported module: https://example.com/assets/mediabunny-old.js"),
    new TypeError("Importing a module script failed."),
    { name: "ChunkLoadError", message: "Loading chunk 4 failed." },
    new Error("Loading CSS chunk 7 failed.")
  ])("브라우저별 모듈 다운로드 오류를 감지한다: %s", (error) => {
    expect(isPracticeExportModuleLoadError(error)).toBe(true);
  });

  it.each([
    new Error("encode failed"),
    new TypeError("Failed to fetch"),
    new DOMException("취소", "AbortError"),
    "Failed to fetch dynamically imported module",
    null,
    undefined
  ])("인코딩·일반 통신·취소 오류에는 화면 새로고침을 권하지 않는다: %s", (error) => {
    expect(isPracticeExportModuleLoadError(error)).toBe(false);
  });
});

describe("최신 화면을 열기 전 작업 보존", () => {
  it("현재 작업을 저장한 뒤 이동 경고를 해제하고 명시적으로 새로고침한다", () => {
    const draft = { ...emptyPracticeDraft(), title: "새로고침해도 남길 곡", mode: "melody" as const };
    const order: string[] = [];
    const beforeRefresh = vi.fn(() => {
      expect(readPracticeDraft().title).toBe(draft.title);
      order.push("before");
    });
    const reload = vi.fn(() => {
      expect(readPracticeDraft().title).toBe(draft.title);
      order.push("reload");
    });
    expect(savePracticeAndRefresh(draft, beforeRefresh, reload)).toBe(true);
    expect(order).toEqual(["before", "reload"]);
    expect(readPracticeDraft()).toEqual(draft);
  });

  it("저장하지 못하면 경고를 유지하고 새로고침하지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("저장 공간 없음", "QuotaExceededError");
    });
    const beforeRefresh = vi.fn();
    const reload = vi.fn();
    expect(savePracticeAndRefresh(emptyPracticeDraft(), beforeRefresh, reload)).toBe(false);
    expect(beforeRefresh).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
