import { describe, expect, it } from "vitest";
import { measureCapacity, validateMeasure } from "./meter";
import { rational } from "./rational";

describe("마디 박자 검증", () => {
  it.each([
    [{ beats: 2, beatUnit: 4 as const }, rational(2)],
    [{ beats: 3, beatUnit: 4 as const }, rational(3)],
    [{ beats: 4, beatUnit: 4 as const }, rational(4)],
    [{ beats: 6, beatUnit: 8 as const }, rational(3)],
    [{ beats: 9, beatUnit: 8 as const }, rational(9, 2)],
    [{ beats: 12, beatUnit: 8 as const }, rational(6)]
  ])("지원 박자의 정확한 용량을 계산한다", (meter, expected) => {
    expect(measureCapacity(meter)).toEqual(expected);
  });

  it("정확히 네 박인 마디를 통과시킨다", () => {
    const result = validateMeasure(
      [{ duration: rational(1) }, { duration: rational(1) }, { duration: rational(2) }],
      { beats: 4, beatUnit: 4 }
    );
    expect(result.state).toBe("exact");
  });

  it("반 박 부족과 초과를 구분한다", () => {
    const short = validateMeasure(
      [{ duration: rational(3) }, { duration: rational(1, 2) }],
      { beats: 4, beatUnit: 4 }
    );
    const over = validateMeasure(
      [{ duration: rational(4) }, { duration: rational(1, 2) }],
      { beats: 4, beatUnit: 4 }
    );
    expect(short.state).toBe("short");
    expect(short.difference).toEqual(rational(1, 2));
    expect(over.state).toBe("over");
    expect(over.difference).toEqual(rational(1, 2));
  });
});
