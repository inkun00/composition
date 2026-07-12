import { compare, rational, subtract, sum, toNumber, type Rational } from "./rational";
import type { MeasureValidation, NoteEvent } from "./types";

export type Meter = Readonly<{ beats: number; beatUnit: 2 | 4 | 8 }>;

export const SUPPORTED_METERS: readonly Meter[] = [
  { beats: 2, beatUnit: 4 },
  { beats: 3, beatUnit: 4 },
  { beats: 4, beatUnit: 4 },
  { beats: 6, beatUnit: 8 }
];

export function meterKey(meter: Meter): string {
  return `${meter.beats}/${meter.beatUnit}`;
}

export function measureCapacity(meter: Meter): Rational {
  return rational(meter.beats * 4, meter.beatUnit);
}

function beatText(value: Rational, meter: Meter): string {
  if (meter.beatUnit === 8) {
    const eighthNotes = toNumber(value) * 2;
    return `8분음표 ${eighthNotes}개`;
  }
  if (value.denominator === 1) {
    return `${Math.abs(value.numerator)}박`;
  }
  return `${Math.abs(value.numerator)}/${value.denominator}박`;
}

export function validateMeasure(
  notes: readonly Pick<NoteEvent, "duration">[],
  meter: Meter
): MeasureValidation {
  const used = sum(notes.map((note) => note.duration));
  const capacity = measureCapacity(meter);
  const ordering = compare(used, capacity);

  if (ordering === 0) {
    return { state: "exact", difference: rational(0), message: "딱 맞아요! 한 마디를 모두 채웠어요." };
  }

  if (ordering < 0) {
    const difference = subtract(capacity, used);
    return {
      state: "short",
      difference,
      message: `${beatText(difference, meter)}이 비었어요. 음표나 쉼표를 더해 주세요.`
    };
  }

  const difference = subtract(used, capacity);
  return {
    state: "over",
    difference,
    message: `${beatText(difference, meter)}이 넘쳤어요. 음표를 줄여 주세요.`
  };
}
