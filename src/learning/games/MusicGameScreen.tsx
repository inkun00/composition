import { lazy, Suspense } from "react";
import type { GameId, GameResult } from "./gameProgress";

const BeatBridgeGame = lazy(() => import("./BeatBridgeGame"));
const RhythmTrainGame = lazy(() => import("./RhythmTrainGame"));
const DynamicsConductorGame = lazy(() => import("./DynamicsConductorGame"));

export default function MusicGameScreen({ game, onExit, onComplete }: {
  game: GameId; onExit: () => void; onComplete: (result: GameResult) => void;
}) {
  return <Suspense fallback={<p role="status" style={{ padding: 40 }}>구조 미션을 준비하고 있어요…</p>}>
    {game === "bridge" && <BeatBridgeGame onExit={onExit} onComplete={onComplete} />}
    {game === "train" && <RhythmTrainGame onExit={onExit} onComplete={onComplete} />}
    {game === "dynamics" && <DynamicsConductorGame onExit={onExit} onComplete={onComplete} />}
  </Suspense>;
}
