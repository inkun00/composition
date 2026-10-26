import { useCallback, useEffect, useMemo, useRef } from "react";
import { playComposition, type CompositionPlaybackClock } from "../audio/player";
import type { PublishedSong } from "../firebase/communityAlbums";
import { compositionFromDraft } from "../music/composerDraft";
import { findHarmonyPreset } from "../music/harmonyPresets";
import { findInstrument } from "../music/instruments";
import { findAccompanimentStyle } from "../music/accompaniment";
import { uniqueAccompanimentInstrumentIds } from "../music/accompanimentSelection";
import { createPublishedSongPlaybackStore } from "../music/publishedSongPlaybackState";

type Session = {
  controller: AbortController;
  scheduled: boolean;
  ended: boolean;
  settled: boolean;
  frame: number | null;
  resolve: (played: boolean) => void;
  reject: (failure: unknown) => void;
};

/** The album owns one cancellable audio session, without stopping other players. */
export function usePublishedSongPlayback() {
  const active = useRef<Session | null>(null);
  const store = useMemo(createPublishedSongPlaybackStore, []);

  const finish = useCallback((session: Session, played: boolean, failure?: unknown) => {
    if (session.settled) return;
    session.settled = true;
    if (session.frame !== null) cancelAnimationFrame(session.frame);
    session.frame = null;
    if (active.current === session) {
      active.current = null;
      store.publish(null);
    }
    if (failure !== undefined) session.reject(failure);
    else session.resolve(played);
  }, [store]);

  const followClock = useCallback((session: Session, songId: string, clock: CompositionPlaybackClock) => {
    if (active.current !== session || session.settled) return;
    let lastUpdate = -Infinity;
    const update = (timestamp: number) => {
      if (active.current !== session || session.settled) return;
      if (timestamp - lastUpdate >= 32) {
        const elapsed = clock.getElapsedSeconds();
        const duration = Math.max(0, clock.durationSeconds);
        store.publish({ songId, phase: elapsed < 0 ? "preparing" : "playing",
          elapsedSeconds: Math.max(0, Math.min(duration, elapsed)), durationSeconds: duration });
        lastUpdate = timestamp;
      }
      session.frame = requestAnimationFrame(update);
    };
    update(performance.now());
  }, [store]);

  const stop = useCallback(() => {
    const session = active.current;
    if (!session) return;
    finish(session, true);
    session.controller.abort();
  }, [finish]);

  useEffect(() => stop, [stop]);

  const play = useCallback((song: PublishedSong): Promise<boolean> => {
    if (active.current) return Promise.resolve(false);
    const preset = findHarmonyPreset(song.draft.presetId);
    const playable = compositionFromDraft(song.draft, preset).flatMap((measure, index) => measure.notes ? [{
      notes: measure.notes, harmony: measure.story, chords: measure.chords,
      effects: measure.effects, measureIndex: index
    }] : []);
    if (playable.length !== song.draft.songLength) return Promise.resolve(false);
    let resolve!: (played: boolean) => void;
    let reject!: (failure: unknown) => void;
    const completed = new Promise<boolean>((success, failure) => {
      resolve = success;
      reject = failure;
    });
    const session: Session = { controller: new AbortController(), scheduled: false, ended: false, settled: false,
      frame: null, resolve, reject };
    active.current = session;
    store.publish({ songId: song.id, phase: "preparing", elapsedSeconds: 0, durationSeconds: 0 });
    void (async () => {
      try {
        const duration = await playComposition(playable, findInstrument(song.draft.instrumentId).id,
          song.draft.bpm ?? 96, song.draft.showArrangement ? {
            styleId: findAccompanimentStyle(song.draft.accompanimentStyleId ?? "arpeggio").id,
            instrumentIds: uniqueAccompanimentInstrumentIds(song.draft.accompanimentInstrumentIds ?? ["piano"]),
            trackMix: song.draft.accompanimentTrackMix, beatPattern: song.draft.beatPattern,
            beatVolume: song.draft.beatVolume, meter: song.draft.meter
          } : undefined, false, {
            signal: session.controller.signal,
            onStarted: (clock) => followClock(session, song.id, clock),
            onEnded: () => {
              session.ended = true;
              if (session.scheduled) finish(session, true);
            }
          });
        session.scheduled = true;
        if (session.settled) return;
        if (duration === null) finish(session, session.ended);
        else if (session.ended) finish(session, true);
      } catch (failure) {
        if (!session.settled) finish(session, false, failure);
      }
    })();
    return completed;
  }, [finish, followClock, store]);

  return { play, stop, store };
}
