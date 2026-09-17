import { useState } from "react";
import type { Meter } from "../music/meter";
import { normalizeBeatVolume } from "../music/beatInstruments";
import { normalizeBeatPattern, type BeatPatternEvent } from "../music/beatPattern";

export type UseBeatPatternStateOptions = Readonly<{
  initialPattern?: readonly BeatPatternEvent[];
  initialVolume?: number;
  meter: Meter;
}>;

export function useBeatPatternState(options: UseBeatPatternStateOptions) {
  const [beatPattern, setBeatPattern] = useState<BeatPatternEvent[]>(() =>
    normalizeBeatPattern(options.initialPattern ?? [], options.meter)
  );
  const [beatVolume, setBeatVolume] = useState<number>(() =>
    normalizeBeatVolume(options.initialVolume)
  );
  const [beatPreviewing, setBeatPreviewing] = useState<boolean>(false);

  const resetBeatPattern = () => {
    setBeatPattern([]);
    setBeatPreviewing(false);
  };

  const loadBeatPattern = (
    pattern?: readonly BeatPatternEvent[],
    volume?: number,
    meter: Meter = options.meter
  ) => {
    setBeatPattern(normalizeBeatPattern(pattern ?? [], meter));
    setBeatVolume(normalizeBeatVolume(volume));
    setBeatPreviewing(false);
  };

  return {
    beatPattern,
    setBeatPattern,
    beatVolume,
    setBeatVolume,
    beatPreviewing,
    setBeatPreviewing,
    resetBeatPattern,
    loadBeatPattern
  };
}
