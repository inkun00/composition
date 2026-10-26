export type PublishedSongPlaybackState = Readonly<{
  songId: string;
  phase: "preparing" | "playing";
  elapsedSeconds: number;
  durationSeconds: number;
}>;

export type PublishedSongPlaybackStore = Readonly<{
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PublishedSongPlaybackState | null;
}>;

/** Only lyric panels subscribe; the full composition editor need not render on each audio tick. */
export function createPublishedSongPlaybackStore() {
  let snapshot: PublishedSongPlaybackState | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(next: PublishedSongPlaybackState | null) {
      if (snapshot === next) return;
      snapshot = next;
      for (const listener of listeners) listener();
    }
  };
}

export const EMPTY_PUBLISHED_SONG_PLAYBACK_STORE: PublishedSongPlaybackStore = {
  subscribe: () => () => undefined,
  getSnapshot: () => null
};
