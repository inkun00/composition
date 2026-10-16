import type { AccompanimentEvent, AccompanimentInstrumentProfile } from "./accompaniment";
import { ensembleRoleForInstrument, type AccompanimentEnsembleContext } from "./accompanimentEnsemble";
import type { InstrumentId } from "./instruments";
import type { Meter } from "./meter";

/** Complement the main chord player instead of stacking an identical second part. */
export function coordinateAccompanimentTexture(
  pattern: readonly AccompanimentEvent[],
  context: AccompanimentEnsembleContext | undefined,
  instrumentId: InstrumentId,
  profile: AccompanimentInstrumentProfile,
  beats: number,
  meter?: Meter,
  ending = false
): readonly AccompanimentEvent[] {
  const assignment = ensembleRoleForInstrument(context, instrumentId);
  if (!assignment || ending || assignment.role !== "pulse" ||
    !["keys", "guitar"].includes(profile.part.id)) return pattern;
  const pulse = meter?.beats === 6 && meter.beatUnit === 8 ? 1.5 : 1;
  const upper = pattern.filter((note) => note.voice !== "root");
  const source = upper.length ? upper : pattern;
  const syncopated = source.filter((note) => Math.abs(note.offsetBeats / pulse -
    Math.round(note.offsetBeats / pulse)) > .1);
  const chosen = syncopated.length >= 4 && syncopated.length === source.length
    ? syncopated.filter((_, index) => index % 2 === 1)
    : syncopated.length > 1 ? syncopated
    : source.length > 2 ? source.filter((_, index) => index % 2 === 0) : source;
  return chosen.map((note) => {
    const onset = syncopated.length > 1 ? note.offsetBeats
      : Math.min(beats - pulse * .25, note.offsetBeats + pulse * .5);
    return { ...note, offsetBeats: onset,
      durationBeats: Math.min(note.durationBeats, pulse * .65, beats - onset),
      velocity: (note.velocity ?? 1) * .94 };
  });
}
