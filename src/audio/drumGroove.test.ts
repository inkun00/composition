import { describe, expect, it } from "vitest";
import { createDrumGroove } from "./drumGroove";

describe("노래 반주 드럼", () => {
  it("빠른 반주는 킥, 스네어, 하이햇으로 박자를 잡아준다", () => {
    const kinds = new Set(createDrumGroove("kpop", 4).map((hit) => hit.kind));
    expect(kinds).toEqual(new Set(["kick", "snare", "hat"]));
  });

  it("4마디 끝에는 다음 구간으로 넘어가는 필인을 더한다", () => {
    expect(createDrumGroove("children_song", 4, undefined, true).length)
      .toBeGreaterThan(createDrumGroove("children_song", 4).length);
  });

  it("잔잔한 반주는 드럼으로 분위기를 덮지 않는다", () => {
    expect(createDrumGroove("arpeggio", 4)).toHaveLength(0);
    expect(createDrumGroove("opera", 4)).toHaveLength(0);
  });
});
