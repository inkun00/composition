import { describe, expect, it } from "vitest";
import { analyzeAccompanimentEnsemble, analyzeEnsembleMelody, assignEnsembleRoles,
  ensembleContextForMeasure, ensembleRoleForInstrument } from "./accompanimentEnsemble";
import { rational } from "./rational";
import type { NoteEvent } from "./types";

const notesFor = (pitches: readonly (number | null)[], duration = 1): NoteEvent[] => pitches.map((pitch, index) => ({
  id: `note-${index}`, pitch, duration: rational(duration)
}));
const measuresFor = (count: number) => Array.from({ length: count }, (_, measureIndex) => ({
  notes: notesFor([60 + measureIndex, 62 + measureIndex, 64 + measureIndex, 65 + measureIndex]),
  chords: [measureIndex % 2 === 0 ? "C" : "F"], measureIndex
}));

describe("가락과 선택 악기 전체를 함께 보는 편곡 문맥", () => {
  it("선택 순서와 관계없이 같은 악기 특성에 같은 역할을 배분한다", () => {
    const instruments = ["recorder", "bright_acoustic_piano", "clarinet", "acoustic_bass"];
    expect(assignEnsembleRoles(instruments)).toEqual(assignEnsembleRoles([...instruments].reverse()));
    const assignments = assignEnsembleRoles(instruments);
    expect(assignments.find((part) => part.instrumentId === "acoustic_bass")?.role).toBe("bass");
    expect(assignments.find((part) => part.instrumentId === "bright_acoustic_piano")?.role).toBe("harmony");
    expect(assignments.find((part) => part.instrumentId === "clarinet")?.role).toBe("counterline");
    expect(assignments.find((part) => part.instrumentId === "recorder")?.role).toBe("answer");
  });

  it("같은 성부의 두 악기에도 다른 박자 위치와 음역을 준다", () => {
    const assignments = assignEnsembleRoles(["electric_piano_1", "bright_acoustic_piano"]);
    expect(assignments.map((part) => part.role)).toEqual(["harmony", "pulse"]);
    expect(new Set(assignments.map((part) => part.rhythmicOffsetBeats)).size).toBe(2);
    expect(assignments[1].registerCenter).toBeGreaterThan(assignments[0].registerCenter);
    expect(assignments.every((part) => part.familyCount === 2)).toBe(true);
  });

  it("베이스 유무에 따라 첼로가 낮은 받침과 대선율을 맡는다", () => {
    const withoutBass = assignEnsembleRoles(["acoustic_grand_piano", "cello"]);
    const withBass = assignEnsembleRoles(["acoustic_grand_piano", "cello", "acoustic_bass"]);
    expect(withoutBass.find((part) => part.instrumentId === "cello")?.role).toBe("bass");
    expect(withBass.find((part) => part.instrumentId === "cello")?.role).toBe("counterline");
  });

  it("앞뒤 마디와 학생이 선택한 코드·가락을 그대로 참조한다", () => {
    const measures = measuresFor(8);
    const context = analyzeAccompanimentEnsemble(measures, ["clarinet", "recorder"]).measures[1];
    expect(context.previous).toBe(measures[0]);
    expect(context.current).toBe(measures[1]);
    expect(context.next).toBe(measures[2]);
    expect(context.current.notes).toBe(measures[1].notes);
    expect(context.current.chords).toBe(measures[1].chords);
    expect(ensembleRoleForInstrument(context, "recorder")?.responsePhase).toBe(1);
  });

  it("네 마디 안에서는 가락 동기를 공유하고 다음 프레이즈에서는 새 동기를 읽는다", () => {
    const measures = measuresFor(8);
    const score = analyzeAccompanimentEnsemble(measures, ["flute"]);
    expect(score.measures[0].motif).toEqual(score.measures[3].motif);
    expect(score.measures[4].motif).not.toEqual(score.measures[0].motif);
    expect(score.measures[3].phraseEnding).toBe(true);
    expect(score.measures[4].phraseIndex).toBe(1);
    expect(score.measures[7].phraseEnding).toBe(true);
  });

  it("학생의 리듬과 가락 변화가 동기 윤곽과 활동량에 반영된다", () => {
    const slow = analyzeAccompanimentEnsemble([{ notes: notesFor([60, 64], 2) }], ["recorder"]).measures[0];
    const fast = analyzeAccompanimentEnsemble([{ notes: notesFor([67, 65, 64, 62]) }], ["recorder"]).measures[0];
    expect(slow.melody.onsetDensity).toBe(.5);
    expect(fast.melody.onsetDensity).toBe(1);
    expect(slow.motif.map((note) => note.interval)).toEqual([0, 4]);
    expect(fast.motif.map((note) => note.interval)).toEqual([0, -2, -1, -2]);
    expect(slow.motif.map((note) => note.offsetBeats)).toEqual([0, 2]);
  });

  it("붙임줄은 새 발음으로 세지 않고 쉼표의 실제 빈 시간을 계산한다", () => {
    const notes = notesFor([60, 60, null, 64]);
    notes[0] = { ...notes[0], linkToNext: true };
    const analysis = analyzeEnsembleMelody(notes);
    expect(analysis.onsets).toEqual([0, 3]);
    expect(analysis.gaps).toEqual([{ onset: 2, end: 3 }]);
    expect(analysis.activeFraction).toBe(.75);
    expect(analysis.onsetDensity).toBe(.5);
    expect(analysis.contour).toEqual([4]);
  });

  it("전주와 후주는 학생 가락을 복제하지 않고 해당 코드와 무가락 문맥을 제공한다", () => {
    const measures = measuresFor(4);
    const intro = analyzeAccompanimentEnsemble(measures, ["recorder"], "intro");
    const outro = analyzeAccompanimentEnsemble(measures, ["recorder"], "outro");
    for (const score of [intro, outro]) {
      expect(score.measures[0].motif).toEqual([]);
      expect(score.measures[0].melody.activeFraction).toBe(0);
      expect(score.measures[0].current.notes.every((note) => note.pitch === null)).toBe(true);
      expect(score.measures[0].next?.notes.every((note) => note.pitch === null)).toBe(true);
      expect(score.measures[0].current.chords).toBe(measures[0].chords);
    }
    expect(measures[0].notes[0].pitch).toBe(60);
  });

  it("곡 중간부터 재생해도 원래 마디 번호와 프레이즈 위치를 유지한다", () => {
    const score = analyzeAccompanimentEnsemble(measuresFor(8).slice(5), ["flute"]);
    const context = ensembleContextForMeasure(score, 5);
    expect(context?.measureIndex).toBe(5);
    expect(context?.scorePosition).toBe(0);
    expect(context?.phraseIndex).toBe(1);
    expect(context?.phrasePosition).toBe(1);
    expect(ensembleContextForMeasure(score, 0)).toBeUndefined();
  });

  it("악기 중복을 제거하고 빈 악보도 안전하게 분석한다", () => {
    const score = analyzeAccompanimentEnsemble([], ["recorder", "recorder"]);
    expect(score.instrumentIds).toEqual(["recorder"]);
    expect(score.measures).toEqual([]);
    expect(analyzeEnsembleMelody([]).onsetDensity).toBe(0);
  });
});
