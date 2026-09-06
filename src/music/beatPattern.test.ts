import { describe, expect, it } from "vitest";
import {
  beatPatternInstrumentIds,
  beatPatternMeasureBeats,
  beatPatternSlotOffset,
  beatPatternSubdivision,
  isValidBeatPattern,
  normalizeBeatPattern,
  type BeatPatternEvent
} from "./beatPattern";

describe("4마디 직접 비트 패턴", () => {
  it("4/4박자는 한 마디에 네 개의 한 박자 칸을 사용한다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    expect(beatPatternMeasureBeats(meter)).toBe(4);
    expect(Array.from({ length: meter.beats }, (_, index) => beatPatternSlotOffset(meter, index)))
      .toEqual([0, 1, 2, 3]);
  });

  it("6/8박자는 한 마디에 여섯 개의 8분음표 칸을 사용한다", () => {
    const meter = { beats: 6, beatUnit: 8 } as const;
    expect(beatPatternMeasureBeats(meter)).toBe(3);
    expect(Array.from({ length: meter.beats }, (_, index) => beatPatternSlotOffset(meter, index)))
      .toEqual([0, .5, 1, 1.5, 2, 2.5]);
  });

  it("한 박자를 절반과 1/4박자 위치까지 나눌 수 있다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    expect(Array.from({ length: 4 }, (_, index) => beatPatternSlotOffset(meter, index, 4)))
      .toEqual([0, .25, .5, .75]);
    expect(isValidBeatPattern([
      { id: "quarter", instrumentId: "kick", measureIndex: 0, offsetBeats: .25 }
    ], meter)).toBe(true);
    expect(isValidBeatPattern([
      { id: "too-small", instrumentId: "kick", measureIndex: 0, offsetBeats: .125 }
    ], meter)).toBe(false);
  });

  it("저장된 위치에 맞춰 악기 줄의 필요한 박자 나눔을 찾는다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    const events: readonly BeatPatternEvent[] = [
      { id: "half", instrumentId: "kick", measureIndex: 0, offsetBeats: .5 },
      { id: "quarter", instrumentId: "kick", measureIndex: 1, offsetBeats: .25 }
    ];
    expect(beatPatternSubdivision(events, "kick", meter, 0)).toBe(2);
    expect(beatPatternSubdivision(events, "kick", meter, 1)).toBe(4);
    expect(beatPatternSubdivision(events, "kick", meter, 2)).toBe(1);
  });

  it("같은 악기와 위치의 중복은 하나만 남긴다", () => {
    const event: BeatPatternEvent = {
      id: "first", instrumentId: "clap", measureIndex: 2, offsetBeats: 1
    };
    expect(normalizeBeatPattern([event, { ...event, id: "second" }], { beats: 4, beatUnit: 4 }))
      .toEqual([event]);
  });

  it("네 마디 밖이나 박자 칸에서 벗어난 위치는 거부한다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    expect(isValidBeatPattern([
      { id: "valid", instrumentId: "kick", measureIndex: 3, offsetBeats: 3 }
    ], meter)).toBe(true);
    expect(isValidBeatPattern([
      { id: "invalid", instrumentId: "kick", measureIndex: 4, offsetBeats: .5 }
    ], meter)).toBe(false);
  });

  it("샘플 준비에 필요한 악기 목록은 중복 없이 만든다", () => {
    const events: readonly BeatPatternEvent[] = [
      { id: "a", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 },
      { id: "b", instrumentId: "kick", measureIndex: 1, offsetBeats: 0 },
      { id: "c", instrumentId: "ride", measureIndex: 1, offsetBeats: 2 }
    ];
    expect(beatPatternInstrumentIds(events)).toEqual(["kick", "ride"]);
  });

  it("재생할 비트 악기는 처음 고른 세 개까지만 유지한다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    const events: readonly BeatPatternEvent[] = [
      { id: "a", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 },
      { id: "b", instrumentId: "snare", measureIndex: 0, offsetBeats: 1 },
      { id: "c", instrumentId: "hihat", measureIndex: 0, offsetBeats: 2 },
      { id: "d", instrumentId: "ride", measureIndex: 0, offsetBeats: 3 }
    ];
    expect(beatPatternInstrumentIds(normalizeBeatPattern(events, meter)))
      .toEqual(["kick", "snare", "hihat"]);
  });

  it("예전 저장 데이터의 네 악기 패턴도 읽은 뒤 화면에서 세 악기로 정리할 수 있다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    const events: readonly BeatPatternEvent[] = [
      { id: "a", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 },
      { id: "b", instrumentId: "snare", measureIndex: 0, offsetBeats: 1 },
      { id: "c", instrumentId: "hihat", measureIndex: 0, offsetBeats: 2 },
      { id: "d", instrumentId: "ride", measureIndex: 0, offsetBeats: 3 }
    ];
    expect(isValidBeatPattern(events, meter)).toBe(true);
    expect(normalizeBeatPattern(events, meter)).toHaveLength(3);
  });
});
