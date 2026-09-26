import { describe, expect, it } from "vitest";
import { getCandidates } from "./candidates";
import { chordPitchClasses } from "./chord";
import { HARMONY_PRESETS } from "./harmonyPresets";
import { repeatMelody } from "./melodyRepeat";
import { SUPPORTED_METERS, validateMeasure } from "./meter";
import { toNumber } from "./rational";

describe("좋아하는 가락 다시 들려주기", () => {
  const meter = { beats: 4, beatUnit: 4 } as const;
  const source = getCandidates("home", meter, ["C"])[0].notes.map((note, index) =>
    ({ ...note, lyric: index === 0 ? "나" : "" }));

  it("같은 화음에는 음, 리듬, 가사를 그대로 옮기되 음표 ID는 새로 만든다", () => {
    const repeated = repeatMelody(source, ["C"], ["C"], "home", 0, 4, "again");
    expect(repeated.notes.map((note) => note.pitch)).toEqual(source.map((note) => note.pitch));
    expect(repeated.notes.map((note) => note.duration)).toEqual(source.map((note) => note.duration));
    expect(repeated.notes[0].lyric).toBe("나");
    expect(repeated.notes[0].id).not.toBe(source[0].id);
  });

  it("화음이 바뀌면 리듬은 유지하고 음을 새 화음에 맞춘다", () => {
    const repeated = repeatMelody(source, ["C"], ["F", "G"], "journey", 0, 4, "again");
    expect(validateMeasure(repeated.notes, meter).state).toBe("exact");
    let onset = 0;
    repeated.notes.forEach((note) => {
      const chord = onset < 2 ? "F" : "G";
      if (note.pitch !== null) expect(chordPitchClasses(chord)).toContain(note.pitch % 12);
      onset += toNumber(note.duration);
    });
  });

  it("끝만 다르게 해도 앞부분과 박자 길이는 같다", () => {
    const plain = repeatMelody(source, ["C"], ["C"], "home", 0, 4, "again");
    const changed = repeatMelody(source, ["C"], ["C"], "home", 0, 4, "new-ending");
    expect(changed.notes.slice(0, -1).map((note) => note.pitch))
      .toEqual(plain.notes.slice(0, -1).map((note) => note.pitch));
    expect(changed.notes.at(-1)?.pitch).not.toBe(plain.notes.at(-1)?.pitch);
    expect(validateMeasure(changed.notes, meter).state).toBe("exact");
  });

  it("모든 화음 이야기와 박자에서 반복한 가락도 마디 길이에 맞는다", () => {
    for (const preset of HARMONY_PRESETS) {
      for (const currentMeter of SUPPORTED_METERS) {
        const first = getCandidates(preset.roles[0], currentMeter, preset.bars[0])[0];
        for (const mode of ["again", "new-ending"] as const) {
          const repeated = repeatMelody(first.notes, preset.bars[0], preset.bars[1],
            preset.roles[1], 0, 1, mode);
          expect(validateMeasure(repeated.notes, currentMeter).state).toBe("exact");
          expect(repeated.notes.map((note) => toNumber(note.duration)))
            .toEqual(first.notes.map((note) => toNumber(note.duration)));
        }
      }
    }
  });
});
