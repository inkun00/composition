import { describe, expect, it } from "vitest";
import {
  accidentalAfterPitchMove,
  accidentalSymbol,
  displayedAccidentalSymbol,
  keySignatureName,
  midiToVexKey,
  staffDegreeForPitch
} from "./accidental";

describe("반음 편집의 임시표", () => {
  it("검은 건반 음으로 올리면 샵, 내리면 플랫을 선택한다", () => {
    expect(accidentalAfterPitchMove(60, 61)).toBe("sharp");
    expect(accidentalAfterPitchMove(62, 61)).toBe("flat");
    expect(accidentalSymbol(61, "sharp")).toBe("♯");
    expect(accidentalSymbol(61, "flat")).toBe("♭");
  });

  it("도착 음이 자연음이면 이전 임시표를 지운다", () => {
    expect(accidentalAfterPitchMove(61, 62, "sharp")).toBeUndefined();
    expect(accidentalAfterPitchMove(61, 60, "flat")).toBeUndefined();
  });

  it("조표에 포함된 변화음은 중복 표시하지 않고 자연음 복귀에는 제자리표를 붙인다", () => {
    expect(keySignatureName(-1)).toBe("F");
    expect(keySignatureName(2)).toBe("D");
    expect(displayedAccidentalSymbol(70, "flat", -1)).toBe("");
    expect(displayedAccidentalSymbol(66, "sharp", 1)).toBe("");
    expect(displayedAccidentalSymbol(71, "natural", -1)).toBe("♮");
    expect(accidentalAfterPitchMove(70, 71, "flat", -1)).toBe("natural");
  });

  it("같은 MIDI 음도 올림·내림 방향에 맞는 이름과 오선 위치로 쓴다", () => {
    expect(midiToVexKey(61, "sharp")).toBe("c#/4");
    expect(midiToVexKey(61, "flat")).toBe("db/4");
    expect(staffDegreeForPitch(61, "sharp")).toBe(28);
    expect(staffDegreeForPitch(61, "flat")).toBe(29);
  });
});
