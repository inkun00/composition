import { useCallback, useEffect, useRef, useState } from "react";
import { LearningAudio } from "./learningAudio";
import type { DynamicId, NoteId } from "./learningModel";

export type LearningPlayback = ReturnType<typeof useLearningPlayback>;
type PlayOptions = {
  notes: NoteId[];
  bpm: number;
  beatsPerBar?: number;
  dynamic?: DynamicId;
  crescendo?: boolean;
  decrescendo?: boolean;
};

export function useLearningPlayback() {
  const player = useRef<LearningAudio | null>(null);
  const generation = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [beat, setBeat] = useState(-1);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    generation.current += 1;
    player.current?.stop();
    setPlaying(false);
    setActiveIndex(-1);
    setBeat(-1);
    setError("");
  }, []);

  useEffect(() => {
    const onHidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      generation.current += 1;
      document.removeEventListener("visibilitychange", onHidden);
      player.current?.dispose();
      player.current = null;
    };
  }, [stop]);

  async function play(options: PlayOptions) {
    stop();
    const current = generation.current;
    setError("");
    setPlaying(true);
    try {
      player.current ??= new LearningAudio();
      await player.current.play({ ...options,
        onStep: (index, currentBeat) => {
          if (current !== generation.current) return;
          setActiveIndex(index);
          setBeat(currentBeat);
        },
        onEnd: () => {
          if (current !== generation.current) return;
          setPlaying(false);
          setActiveIndex(-1);
          setBeat(-1);
        }
      });
    } catch {
      if (current !== generation.current) return;
      stop();
      setError("소리를 시작하지 못했어요. 기기의 소리 설정을 확인한 뒤 다시 눌러 주세요.");
    }
  }

  return { play, stop, playing, activeIndex, beat, error };
}
