import { describe, expect, it } from "vitest";
import { findInstrument, INSTRUMENTS } from "./instruments";

describe("악기 라이브러리", () => {
  it("그랜드 피아노를 포함한 여러 서양 악기를 제공한다", () => {
    expect(INSTRUMENTS.length).toBeGreaterThan(100);
    expect(INSTRUMENTS[0].id).toBe("acoustic_grand_piano");
    expect(new Set(INSTRUMENTS.map((instrument) => instrument.id)).size).toBe(INSTRUMENTS.length);
    expect(INSTRUMENTS.every((instrument) => instrument.group === "서양 악기")).toBe(true);
  });

  it("한국 전통악기는 선택 목록에서 제거한다", () => {
    expect(INSTRUMENTS.some((instrument) =>
      ["gayageum", "daegeum", "haegeum", "piri"].includes(instrument.id))).toBe(false);
  });

  it("예전 공유 악보의 국악기 ID는 서양 악기로 안전하게 바꾼다", () => {
    expect(findInstrument("gayageum").id).toBe("acoustic_guitar_nylon");
    expect(findInstrument("daegeum").id).toBe("flute");
    expect(findInstrument("haegeum").id).toBe("violin");
    expect(findInstrument("piri").id).toBe("clarinet");
  });
});
