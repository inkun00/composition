import { describe, expect, it } from "vitest";
import { add, compare, equals, rational, subtract } from "./rational";

describe("유리수 박자 계산", () => {
  it("분수를 가장 작은 비율로 저장한다", () => {
    expect(rational(2, 4)).toEqual({ numerator: 1, denominator: 2 });
  });

  it("부동소수점 없이 박자를 더하고 뺀다", () => {
    expect(add(rational(1, 2), rational(1, 4))).toEqual(rational(3, 4));
    expect(subtract(rational(4), rational(1, 2))).toEqual(rational(7, 2));
    expect(equals(add(rational(1, 3), rational(2, 3)), rational(1))).toBe(true);
    expect(compare(rational(7, 8), rational(1))).toBeLessThan(0);
  });

  it("0인 분모를 거부한다", () => {
    expect(() => rational(1, 0)).toThrow("분모는 0일 수 없습니다.");
  });
});
