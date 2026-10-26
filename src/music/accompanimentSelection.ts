import { MAX_ACCOMPANIMENT_INSTRUMENTS, isAccompanimentInstrument } from "./accompaniment";
import { findInstrument, type InstrumentId } from "./instruments";

/** Normalize saved aliases with the same supported ensemble limits as the composer. */
export function uniqueAccompanimentInstrumentIds(ids: readonly InstrumentId[]): InstrumentId[] {
  const unique: InstrumentId[] = [];
  for (const id of ids) {
    const canonicalId = findInstrument(id).id;
    if (isAccompanimentInstrument(canonicalId) && !unique.includes(canonicalId) &&
      unique.length < MAX_ACCOMPANIMENT_INSTRUMENTS) unique.push(canonicalId);
  }
  return unique.length > 0 ? unique : [findInstrument("piano").id];
}
