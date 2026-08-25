import type { AccompanimentStyleId } from "../music/accompaniment";
import {
  BEAT_PATTERN_MEASURES,
  beatPatternMeasureBeats,
  beatPatternStep,
  type BeatPatternEvent
} from "../music/beatPattern";
import type { BeatInstrumentId } from "../music/beatInstruments";
import type { Meter } from "../music/meter";

const DEFAULT_METER: Meter = { beats: 4, beatUnit: 4 };

function hit(
  instrumentId: BeatInstrumentId,
  measureIndex: number,
  offsetBeats: number
): BeatPatternEvent {
  return {
    id: `anime-rock-${instrumentId}-${measureIndex}-${offsetBeats}`,
    instrumentId,
    measureIndex,
    offsetBeats
  };
}

function fourFourPattern(): BeatPatternEvent[] {
  const events: BeatPatternEvent[] = [];
  const kicks = [
    [0, 1.5, 2, 3.5],
    [0, 1, 2.5, 3.5],
    [0, .5, 2, 3],
    [0, 1.5, 2.5]
  ];

  for (let measureIndex = 0; measureIndex < BEAT_PATTERN_MEASURES; measureIndex += 1) {
    for (let offset = 0; offset < 4; offset += .5) {
      if (measureIndex !== 3 || offset < 2.5) events.push(hit("hihat", measureIndex, offset));
    }
    kicks[measureIndex].forEach((offset) => events.push(hit("kick", measureIndex, offset)));
    [1, 3].forEach((offset) => events.push(hit("snare", measureIndex, offset)));
  }

  events.push(
    hit("crash", 0, 0),
    hit("crash", 2, 0),
    hit("open-hihat", 1, 3.5),
    hit("rack-tom", 3, 2.5),
    hit("rack-tom", 3, 3),
    hit("floor-tom", 3, 3.5)
  );
  return events;
}

function adaptablePattern(meter: Meter): BeatPatternEvent[] {
  const events: BeatPatternEvent[] = [];
  const measureBeats = beatPatternMeasureBeats(meter);
  const step = beatPatternStep(meter);
  const halfMeasure = Math.max(step, Math.round(measureBeats / 2 / step) * step);

  for (let measureIndex = 0; measureIndex < BEAT_PATTERN_MEASURES; measureIndex += 1) {
    for (let offset = 0; offset < measureBeats; offset += step) {
      const fillStarts = measureIndex === 3 && offset >= measureBeats - step * 3;
      if (!fillStarts) events.push(hit("hihat", measureIndex, offset));
    }
    events.push(hit("kick", measureIndex, 0));
    if (halfMeasure < measureBeats) events.push(hit("kick", measureIndex, halfMeasure));
    if (halfMeasure < measureBeats) events.push(hit("snare", measureIndex, halfMeasure));
  }

  events.push(hit("crash", 0, 0));
  [3, 2, 1].forEach((stepsFromEnd, index) => {
    const offset = measureBeats - step * stepsFromEnd;
    if (offset >= 0) events.push(hit(index < 2 ? "rack-tom" : "floor-tom", 3, offset));
  });
  return events;
}

export function createAnimeRockBeatPattern(meter: Meter = DEFAULT_METER): readonly BeatPatternEvent[] {
  if (meter.beats === 4 && meter.beatUnit === 4) return fourFourPattern();
  return adaptablePattern(meter);
}

export function effectiveBeatPattern(
  styleId: AccompanimentStyleId | undefined,
  customEvents: readonly BeatPatternEvent[],
  meter: Meter = DEFAULT_METER
): readonly BeatPatternEvent[] {
  if (styleId !== "anime_rock") return customEvents;
  const customizedInstruments = new Set(customEvents.map((event) => event.instrumentId));
  const automaticEvents = createAnimeRockBeatPattern(meter)
    .filter((event) => !customizedInstruments.has(event.instrumentId));
  return [...customEvents, ...automaticEvents].sort((a, b) =>
    a.measureIndex - b.measureIndex ||
    a.offsetBeats - b.offsetBeats ||
    a.instrumentId.localeCompare(b.instrumentId));
}
