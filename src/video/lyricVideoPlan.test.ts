import { describe, expect, it } from "vitest";
import { buildLyricVideoPlan } from "./lyricVideoPlan";

const quarter = { numerator: 1, denominator: 1 };

describe("녹음 가사 영상 타이밍", () => {
  it("전주 뒤에 음표 박자에 맞춰 가사를 표시하고 후주에는 지운다", () => {
    const plan = buildLyricVideoPlan("햇살", [{ notes: [
      { id: "a", pitch: 60, duration: quarter, lyric: "햇" },
      { id: "b", pitch: 62, duration: quarter, lyric: "살" },
      { id: "c", pitch: null, duration: quarter },
      { id: "d", pitch: 64, duration: quarter, lyric: "아" }
    ] }], 120, 2.6, 5.5);

    expect(plan.hasLyrics).toBe(true);
    expect(plan.frames).toEqual([
      { startSeconds: 0, endSeconds: 2.6, syllables: [], activeSyllable: null, measureIndex: null },
      { startSeconds: 2.6, endSeconds: 3.1, syllables: ["햇", "살", "아"], activeSyllable: 0, measureIndex: 0 },
      { startSeconds: 3.1, endSeconds: 3.6, syllables: ["햇", "살", "아"], activeSyllable: 1, measureIndex: 0 },
      { startSeconds: 3.6, endSeconds: 4.1, syllables: ["햇", "살", "아"], activeSyllable: null, measureIndex: 0 },
      { startSeconds: 4.1, endSeconds: 4.6, syllables: ["햇", "살", "아"], activeSyllable: 2, measureIndex: 0 },
      { startSeconds: 4.6, endSeconds: 5.5, syllables: [], activeSyllable: null, measureIndex: null }
    ]);
  });

  it("가사가 없는 녹음은 영상 저장 대상이 아니며 길이를 넘지 않는다", () => {
    const plan = buildLyricVideoPlan("", [{ notes: [
      { id: "a", pitch: 60, duration: quarter }
    ] }], 60, 1, 1.5);

    expect(plan.title).toBe("나의 노래");
    expect(plan.hasLyrics).toBe(false);
    expect(plan.frames.at(-1)?.endSeconds).toBe(1.5);
  });
});
