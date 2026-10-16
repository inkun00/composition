import { analyzeAccompanimentEnsemble, ensembleRoleForInstrument } from "../music/accompanimentEnsemble";
import type { InstrumentId } from "../music/instruments";
import {
  planAccompanimentLayer,
  type AccompanimentPerformanceNote,
  type PerformanceOptions
} from "./accompanimentPerformance";

type EnsemblePerformanceOptions = Omit<PerformanceOptions,
  "instrumentId" | "layerIndex" | "layerCount" | "peerNotes">;

/** Plan stable musical roles together; solo and selection order cannot rewrite the arrangement. */
export function planAccompanimentEnsemble(
  options: EnsemblePerformanceOptions,
  instrumentIds: readonly InstrumentId[]
): ReadonlyMap<InstrumentId, readonly AccompanimentPerformanceNote[]> {
  const context = options.ensemble ?? analyzeAccompanimentEnsemble([{
    notes: options.notes, chords: options.chords, measureIndex: options.measureIndex
  }], instrumentIds, options.section).measures[0];
  const priority = { bass: 0, harmony: 1, pad: 2, counterline: 3, answer: 4, pulse: 5, ornament: 6 };
  const ids = [...new Set(instrumentIds)].sort((left, right) => {
    const leftRole = ensembleRoleForInstrument(context, left);
    const rightRole = ensembleRoleForInstrument(context, right);
    return priority[leftRole?.role ?? "pad"] - priority[rightRole?.role ?? "pad"] || left.localeCompare(right);
  });
  const result = new Map<InstrumentId, readonly AccompanimentPerformanceNote[]>();
  const peers: AccompanimentPerformanceNote[] = [];
  ids.forEach((instrumentId, layerIndex) => {
    const notes = planAccompanimentLayer({ ...options, ensemble: context,
      instrumentId, layerIndex, layerCount: ids.length, peerNotes: peers });
    result.set(instrumentId, notes);
    peers.push(...notes);
  });
  return result;
}
