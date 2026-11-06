import { useCallback, useEffect, useRef, useState } from "react";
import { DynamicsPerformanceAudio, type DynamicsPerformanceFrame } from "./DynamicsPerformanceAudio";
import type { DynamicsMarking } from "./dynamicsPerformanceModel";

const idle: DynamicsPerformanceFrame = { progress: 0, activeIndex: -1, gain: 0 };

export function useDynamicsPerformance() {
  const player = useRef<DynamicsPerformanceAudio | null>(null);
  const generation = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(idle);
  const [error, setError] = useState("");
  const stop = useCallback(() => {
    generation.current++;
    player.current?.stop();
    setPlaying(false);
    setFrame(idle);
  }, []);

  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      generation.current++;
      document.removeEventListener("visibilitychange", hidden);
      player.current?.dispose();
      player.current = null;
    };
  }, [stop]);

  async function play(marking: DynamicsMarking, onEnd?: () => void) {
    stop();
    const current = generation.current;
    setError("");
    setPlaying(true);
    try {
      player.current ??= new DynamicsPerformanceAudio();
      await player.current.play(marking, {
        onFrame: (next) => { if (current === generation.current) setFrame(next); },
        onEnd: () => {
          if (current !== generation.current) return;
          setPlaying(false);
          setFrame(idle);
          onEnd?.();
        }
      });
    } catch {
      if (current !== generation.current) return;
      stop();
      setError("소리를 시작하지 못했어요. 기기의 소리를 확인하고 다시 눌러 주세요.");
    }
  }

  return { play, stop, playing, frame, error,
    setMarking: (marking: DynamicsMarking) => player.current?.setMarking(marking) };
}
