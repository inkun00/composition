import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  setAccompanimentTrackMix,
  type AccompanimentTrackState
} from "../audio/accompanimentRuntime";
import {
  accompanimentTrackSettings,
  normalizeAccompanimentTrackMix,
  type AccompanimentTrackMixMap
} from "../music/accompanimentMix";
import { findInstrument, type InstrumentId } from "../music/instruments";

export function useAccompanimentMixer(
  instrumentIds: readonly InstrumentId[],
  initialMix?: AccompanimentTrackMixMap
) {
  const [storedMix, setStoredMix] = useState(() => normalizeAccompanimentTrackMix(initialMix, instrumentIds));
  const [trackStates, setTrackStates] = useState<Readonly<Record<string, AccompanimentTrackState>>>({});
  const [soloInstrumentId, setSoloInstrumentId] = useState<InstrumentId | null>(null);
  const selectedIds = useRef(instrumentIds);
  selectedIds.current = instrumentIds;
  const trackMix = useMemo(() => normalizeAccompanimentTrackMix(storedMix, instrumentIds), [storedMix, instrumentIds]);

  const updateTrack = useCallback((instrumentId: InstrumentId, update: { volume?: number; muted?: boolean }) => {
    const id = findInstrument(instrumentId).id;
    setStoredMix((current) => {
      const next = {
        ...normalizeAccompanimentTrackMix(current, selectedIds.current),
        [id]: { ...accompanimentTrackSettings(current, id), ...update }
      };
      return next;
    });
  }, []);

  const setTrackVolume = useCallback((id: InstrumentId, volume: number) => {
    if (Number.isFinite(volume)) updateTrack(id, { volume: Math.max(0, Math.min(150, Math.round(volume))) });
  }, [updateTrack]);

  const toggleTrackMute = useCallback((id: InstrumentId) => {
    updateTrack(id, { muted: !accompanimentTrackSettings(trackMix, id).muted });
  }, [trackMix, updateTrack]);

  const onTrackState = useCallback((state: AccompanimentTrackState) => {
    const id = findInstrument(state.instrumentId).id;
    if (!selectedIds.current.includes(id)) return;
    const next = { ...state, instrumentId: id, level: Math.max(0, Math.min(1, state.level || 0)) };
    setTrackStates((current) => {
      const previous = current[id];
      if (previous?.status === next.status && previous.message === next.message &&
        Math.abs(previous.level - next.level) < 0.005) return current;
      return { ...current, [id]: next };
    });
  }, []);

  const loadTrackMix = useCallback((mix?: AccompanimentTrackMixMap) => {
    setStoredMix(normalizeAccompanimentTrackMix(mix));
    setTrackStates({});
    setSoloInstrumentId(null);
  }, []);

  const resetTrackLevels = useCallback(() => {
    setTrackStates((current) => Object.fromEntries(Object.entries(current).flatMap(([id, state]) => {
      if (state.status === "loading") return [];
      return [[id, state.status === "error" ? { ...state, level: 0 }
        : { instrumentId: id, status: "ready" as const, level: 0 }]];
    })));
  }, []);

  useEffect(() => {
    setTrackStates((current) => Object.fromEntries(Object.entries(current).filter(([id]) => instrumentIds.includes(id))));
  }, [instrumentIds]);

  useEffect(() => {
    setAccompanimentTrackMix(trackMix);
  }, [trackMix]);

  return {
    trackMix, trackStates, soloInstrumentId, setSoloInstrumentId,
    setTrackVolume, toggleTrackMute, onTrackState, loadTrackMix, resetTrackLevels
  };
}

export type AccompanimentMixerController = ReturnType<typeof useAccompanimentMixer>;
