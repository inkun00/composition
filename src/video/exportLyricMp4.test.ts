import { describe, expect, it, vi } from "vitest";
import { exportLyricMp4 } from "./exportLyricMp4";
import type { LyricVideoPlan } from "./lyricVideoPlan";

const emptyPlan: LyricVideoPlan = {
  title: "리듬 연습",
  hasLyrics: false,
  frames: [{ startSeconds: 0, endSeconds: 1, syllables: [], activeSyllable: null, measureIndex: 0 }]
};

describe("가사 MP4와 리듬 MP4의 내보내기 조건", () => {
  it("일반 가사 영상은 가사 없는 녹음의 기존 안내를 유지한다", async () => {
    const progress = vi.fn();
    await expect(exportLyricMp4("blob:unused", emptyPlan, progress)).rejects.toThrow("가사를 한 글자 이상");
    expect(progress).not.toHaveBeenCalled();
  });

  it("무가사 리듬 영상도 취소된 요청은 처리하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const progress = vi.fn();
    await expect(exportLyricMp4("blob:unused", emptyPlan, progress, controller.signal, {
      allowEmptyLyrics: true
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).not.toHaveBeenCalled();
  });
});
