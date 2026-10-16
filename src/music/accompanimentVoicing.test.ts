import { describe, expect, it } from "vitest";
import { accompanimentVoicingCandidates, chordVoicingClasses } from "./accompanimentVoicing";
import { chordPitchClasses } from "./chord";

function pitchClasses(pitches: readonly number[]): number[] {
  return [...new Set(pitches.map((pitch) => ((pitch % 12) + 12) % 12))].sort((left, right) => left - right);
}

describe("학생 화음의 Tonal 반주 보이싱", () => {
  it("장·단화음의 닫힌 전위와 열린 전위를 악기 음역 안에 제공한다", () => {
    const major = accompanimentVoicingCandidates(chordPitchClasses("C"), [48, 76, 60]);
    expect(major).toContainEqual([60, 64, 67]);
    expect(major).toContainEqual([64, 67, 72]);
    expect(major).toContainEqual([55, 64, 72]);
    const minor = accompanimentVoicingCandidates(chordPitchClasses("Cm"), [48, 76, 60]);
    expect(minor).toContainEqual([60, 63, 67]);
    expect(minor).not.toContainEqual([60, 64, 67]);
  });

  it("7화음에 지정하지 않은 9음·13음을 자동으로 추가하지 않는다", () => {
    for (const chord of ["C7", "Cm7", "Cmaj7", "Fm6", "Bm7♭5", "C♯dim7", "Cadd9"]) {
      const tones = chordPitchClasses(chord);
      const candidates = accompanimentVoicingCandidates(tones, [40, 81, 60]);
      expect(candidates.length, chord).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(pitchClasses(candidate), chord).toEqual(pitchClasses(tones));
        expect(candidate).toHaveLength(tones.length);
      }
    }
  });

  it("복잡한 화음은 5음보다 3·7·확장음을 보존해 네 성부로 연주한다", () => {
    expect(chordVoicingClasses(chordPitchClasses("Cmaj9"))).toEqual([0, 4, 11, 2]);
    expect(chordVoicingClasses(chordPitchClasses("E7♯9"))).toEqual([4, 8, 2, 7]);
    expect(chordVoicingClasses([0, 4, 7, 10, 2, 5, 9])).toEqual([4, 10, 2, 9]);
    const candidates = accompanimentVoicingCandidates(chordPitchClasses("G7♭9"), [40, 81, 60]);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) expect(pitchClasses(candidate)).toEqual([5, 7, 8, 11]);
  });

  it("특별 화음·로마숫자 화음도 앱에서 지정한 음높이 종류를 그대로 사용한다", () => {
    for (const chord of ["It+6", "Fr+6", "Ger+6", "I", "IV", "V7"]) {
      const tones = chordPitchClasses(chord);
      const candidates = accompanimentVoicingCandidates(tones, [48, 81, 64]);
      expect(candidates.length, chord).toBeGreaterThan(0);
      for (const candidate of candidates) expect(pitchClasses(candidate), chord).toEqual(pitchClasses(tones));
    }
  });

  it("모든 조에서 네 화음음을 중복·누락 없이 악기 음역 안에 배치한다", () => {
    for (let root = 0; root < 12; root += 1) {
      const tones = [0, 4, 7, 10].map((tone) => (tone + root) % 12);
      const candidates = accompanimentVoicingCandidates(tones, [48, 72, 60]);
      expect(candidates.length, `root ${root}`).toBeGreaterThan(0);
      for (const candidate of candidates) {
        expect(pitchClasses(candidate)).toEqual(pitchClasses(tones));
        expect(candidate).toHaveLength(4);
        expect(candidate.every((pitch) => pitch >= 48 && pitch <= 72)).toBe(true);
        expect([...candidate].sort((left, right) => left - right)).toEqual(candidate);
      }
    }
  });

  it("악기 음역이 화음을 담지 못하면 다른 음으로 바꾸거나 옥타브를 강제로 누르지 않는다", () => {
    expect(accompanimentVoicingCandidates([0, 4, 7], [60, 64, 62])).toEqual([]);
    expect(accompanimentVoicingCandidates([0, 4, 7], [72, 48, 60])).toEqual([]);
    expect(accompanimentVoicingCandidates([], [48, 72, 60])).toEqual([]);
    expect(accompanimentVoicingCandidates([0, 4, 7], [Number.NaN, 72, 60])).toEqual([]);
    expect(accompanimentVoicingCandidates([0, 4, 7], [0, 7])).toContainEqual([0, 4, 7]);
  });

  it("반복 계산을 재사용하고 원본 화음과 반환된 보이싱을 변경하지 않는다", () => {
    const tones = Object.freeze([0, 4, 7, 10]);
    const first = accompanimentVoicingCandidates(tones, [48, 76, 62]);
    const second = accompanimentVoicingCandidates(tones, [48, 76, 62]);
    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every(Object.isFrozen)).toBe(true);
    expect(tones).toEqual([0, 4, 7, 10]);
  });
});
