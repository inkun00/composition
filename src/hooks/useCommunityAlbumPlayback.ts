import { useCallback, useEffect, useRef, useState } from "react";
import type { PublishedSong } from "../firebase/communityAlbums";

type AlbumPlaybackOptions = Readonly<{
  onPlay: (song: PublishedSong) => Promise<boolean>;
  onStop?: () => void;
  onError: (message: string) => void;
}>;

export function useCommunityAlbumPlayback({ onPlay, onStop, onError }: AlbumPlaybackOptions) {
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const session = useRef<Readonly<{ songId: string }> | null>(null);
  const callbacks = useRef({ onPlay, onStop, onError });
  callbacks.current = { onPlay, onStop, onError };

  const stop = useCallback(() => {
    if (!session.current) return;
    session.current = null;
    setPlayingSongId(null);
    callbacks.current.onStop?.();
  }, []);

  const toggle = useCallback(async (song: PublishedSong) => {
    if (session.current?.songId === song.id) {
      stop();
      return;
    }
    stop();
    const current = { songId: song.id };
    session.current = current;
    setPlayingSongId(song.id);
    callbacks.current.onError("");
    try {
      const started = await callbacks.current.onPlay(song);
      if (session.current === current && !started) {
        callbacks.current.onError("다른 음악이 끝난 뒤 다시 재생해 주세요.");
      }
    } catch (error) {
      if (session.current === current) {
        console.error(error);
        callbacks.current.onError("음악을 재생하지 못했어요. 다시 시도해 주세요.");
      }
    } finally {
      if (session.current === current) {
        session.current = null;
        setPlayingSongId(null);
      }
    }
  }, [stop]);

  useEffect(() => () => {
    if (!session.current) return;
    session.current = null;
    callbacks.current.onStop?.();
  }, []);

  return { playingSongId, toggle, stop };
}
