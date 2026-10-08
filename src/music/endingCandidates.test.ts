import { describe, expect, it } from "vitest";
import { getCandidates, MELODY_CANDIDATE_COUNT } from "./candidates";
import { chordPitchClasses } from "./chord";
import { makeEndingCandidates } from "./endingCandidates";
import { HARMONY_PRESETS } from "./harmonyPresets";
import { melodyFeelingForNotes } from "./melodyFeelings";
import { measureCapacity, SUPPORTED_METERS } from "./meter";
import { toNumber } from "./rational";

describe("마지막 마디 가락", () => {
  it("모든 박자와 화음 이야기에서 마지막 화음의 중심음을 길게 불러 끝난다", () => {
    for (const meter of SUPPORTED_METERS) {
      for (const preset of HARMONY_PRESETS) {
        const chords = preset.bars.at(-1) ?? ["C"];
        const regular = getCandidates(preset.roles[3], meter, chords);
        const endings = makeEndingCandidates(regular, chords, meter);
        const capacity = toNumber(measureCapacity(meter));
        const lastChordStart = capacity * (chords.length - 1) / chords.length;
        const finalRoot = chordPitchClasses(chords.at(-1)!.split("/")[0])[0];

        expect(endings).toHaveLength(MELODY_CANDIDATE_COUNT);
        endings.forEach((ending) => {
          const lastNote = ending.notes.at(-1)!;
          const lastDuration = toNumber(lastNote.duration);
          expect(lastNote.pitch).not.toBeNull();
          expect(lastNote.pitch! % 12).toBe(finalRoot);
          expect(lastDuration).toBeGreaterThanOrEqual(0.5);
          expect(capacity - lastDuration).toBeGreaterThanOrEqual(lastChordStart);
          expect(ending.notes.reduce((sum, note) => sum + toNumber(note.duration), 0)).toBe(capacity);
          expect(ending.feelingId).toBe(melodyFeelingForNotes(ending.notes));
        });
      }
    }
  });

  it("마지막 화음이 자리바꿈이어도 베이스가 아닌 화음의 중심음에 도착한다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    const endings = makeEndingCandidates(getCandidates("home", meter, ["C", "G7/B"]), ["C", "G7/B"], meter);
    expect(endings.every((candidate) => candidate.notes.at(-1)?.pitch! % 12 === 7)).toBe(true);
  });

  it("도착음은 같아도 앞부분의 가락과 리듬은 다양하다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    const regular = getCandidates("home", meter, ["C", "G"]);
    const endings = makeEndingCandidates(regular, ["C", "G"], meter);
    const patterns = new Set(endings.map((candidate) => candidate.notes
      .map((note) => `${note.pitch ?? "쉼"}:${toNumber(note.duration)}`).join("|")));
    expect(patterns.size).toBeGreaterThanOrEqual(10);
    expect(new Set(endings.map((candidate) => candidate.feelingId)).size).toBeGreaterThanOrEqual(3);
    expect(regular[0].name.endsWith("마침")).toBe(false);
  });
});
