import { describe, expect, it } from "vitest";
import type { BeatPatternEvent } from "../music/beatPattern";
import { createBeatPatternHits } from "./drumGroove";

const pattern: readonly BeatPatternEvent[] = [
  { id: "kick-1", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 },
  { id: "clap-1", instrumentId: "clap", measureIndex: 0, offsetBeats: 1 },
  { id: "ride-1", instrumentId: "ride", measureIndex: 1, offsetBeats: 2 },
  { id: "timpani-1", instrumentId: "timpani", measureIndex: 3, offsetBeats: 3 }
];

describe("사용자가 네 마디에 직접 놓는 비트", () => {
  it("놓은 소리가 없으면 자동으로 비트를 만들지 않는다", () => {
    expect(createBeatPatternHits([], 0, 4)).toEqual([]);
  });

  it("현재 마디에 사용자가 놓은 소리만 연주한다", () => {
    expect(createBeatPatternHits(pattern, 0, 4).map(({ instrumentId, offsetBeats }) =>
      [instrumentId, offsetBeats])).toEqual([["kick", 0], ["clap", 1]]);
    expect(createBeatPatternHits(pattern, 2, 4)).toEqual([]);
  });

  it("네 마디가 지나면 같은 직접 배치 패턴을 반복한다", () => {
    expect(createBeatPatternHits(pattern, 5, 4))
      .toEqual(createBeatPatternHits(pattern, 1, 4));
    expect(createBeatPatternHits(pattern, 7, 4))
      .toEqual(createBeatPatternHits(pattern, 3, 4));
  });

  it("같은 박자에 놓은 여러 악기를 함께 연주한다", () => {
    const layered: readonly BeatPatternEvent[] = [
      { id: "kick", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 },
      { id: "clap", instrumentId: "clap", measureIndex: 0, offsetBeats: 0 },
      { id: "shaker", instrumentId: "shaker", measureIndex: 0, offsetBeats: 0 }
    ];
    expect(createBeatPatternHits(layered, 0, 4).map((hit) => hit.instrumentId))
      .toEqual(["kick", "clap", "shaker"]);
  });

  it("추가한 밴드 드럼도 놓은 위치에서 함께 연주한다", () => {
    const bandDrums: readonly BeatPatternEvent[] = [
      { id: "tom", instrumentId: "rack-tom", measureIndex: 2, offsetBeats: 1 },
      { id: "open-hat", instrumentId: "open-hihat", measureIndex: 2, offsetBeats: 2 },
      { id: "crash", instrumentId: "crash", measureIndex: 2, offsetBeats: 3 }
    ];
    expect(createBeatPatternHits(bandDrums, 2, 4).map((hit) => hit.instrumentId))
      .toEqual(["rack-tom", "open-hihat", "crash"]);
  });

  it("마디 길이 밖의 소리는 안전하게 연주하지 않는다", () => {
    const outside: readonly BeatPatternEvent[] = [
      { id: "outside", instrumentId: "kick", measureIndex: 0, offsetBeats: 3 }
    ];
    expect(createBeatPatternHits(outside, 0, 3)).toEqual([]);
  });
});
