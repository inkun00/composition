import { afterEach, describe, expect, it, vi } from "vitest";
import { LEARNING_PROGRESS_KEY, readLearningProgress, writeLearningProgress } from "./useLearningProgress";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("learning progress storage", () => {
  it("restores only known lesson identifiers without duplicates", () => {
    localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(["notes", "unknown", "notes", 5, "symbols"]));
    expect(readLearningProgress()).toEqual({ completed: ["notes", "symbols"], saved: true });
  });

  it("handles malformed and unavailable browser storage without breaking learning", () => {
    localStorage.setItem(LEARNING_PROGRESS_KEY, "broken-json");
    expect(readLearningProgress().completed).toEqual([]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readLearningProgress()).toEqual({ completed: [], saved: false });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(writeLearningProgress(["notes"])).toBe(false);
  });

  it("persists all completed lessons for a future visit", () => {
    expect(writeLearningProgress(["tempo", "dynamics"])).toBe(true);
    expect(readLearningProgress().completed).toEqual(["tempo", "dynamics"]);
  });
});
