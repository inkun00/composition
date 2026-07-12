import { describe, expect, it } from "vitest";
import { HARMONY_PRESETS } from "./harmonyPresets";
import { chordPitchClasses } from "./chord";
import { getCandidates } from "./candidates";
import { validateMeasure } from "./meter";
import { toNumber } from "./rational";

describe("100가지 화음 이야기", () => {
  it("서로 다른 어린이용 이름 100개를 제공한다", () => {
    expect(HARMONY_PRESETS).toHaveLength(100);
    expect(new Set(HARMONY_PRESETS.map((preset) => preset.childName)).size).toBe(100);
  });

  it("모든 이야기는 네 마디 역할과 쉬운 표현을 가진다", () => {
    const forbidden = /재즈|모달|감화음|증화음|도미넌트|토닉|코드|디즈니|저스틴|레이디|스타워즈|악마|섹시|치명적|정신 착란|파괴적|폭발적|끈적|[A-G][#♭]?/i;
    for (const preset of HARMONY_PRESETS) {
      expect(preset.roles).toHaveLength(4);
      expect(preset.bars).toHaveLength(4);
      expect(preset.bars.every((bar) => bar.length >= 1 && bar.length <= 2)).toBe(true);
      expect(preset.childName).not.toMatch(forbidden);
      expect(preset.mood).not.toMatch(forbidden);
    }
  });

  it("이름뿐 아니라 실제 화음 흐름과 가락 성격도 충분히 다르다", () => {
    const progressionKeys = HARMONY_PRESETS.map((preset) => preset.bars.map((bar) => bar.join("+")).join("|"));
    expect(new Set(progressionKeys).size).toBe(100);
    expect(new Set(HARMONY_PRESETS.flatMap((preset) => preset.roles)).size).toBe(12);
  });

  it("100개 이야기의 모든 가락이 해당 마디 화음 구성음과 박자에 맞는다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    for (const preset of HARMONY_PRESETS) {
      preset.bars.forEach((chords, barIndex) => {
        const candidates = getCandidates(preset.roles[barIndex], meter, chords);
        for (const candidate of candidates) {
          expect(validateMeasure(candidate.notes, meter).state).toBe("exact");
          let onset = 0;
          const chordDuration = 4 / chords.length;
          for (const note of candidate.notes) {
            if (note.pitch !== null) {
              const chordIndex = Math.min(Math.floor(onset / chordDuration), chords.length - 1);
              expect(chordPitchClasses(chords[chordIndex])).toContain(((note.pitch % 12) + 12) % 12);
            }
            onset += toNumber(note.duration);
          }
        }
      });
    }
  });
});
