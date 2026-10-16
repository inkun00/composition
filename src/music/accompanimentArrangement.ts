import {
  accompanimentInstrumentPart,
  createInstrumentAccompanimentPattern,
  createInstrumentTransitionFill,
  type AccompanimentEvent,
  type AccompanimentStyleId
} from "./accompaniment";
import type { InstrumentId } from "./instruments";
import type { Meter } from "./meter";

type PhraseContext = Readonly<{
  measureIndex?: number;
  transitionFill?: boolean;
  ending?: boolean;
}>;

function accentAt(offset: number, meter?: Meter): number {
  if (offset === 0) return 1;
  const pulse = meter?.beats === 6 && meter.beatUnit === 8 ? 1.5 : 1;
  return Math.abs(offset / pulse - Math.round(offset / pulse)) < .001 ? .88 : .72;
}

// Work in full measures so a chord change never restarts the groove or moves
// the two dotted-quarter pulses of 6/8. Harmony is assigned by the audio planner.
export function createArrangedAccompanimentPattern(
  styleId: AccompanimentStyleId,
  measureBeats: number,
  instrumentId: InstrumentId,
  layerIndex: number,
  meter?: Meter,
  context: PhraseContext = {}
): readonly AccompanimentEvent[] {
  if (!Number.isFinite(measureBeats) || measureBeats <= 0) return [];
  const part = accompanimentInstrumentPart(instrumentId, layerIndex);
  let pattern = createInstrumentAccompanimentPattern(styleId, measureBeats, instrumentId, layerIndex, meter);
  if (context.ending) {
    // Resolve together; do not play a transition roll over the final chord.
    pattern = [{
      offsetBeats: 0,
      durationBeats: part.id === "percussion" ? Math.min(.6, measureBeats) : measureBeats,
      voice: part.id === "bass" ? "root" : part.id === "winds" || part.id === "percussion" ? "step" : "chord",
      step: 0,
      sustain: part.id !== "percussion",
      strum: part.id === "guitar" ? "down" : undefined,
      velocity: .9
    }];
  } else if (context.transitionFill && styleId !== "opera" && styleId !== "comping") {
    const fill = createInstrumentTransitionFill(measureBeats, instrumentId, layerIndex, meter);
    if (fill.length > 0) {
      const fillStart = fill[0].offsetBeats;
      pattern = [...pattern.filter((item) => item.offsetBeats < fillStart).map((item) => ({
        ...item,
        durationBeats: Math.min(item.durationBeats, fillStart - item.offsetBeats)
      })), ...fill.map((item) => ({ ...item, velocity: .66 }))];
    }
  } else if (styleId === "kpop" && part.id === "bass" && (context.measureIndex ?? 0) % 2 === 1) {
    const pickup = measureBeats - .5;
    if (pickup > 0 && !pattern.some((item) => Math.abs(item.offsetBeats - pickup) < .001)) {
      pattern = [...pattern.map((item) => ({
        ...item,
        durationBeats: item.offsetBeats < pickup
          ? Math.min(item.durationBeats, pickup - item.offsetBeats) : item.durationBeats
      })), { offsetBeats: pickup, durationBeats: .32, voice: "step", step: 2, velocity: .7 }];
    }
  }

  return pattern.filter((item) => item.offsetBeats >= 0 && item.offsetBeats < measureBeats && item.durationBeats > 0)
    .map((item) => ({
      ...item,
      durationBeats: Math.min(item.durationBeats, measureBeats - item.offsetBeats),
      velocity: item.velocity ?? (part.id === "strings" ? .78 : accentAt(item.offsetBeats, meter))
    })).sort((left, right) => left.offsetBeats - right.offsetBeats);
}
