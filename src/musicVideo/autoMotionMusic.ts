import type { PlaybackMeasure } from "../audio/accompanimentScore";
import type { Meter } from "../music/meter";
import { toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { normalizeSceneBpm, positiveModulo } from "../video/sceneMotionClock";

export type AutoMotionMusic = Readonly<{
  durationBeats: number;
  voicedBeats: number;
  restRatio: number;
  attacks: number;
  attackDensity: number;
  attacksPerSecond: number;
  alignedAttackRatio: number;
  meanHeldBeats: number;
  longestHeldSeconds: number;
  pitchChange: number;
  pitchTravel: number;
  pitchIntervals: number;
  leapRatio: number;
  stepRatio: number;
}>;

/** Durations and playback BPM use quarter notes, including scores written in eighth-note meters. */
function pulseQuarterBeats(meter?: Meter): number {
  if (!meter || !Number.isFinite(meter.beats) || meter.beats <= 0 ||
    !Number.isFinite(meter.beatUnit) || meter.beatUnit <= 0) return 1;
  const unit = 4 / meter.beatUnit;
  return meter.beats >= 6 && meter.beats % 3 === 0 && meter.beatUnit === 8 ? unit * 3 : unit;
}

/** A linked equal-pitch note sustains the prior attack, even across authored measure/scene boundaries. */
export function analyzeAutoMotionMusic(measures: readonly PlaybackMeasure[], first: number, last: number,
  bpm: number, meter?: Meter): AutoMotionMusic {
  const pulse = pulseQuarterBeats(meter);
  const pitches: number[] = [];
  let previous: NoteEvent | undefined;
  let durationBeats = 0;
  let voicedBeats = 0;
  let attacks = 0;
  let alignedAttacks = 0;
  let heldBeats = 0;
  let longestHeldBeats = 0;
  let heldSegments = 0;

  for (let measureIndex = 0; measureIndex <= last; measureIndex++) {
    let offset = 0;
    for (const note of measures[measureIndex].notes) {
      const duration = toNumber(note.duration);
      const continuation = note.pitch !== null && previous?.linkToNext === true && previous.pitch === note.pitch;
      if (measureIndex >= first) {
        durationBeats += duration;
        if (note.pitch === null) {
          heldBeats = 0;
        } else {
          voicedBeats += duration;
          if (!continuation || heldSegments === 0 || heldBeats === 0) {
            heldSegments++;
            heldBeats = 0;
          }
          heldBeats += duration;
          longestHeldBeats = Math.max(longestHeldBeats, heldBeats);
          if (!continuation) {
            attacks++;
            const phase = positiveModulo(offset, pulse);
            if (Math.min(phase, pulse - phase) < 1e-7) alignedAttacks++;
          }
          if (!continuation || !pitches.length) pitches.push(note.pitch);
        }
      }
      previous = note;
      offset += duration;
    }
  }

  const intervals = pitches.slice(1).map((pitch, index) => pitch - pitches[index]).filter((interval) => interval !== 0);
  const pitchTravel = intervals.reduce((sum, interval) => sum + Math.abs(interval), 0);
  const secondsPerBeat = 60 / normalizeSceneBpm(bpm);
  return {
    durationBeats,
    voicedBeats,
    restRatio: durationBeats ? 1 - voicedBeats / durationBeats : 0,
    attacks,
    attackDensity: durationBeats ? attacks / durationBeats : 0,
    attacksPerSecond: durationBeats ? attacks / (durationBeats * secondsPerBeat) : 0,
    alignedAttackRatio: attacks ? alignedAttacks / attacks : 1,
    meanHeldBeats: heldSegments ? voicedBeats / heldSegments : 0,
    longestHeldSeconds: longestHeldBeats * secondsPerBeat,
    pitchChange: pitches.length > 1 ? pitches.at(-1)! - pitches[0] : 0,
    pitchTravel,
    pitchIntervals: intervals.length,
    leapRatio: intervals.length ? intervals.filter((interval) => Math.abs(interval) >= 5).length / intervals.length : 0,
    stepRatio: intervals.length ? intervals.filter((interval) => Math.abs(interval) <= 2).length / intervals.length : 0
  };
}
