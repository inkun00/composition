import { describe, expect, it } from "vitest";
import { accompanimentInstrumentProfile } from "../music/accompaniment";
import { analyzeAccompanimentEnsemble } from "../music/accompanimentEnsemble";
import { chordPitchClasses } from "../music/chord";
import { HARMONY_PRESETS } from "../music/harmonyPresets";
import { measureCapacity, SUPPORTED_METERS } from "../music/meter";
import { rational, toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { createArrangementVoiceState, type AccompanimentPerformanceNote } from "./accompanimentPerformance";
import { planAccompanimentEnsemble } from "./ensemblePerformance";

const instruments = ["bright_acoustic_piano", "acoustic_bass", "clarinet", "recorder"];
const winds = ["clarinet", "recorder"];
const secondsPerBeat = .5;
const note = (pitch: number | null, numerator: number, denominator = 1): NoteEvent => ({
  id: `${pitch}:${numerator}/${denominator}`, pitch, duration: rational(numerator, denominator)
});
const busyMelody = [60, 62, 64, 65, 67, 65, 64, 62].map((pitch) => note(pitch, 1, 2));
const base = {
  notes: busyMelody, chords: ["C"], fallbackPitches: [48, 52, 55],
  styleId: "children_song" as const, secondsPerBeat,
  meter: { beats: 4, beatUnit: 4 } as const, measureIndex: 0
};
const pc = (pitch: number) => ((pitch % 12) + 12) % 12;
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const shape = (notes: readonly AccompanimentPerformanceNote[]) => notes.map((item) => ({
  pitch: item.pitch, start: item.offsetSeconds, duration: item.durationSeconds
}));

describe("학생 가락을 위한 합주 전체 연주 설계", () => {
  it("촘촘한 가락에도 관악기는 긴 음과 음높이 진행이 있는 구절을 만들고 숨을 쉰다", () => {
    const measures = ["C", "F", "G7", "C"].map((chord, measureIndex) => ({
      notes: busyMelody, chords: [chord], measureIndex
    }));
    const ensemble = analyzeAccompanimentEnsemble(measures, instruments);
    const state = createArrangementVoiceState();
    const phrase = winds.map(() => [] as AccompanimentPerformanceNote[]);
    for (const [index, measure] of measures.entries()) {
      const performance = planAccompanimentEnsemble({ ...base, ...measure,
        ensemble: ensemble.measures[index], state }, instruments);
      for (const [windIndex, instrumentId] of winds.entries()) {
        const notes = performance.get(instrumentId)!;
        const occupied = notes.reduce((sum, item) => sum + item.durationSeconds, 0);
        // A substantial phrase replaces the old isolated 0.22-beat squeak.
        expect(occupied / 2, instrumentId).toBeGreaterThan(.35);
        expect(Math.max(...notes.map((item) => item.durationSeconds)), instrumentId).toBeGreaterThan(.45);
        expect(notes.at(-1)!.offsetSeconds + notes.at(-1)!.durationSeconds, instrumentId).toBeLessThan(1.98);
        for (let noteIndex = 1; noteIndex < notes.length; noteIndex += 1) {
          const previous = notes[noteIndex - 1];
          expect(notes[noteIndex].offsetSeconds, instrumentId).toBeGreaterThanOrEqual(
            previous.offsetSeconds + previous.durationSeconds - .001);
        }
        phrase[windIndex].push(...notes);
      }
    }
    for (const notes of phrase) {
      expect(new Set(notes.map((item) => item.pitch)).size).toBeGreaterThan(2);
      expect(Math.max(...notes.slice(1).map((item, index) => Math.abs(item.pitch - notes[index].pitch))))
        .toBeLessThanOrEqual(12);
    }
  });

  it("클라리넷의 받침 선율과 리코더의 응답은 음역·진입·진행을 구별한다", () => {
    const performance = planAccompanimentEnsemble(base, instruments);
    const clarinet = performance.get("clarinet")!;
    const recorder = performance.get("recorder")!;
    expect(mean(clarinet.map((item) => item.pitch))).toBeLessThan(mean(recorder.map((item) => item.pitch)));
    expect(clarinet[0].offsetSeconds).toBeLessThan(recorder[0].offsetSeconds);
    expect(shape(clarinet)).not.toEqual(shape(recorder));
    for (const left of clarinet) for (const right of recorder) {
      const overlap = Math.min(left.offsetSeconds + left.durationSeconds, right.offsetSeconds + right.durationSeconds)
        - Math.max(left.offsetSeconds, right.offsetSeconds);
      if (overlap > .1) expect(Math.abs(left.pitch - right.pitch)).not.toBe(0);
    }
  });

  it("빠른 학생 가락에는 느린 받침을, 긴 쉼에는 응답 구절을 배치한다", () => {
    const dense = planAccompanimentEnsemble(base, instruments).get("clarinet")!;
    const slow = planAccompanimentEnsemble({ ...base, notes: [note(64, 4)] }, instruments).get("clarinet")!;
    expect(mean(dense.map((item) => item.durationSeconds))).toBeGreaterThan(mean(slow.map((item) => item.durationSeconds)));
    const withRest = planAccompanimentEnsemble({ ...base,
      notes: [note(64, 1), note(67, 1), note(null, 2)] }, instruments).get("recorder")!;
    expect(withRest.every((item) => item.offsetSeconds >= 1)).toBe(true);
    expect(withRest.some((item) => item.pitch !== withRest[0].pitch)).toBe(true);
  });

  it("같은 코드와 음역에서도 학생 가락의 상승·하강 윤곽에 반응한다", () => {
    const ascending = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch) => note(pitch, 1, 2));
    const descending = [...ascending].reverse();
    const upward = planAccompanimentEnsemble({ ...base, notes: ascending }, instruments);
    const downward = planAccompanimentEnsemble({ ...base, notes: descending }, instruments);
    expect(winds.map((id) => upward.get(id)!.map((item) => item.pitch)))
      .not.toEqual(winds.map((id) => downward.get(id)!.map((item) => item.pitch)));
  });

  it("악기의 선택 순서와 중복 선택은 어느 성부의 악보도 바꾸지 않는다", () => {
    const forward = planAccompanimentEnsemble(base, instruments);
    const reversed = planAccompanimentEnsemble(base, [...instruments].reverse());
    const duplicate = planAccompanimentEnsemble(base, [...instruments, "recorder"]);
    expect([...forward]).toEqual([...reversed]);
    expect([...forward]).toEqual([...duplicate]);
    expect([...forward.keys()].sort()).toEqual([...instruments].sort());
  });

  it("베이스가 추가되면 첼로가 낮은 뿌리음 반복에서 보조선율로 역할을 바꾼다", () => {
    const duet = planAccompanimentEnsemble(base, ["bright_acoustic_piano", "cello"]).get("cello")!;
    const trio = planAccompanimentEnsemble(base, ["bright_acoustic_piano", "cello", "acoustic_bass"]).get("cello")!;
    expect(duet.every((item) => pc(item.pitch) === 0)).toBe(true);
    expect(new Set(trio.map((item) => item.pitch)).size).toBeGreaterThan(1);
    expect(mean(trio.map((item) => item.pitch))).toBeGreaterThan(mean(duet.map((item) => item.pitch)));
  });

  it("보사노바·셔플·오페라는 관악기에도 다른 리듬과 음 길이를 준다", () => {
    const signatures = (["bossa", "shuffle", "opera"] as const).map((styleId) => {
      const performance = planAccompanimentEnsemble({ ...base, styleId }, instruments);
      return winds.map((id) => performance.get(id)!.map((item) => [item.offsetSeconds, item.durationSeconds]));
    });
    expect(new Set(signatures.map((signature) => JSON.stringify(signature))).size).toBe(3);
  });

  for (const secondary of ["electric_piano_1", "acoustic_guitar_steel"]) {
    it(`두 번째 화음 악기 ${secondary}는 주 화음과 다른 박자에서 얇은 성부를 맡는다`, () => {
      const performance = planAccompanimentEnsemble({ ...base, notes: [note(null, 4)],
        styleId: "folk" }, ["bright_acoustic_piano", secondary]);
      const primary = performance.get("bright_acoustic_piano")!;
      const supporting = performance.get(secondary)!;
      const clusters = (part: readonly AccompanimentPerformanceNote[]) => {
        const result: AccompanimentPerformanceNote[][] = [];
        for (const item of part) {
          const previous = result.at(-1);
          if (previous && item.offsetSeconds - previous[0].offsetSeconds < .09) previous.push(item);
          else result.push([item]);
        }
        return result;
      };
      expect(clusters(primary).some((cluster) => cluster.length >= 3)).toBe(true);
      expect(clusters(supporting).every((cluster) => cluster.length <= 2)).toBe(true);
      expect(supporting[0].offsetSeconds).toBeGreaterThan(primary[0].offsetSeconds + .1);
      expect(mean(supporting.map((item) => item.pitch))).toBeGreaterThan(mean(primary.map((item) => item.pitch)));
      expect(clusters(supporting).map((cluster) => cluster[0].offsetSeconds))
        .not.toEqual(clusters(primary).map((cluster) => cluster[0].offsetSeconds));
    });
  }

  for (const meter of SUPPORTED_METERS) {
    it(`${meter.beats}/${meter.beatUnit}의 모든 화음 전환에서 구성음·악기 음역·마디 경계를 지킨다`, () => {
      const beats = toNumber(measureCapacity(meter));
      const notes = Array.from({ length: beats * 2 }, (_, index) => note(60 + index % 5, 1, 2));
      for (const preset of HARMONY_PRESETS) for (const chords of preset.bars) {
        const performance = planAccompanimentEnsemble({ ...base, meter, notes, chords }, instruments);
        const chordSeconds = beats * secondsPerBeat / chords.length;
        for (const [instrumentId, part] of performance) {
          const [min, max] = accompanimentInstrumentProfile(instrumentId, 0).range;
          expect(part.length, `${preset.id}/${instrumentId}`).toBeGreaterThan(0);
          for (const item of part) {
            const chordIndex = Math.min(chords.length - 1, Math.floor((item.offsetSeconds + .00001) / chordSeconds));
            // A piano root event may also supply the written slash bass.
            const symbol = chords[chordIndex];
            expect(chordPitchClasses(symbol), `${preset.id}/${instrumentId}/${symbol}`).toContain(pc(item.pitch));
            expect(item.pitch).toBeGreaterThanOrEqual(min);
            expect(item.pitch).toBeLessThanOrEqual(max);
            expect(item.offsetSeconds).toBeGreaterThanOrEqual(0);
            expect(item.durationSeconds).toBeGreaterThan(0);
            expect(item.offsetSeconds + item.durationSeconds).toBeLessThanOrEqual((chordIndex + 1) * chordSeconds + .00001);
            expect(Number.isFinite(item.velocity)).toBe(true);
          }
        }
      }
    });
  }
});
