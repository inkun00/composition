import { describe, expect, it } from "vitest";
import type { TimedMusicVideoScene } from "./musicVideoModel";
import { getSceneBeatSeconds, getSceneMotionClock, normalizeSceneBpm, positiveModulo, sceneBeatProgress } from "./sceneMotionClock";

function timed(start = 0, end = 20): TimedMusicVideoScene {
  return { startSeconds: start, endSeconds: end, lyricText: "노래",
    scene: { id: "scene", background: "#ffffff", elements: [], motion: "still", endLyric: null } };
}

describe("장면 동작의 공통 박자 시계", () => {
  it("유효한 BPM 수치는 유지하고 잘못된 빠르기는 공통 120 BPM으로 정규화한다", () => {
    expect(normalizeSceneBpm(97)).toBe(97);
    expect(normalizeSceneBpm(119)).toBe(119);
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(normalizeSceneBpm(invalid)).toBe(120);
      expect(getSceneBeatSeconds(invalid)).toBe(.5);
    }
  });

  it("장면 시작 박자와 음악 시작 박자를 분리하고 전주 중에도 위상을 계산한다", () => {
    const intro = .08 + 16 * 60 / 120;
    expect(getSceneMotionClock(timed(), 120, intro, intro).songBeats).toBe(0);
    expect(getSceneMotionClock(timed(), 120, intro + .25, intro).songBeats).toBe(.5);
    const before = getSceneMotionClock(timed(), 120, 0, intro);
    expect(before.elapsedBeats).toBe(0);
    expect(before.songBeats).toBeLessThan(0);
  });

  it("후속 장면이 박자 중간에서 시작해도 같은 음악 위상을 유지한다", () => {
    const first = getSceneMotionClock(timed(), 180, 1.25, .08);
    const later = getSceneMotionClock(timed(.25), 180, 1.25, .08);
    expect(later.songBeats).toBe(first.songBeats);
    expect(later.elapsedBeats).toBeLessThan(first.elapsedBeats);
  });

  it("장면·음악 시작·재생 시각을 함께 이동해도 같은 박자 상태를 얻는다", () => {
    const first = getSceneMotionClock(timed(), 120, .5, .25);
    expect(getSceneMotionClock(timed(10, 30), 120, 10.5, 10.25)).toEqual(first);
  });

  it("등장은 지정한 박자에 완료하고 짧은 장면의 제한을 준수한다", () => {
    expect(sceneBeatProgress(getSceneMotionClock(timed(), 90, 2 * 60 / 90), 2, .6)).toBe(1);
    expect(sceneBeatProgress(getSceneMotionClock(timed(), 180, 2 * 60 / 180), 2, .6)).toBe(1);
    expect(sceneBeatProgress(getSceneMotionClock(timed(0, .25), 120, .2), 4, .6)).toBe(1);
    expect(positiveModulo(-.25, 1)).toBe(.75);
  });
});
