import { describe, expect, it } from "vitest";
import { ACCOMPANIMENT_MODES, accompanimentInstrumentProfile } from "../music/accompaniment";
import { chordPitchClasses } from "../music/chord";
import type { InstrumentId } from "../music/instruments";
import { SUPPORTED_METERS } from "../music/meter";
import type { NoteEvent } from "../music/types";
import { createArrangementVoiceState, planAccompanimentLayer } from "./accompanimentPerformance";

function note(pitch: number | null, duration: number, id = "n"): NoteEvent {
  return { id, pitch, duration: { numerator: duration, denominator: 1 } };
}

const quietMeasure = [note(null, 4)];
const base = {
  notes: quietMeasure,
  chords: ["C"],
  fallbackPitches: [48, 52, 55],
  styleId: "arpeggio" as const,
  instrumentId: "acoustic_grand_piano" as InstrumentId,
  layerIndex: 0,
  layerCount: 1,
  secondsPerBeat: .5,
  meter: { beats: 4, beatUnit: 4 } as const
};

const pc = (pitch: number) => ((pitch % 12) + 12) % 12;

describe("반주 연주 설계", () => {
  it("피아노 아르페지오는 화음을 쌓지 않고 한 음씩 화음의 순서를 연주한다", () => {
    const score = planAccompanimentLayer(base);
    expect(score.length).toBeGreaterThanOrEqual(6);
    expect(new Set(score.map((item) => item.offsetSeconds)).size).toBe(score.length);
    expect(new Set(score.map((item) => pc(item.pitch))).size).toBe(3);
    expect(score.every((item) => [0, 4, 7].includes(pc(item.pitch)))).toBe(true);
    expect(score[1].pitch).toBeGreaterThan(score[0].pitch);
    expect(score[2].pitch).toBeGreaterThan(score[1].pitch);
  });

  it("기타 스트럼은 여러 현을 짧은 시차로 쓸고 약박에서 방향을 바꾼다", () => {
    const score = planAccompanimentLayer({ ...base, styleId: "strum", instrumentId: "acoustic_guitar_steel" });
    const opening = score.filter((item) => item.offsetSeconds < .09);
    expect(opening.length).toBeGreaterThanOrEqual(3);
    expect(opening[0].pitch).toBeLessThan(opening[opening.length - 1].pitch);
    expect(opening[opening.length - 1].offsetSeconds - opening[0].offsetSeconds).toBeGreaterThan(.01);
    expect(opening[opening.length - 1].offsetSeconds - opening[0].offsetSeconds).toBeLessThan(.07);
    expect(opening.every((item) => [0, 4, 7].includes(pc(item.pitch)))).toBe(true);
    const clusters: typeof score[] = [];
    score.forEach((item) => {
      const last = clusters[clusters.length - 1];
      if (last && item.offsetSeconds - last[0].offsetSeconds < .09) clusters[clusters.length - 1] = [...last, item];
      else clusters.push([item]);
    });
    expect(clusters.some((cluster) => cluster.length >= 3 && cluster[0].pitch > cluster[cluster.length - 1].pitch)).toBe(true);
  });

  it("보사노바의 베이스는 슬래시 베이스와 화음의 5도를 번갈아 연주한다", () => {
    const score = planAccompanimentLayer({ ...base, chords: ["C/E"], styleId: "bossa", instrumentId: "acoustic_bass" });
    expect(score.map((item) => pc(item.pitch))).toEqual([4, 7, 4, 7]);
  });

  it("확장 화음은 3도·7도·9도 색채를 보존하고 슬래시음은 별도 베이스에 맡긴다", () => {
    const upper = planAccompanimentLayer({ ...base, chords: ["Cmaj9/E"], ending: true });
    expect(new Set(upper.map((item) => pc(item.pitch)))).toEqual(new Set([0, 4, 11, 2]));
    const bass = planAccompanimentLayer({ ...base, chords: ["Cmaj9/E"], instrumentId: "acoustic_bass", ending: true });
    expect(bass.map((item) => pc(item.pitch))).toEqual([4]);
  });

  it("보이싱은 앞 화음에서 가까운 자리로 이어지며 음역 보정으로 화음을 바꾸지 않는다", () => {
    const state = createArrangementVoiceState();
    const first = planAccompanimentLayer({ ...base, chords: ["Cmaj7"], ending: true, state });
    const second = planAccompanimentLayer({ ...base, chords: ["Fmaj7"], ending: true, state });
    expect(first.length).toBe(4);
    expect(second.length).toBe(4);
    const firstPitches = first.map((item) => item.pitch).sort((left, right) => left - right);
    const secondPitches = second.map((item) => item.pitch).sort((left, right) => left - right);
    const travel = secondPitches.reduce((sum, pitch, index) => sum + Math.abs(pitch - firstPitches[index]), 0) / 4;
    expect(travel).toBeLessThanOrEqual(5);
    expect(second.every((item) => chordPitchClasses("Fmaj7").includes(pc(item.pitch)))).toBe(true);
    const lowBass = planAccompanimentLayer({ ...base, chords: ["B"], instrumentId: "acoustic_bass", ending: true });
    expect(lowBass[0].pitch).toBe(35);
    expect(pc(lowBass[0].pitch)).toBe(11);
  });

  it("긴 현악 화음은 시작 뒤에 들어오는 가락과의 반음 충돌까지 피한다", () => {
    const options = { ...base, instrumentId: "string_ensemble_1" as InstrumentId, ending: true };
    const withoutMelody = planAccompanimentLayer(options);
    const withLaterMelody = planAccompanimentLayer({ ...options, notes: [note(null, 1), note(65, 3, "later")] });
    expect(withLaterMelody.length).toBeGreaterThan(0);
    expect(withLaterMelody.every((item) => ![1, 11, 13].includes(Math.abs(item.pitch - 65)))).toBe(true);
    expect(withLaterMelody.map((item) => item.pitch)).not.toEqual(withoutMelody.map((item) => item.pitch));
  });

  it("컴핑은 촘촘한 가락에서도 조용한 화음을 성기게 넣고 베이스의 박자를 유지한다", () => {
    const busy = Array.from({ length: 8 }, (_, index) => ({
      id: `busy-${index}`, pitch: 72 + index % 3, duration: { numerator: 1, denominator: 2 }
    }));
    const options = { ...base, styleId: "comping" as const, notes: busy, layerCount: 2 };
    const score = planAccompanimentLayer(options);
    const quiet = planAccompanimentLayer({ ...options, notes: quietMeasure });
    expect(score.length).toBeGreaterThan(0);
    expect(score.length).toBeLessThan(quiet.length);
    expect(new Set(score.map((item) => item.offsetSeconds)).size).toBe(1);
    expect(score.every((item) => [0, 4, 7].includes(pc(item.pitch)))).toBe(true);
    const bass = planAccompanimentLayer({ ...options, instrumentId: "acoustic_bass" });
    expect(bass.map((item) => item.offsetSeconds)).toEqual(
      planAccompanimentLayer({ ...options, notes: quietMeasure, instrumentId: "acoustic_bass" })
        .map((item) => item.offsetSeconds));
  });

  it("가락이 음역을 오가도 아르페지오 전체의 윤곽을 보존한다", () => {
    const quiet = planAccompanimentLayer(base);
    for (const pitches of [[67, 64, 60, 64], [55, 72, 55, 72]]) {
      const melody = pitches.map((pitch, index) => note(pitch, 1, `contour-${index}`));
      const score = planAccompanimentLayer({ ...base, notes: melody });
      const shifts = score.map((item, index) => item.pitch - quiet[index].pitch);
      expect(new Set(shifts).size).toBe(1);
      const intervals = score.slice(1).map((item, index) => item.pitch - score[index].pitch);
      expect(intervals).toEqual(quiet.slice(1).map((item, index) => item.pitch - quiet[index].pitch));
      expect(Math.max(...intervals.map(Math.abs))).toBeLessThanOrEqual(12);
    }
  });

  it("마디 중간 화음 전환은 아르페지오의 박자를 재시작하지 않고 앞 화음을 경계에서 끊는다", () => {
    const score = planAccompanimentLayer({ ...base, chords: ["C", "F", "G"] });
    expect(score.length).toBe(8);
    score.forEach((item, index) => {
      expect(item.offsetSeconds).toBeCloseTo(index * .25, 1);
      const chordIndex = Math.min(2, Math.floor((item.offsetSeconds + .0001) / (2 / 3)));
      expect(chordPitchClasses(["C", "F", "G"][chordIndex]).includes(pc(item.pitch))).toBe(true);
      expect(item.offsetSeconds + item.durationSeconds).toBeLessThanOrEqual((chordIndex + 1) * 2 / 3 + .001);
    });
  });

  it("종지의 긴 화음도 마디 안의 새 화음마다 보이싱을 갱신한다", () => {
    const score = planAccompanimentLayer({ ...base, chords: ["C", "F"], ending: true });
    const secondChord = score.filter((item) => item.offsetSeconds >= 1);
    expect(secondChord.length).toBeGreaterThanOrEqual(3);
    expect(secondChord.every((item) => chordPitchClasses("F").includes(pc(item.pitch)))).toBe(true);
    expect(score.filter((item) => item.offsetSeconds < 1).every((item) =>
      item.offsetSeconds + item.durationSeconds <= 1)).toBe(true);
  });

  it("오페라의 오르간·베이스·현악은 두 번째 화음까지 긴 반주를 이어 간다", () => {
    const instruments: readonly InstrumentId[] = ["church_organ", "contrabass", "string_ensemble_1"];
    instruments.forEach((instrumentId, layerIndex) => {
      const score = planAccompanimentLayer({ ...base, styleId: "opera", instrumentId, layerIndex,
        chords: ["C", "F"], layerCount: 3 });
      const second = score.filter((item) => item.offsetSeconds >= 1);
      expect(second.length, instrumentId).toBeGreaterThan(0);
      expect(second.every((item) => chordPitchClasses("F").includes(pc(item.pitch)))).toBe(true);
      expect(second.some((item) => item.durationSeconds > .8)).toBe(true);
    });
  });

  it("6/8의 두 큰 박은 화음이 바뀌어도 유지한다", () => {
    const score = planAccompanimentLayer({ ...base, notes: [note(null, 3)], chords: ["C", "G"],
      instrumentId: "acoustic_bass", styleId: "folk", meter: { beats: 6, beatUnit: 8 } });
    expect(score.map((item) => item.offsetSeconds)).toEqual([0, .75]);
    expect(pc(score[0].pitch)).toBe(0);
    expect(chordPitchClasses("G").includes(pc(score[1].pitch))).toBe(true);
  });

  it("모든 모드의 연주는 악기 음역·화음·마디 길이 안에 있고 결과가 결정적이다", () => {
    for (const mode of ACCOMPANIMENT_MODES) {
      mode.instrumentIds.forEach((instrumentId, layerIndex) => {
        const options = { ...base, instrumentId, layerIndex, layerCount: mode.instrumentIds.length,
          styleId: mode.styleId, chords: ["Bm7b5", "F#7"], transitionFill: true, measureIndex: 3 };
        const score = planAccompanimentLayer(options);
        expect(score.length, `${mode.name}/${instrumentId}: 반주가 비어 있지 않아야 한다`).toBeGreaterThan(0);
        expect(score, `${mode.name}/${instrumentId}`).toEqual(planAccompanimentLayer(options));
        const [min, max] = accompanimentInstrumentProfile(instrumentId, layerIndex).range;
        score.forEach((item) => {
          const chord = item.offsetSeconds < 1 ? "Bm7b5" : "F#7";
          expect(item.pitch).toBeGreaterThanOrEqual(min);
          expect(item.pitch).toBeLessThanOrEqual(max);
          expect(chordPitchClasses(chord).includes(pc(item.pitch))).toBe(true);
          expect(item.offsetSeconds).toBeGreaterThanOrEqual(0);
          expect(item.durationSeconds).toBeGreaterThan(0);
          expect(item.offsetSeconds + item.durationSeconds).toBeLessThanOrEqual(2.001);
          expect(Number.isFinite(item.velocity) && item.velocity > 0 && item.velocity < 2).toBe(true);
        });
      });
    }
  });

  it("4개 악기의 모든 모드는 네 박자표와 실제 4분·8분 가락 아래에서도 각 파트를 연주한다", () => {
    const progression = ["Cmaj9/E", "Fmaj7", "Dm9/F", "G13/B", "Am9/C", "D7/F#", "Bm7b5/D", "E7/G#"];
    for (const mode of ACCOMPANIMENT_MODES) {
      const instruments: readonly InstrumentId[] = mode.instrumentIds.length === 4 ? mode.instrumentIds
        : [...mode.instrumentIds, "string_ensemble_2", "recorder"];
      for (const meter of SUPPORTED_METERS) {
        const beats = meter.beats * 4 / meter.beatUnit;
        for (const duration of [.5, 1]) {
          const melody = Array.from({ length: beats / duration }, (_, index) =>
            note([60, 62, 64, 65, 67, 69, 71, 72][index % 8], duration, `real-${index}`));
          const states = instruments.map(() => createArrangementVoiceState());
          for (let measureIndex = 0; measureIndex < 8; measureIndex += 1) {
            const chords = [progression[measureIndex], progression[(measureIndex + 1) % progression.length]];
            instruments.forEach((instrumentId, layerIndex) => {
              const score = planAccompanimentLayer({ ...base, instrumentId, layerIndex,
                layerCount: instruments.length, styleId: mode.styleId, notes: melody, chords, meter,
                measureIndex, state: states[layerIndex], transitionFill: measureIndex === 3,
                ending: measureIndex === 7 });
              const context = `${mode.id}/${meter.beats}/${meter.beatUnit}/${duration}/${measureIndex}/${instrumentId}`;
              expect(score.length, context).toBeGreaterThan(0);
              const [min, max] = accompanimentInstrumentProfile(instrumentId, layerIndex).range;
              score.forEach((item) => {
                const chord = chords[Math.min(1, Math.floor((item.offsetSeconds + .0001) / (beats * .25)))];
                expect(chordPitchClasses(chord).includes(pc(item.pitch)), context).toBe(true);
                expect(item.pitch, context).toBeGreaterThanOrEqual(min);
                expect(item.pitch, context).toBeLessThanOrEqual(max);
                expect(item.offsetSeconds + item.durationSeconds, context).toBeLessThanOrEqual(beats * .5 + .001);
                expect(item.durationSeconds, context).toBeGreaterThan(.015);
                expect(item.velocity, context).toBeGreaterThan(.25);
                expect(item.velocity, context).toBeLessThan(1);
              });
            });
          }
        }
      }
    }
  });

  it("관악기는 빈틈없는 가락 아래에서도 앞뒤 화음을 연결하는 선율과 호흡을 유지한다", () => {
    for (const id of ["acoustic", "animation_cinema", "musical_stage", "opera_hall"]) {
      const mode = ACCOMPANIMENT_MODES.find((item) => item.id === id)!;
      const instrumentId = mode.instrumentIds[3];
      const melody = Array.from({ length: 8 }, (_, index) =>
        note([60, 62, 64, 65, 67, 69, 71, 72][index], .5, `eighth-${index}`));
      for (let measureIndex = 0; measureIndex < 16; measureIndex += 1) {
        const chords = measureIndex % 2 === 0 ? ["Cmaj9/E", "G13/B"] : ["Am9/C", "Fmaj7"];
        const score = planAccompanimentLayer({ ...base, instrumentId, layerIndex: 3, layerCount: 4,
          styleId: mode.styleId, notes: melody, chords, measureIndex });
        const label = `${id}/${measureIndex}`;
        expect(score.length, label).toBeGreaterThanOrEqual(2);
        expect(score.some((item) => item.offsetSeconds < 1), label).toBe(true);
        expect(score.some((item) => item.offsetSeconds >= 1), label).toBe(true);
        const sounding = score.reduce((sum, item) => sum + item.durationSeconds, 0);
        expect(sounding, label).toBeGreaterThan(.85);
        expect(Math.max(...score.map((item) => item.offsetSeconds + item.durationSeconds)), label).toBeLessThan(1.98);
        score.forEach((item) => expect(chordPitchClasses(chords[item.offsetSeconds < 1 ? 0 : 1])
          .includes(pc(item.pitch)), label).toBe(true));
      }
    }
  });

  it("응답 악기는 실제 쉼표와 긴 음의 뒷부분을 먼저 사용한다", () => {
    const melody = [note(72, 1, "lead"), note(null, 1, "gap"), note(74, 2, "held")];
    const options = { ...base, instrumentId: "flute" as InstrumentId, layerIndex: 3, layerCount: 4,
      styleId: "animation_ost" as const, notes: melody };
    const score = planAccompanimentLayer(options);
    expect(score.length).toBeGreaterThan(0);
    score.forEach((item) => {
      const onset = item.offsetSeconds / options.secondsPerBeat;
      expect(onset >= .5 && onset < 2 || onset >= 2.5).toBe(true);
    });
  });

  it("선율 충돌은 현악 성부를 재배치하고 MIDI 터치를 여러 음량 계수로 지우지 않는다", () => {
    const melody = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, index) => note(pitch, .5, `scale-${index}`));
    for (const instrumentId of ["cello", "violin", "string_ensemble_1", "string_ensemble_2"] as const) {
      const score = planAccompanimentLayer({ ...base, instrumentId, notes: melody,
        chords: ["Cmaj9/E"], styleId: "opera", layerCount: 4 });
      expect(score.length, instrumentId).toBeGreaterThan(0);
      expect(score.every((item) => chordPitchClasses("Cmaj9").includes(pc(item.pitch)))).toBe(true);
      expect(score.every((item) => item.velocity > .35)).toBe(true);
      if (instrumentId.includes("ensemble")) expect(new Set(score.map((item) => pc(item.pitch))).size).toBeGreaterThan(1);
    }
  });
});
