import { useEffect, useMemo, useRef, useState } from "react";
import type { MusicVideoExportOptions } from "../video/prepareMusicVideoPlayback";
import { INITIAL_STUDIO_PLAYBACK, StudioPlaybackController } from "./studioPlaybackController";

/** Mount only while the full-song preview is open. Options remain stable for that preview snapshot. */
export function useStudioPlayback(options: MusicVideoExportOptions, onBusyChange: (busy: boolean) => void) {
  const [state, setState] = useState(INITIAL_STUDIO_PLAYBACK);
  const active = useRef<StudioPlaybackController | null>(null);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;

  useEffect(() => {
    const controller = new StudioPlaybackController(options, setState);
    active.current = controller;
    setState(INITIAL_STUDIO_PLAYBACK);
    return () => {
      if (active.current === controller) active.current = null;
      controller.dispose();
    };
  }, [options]);

  useEffect(() => {
    busyCallback.current(true);
    return () => busyCallback.current(false);
  }, []);

  const actions = useMemo(() => ({
    play: () => active.current?.play() ?? Promise.resolve(),
    pause: () => active.current?.pause(),
    seek: (seconds: number) => active.current?.seek(seconds),
    restart: () => active.current?.restart() ?? Promise.resolve(),
    getCurrentTime: () => active.current?.getCurrentTime() ?? 0
  }), []);
  return { ...state, ...actions };
}
