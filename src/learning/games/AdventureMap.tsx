import { ArrowUpRight, Flag, Play } from "lucide-react";
import LearningArt, { type LearningArtName } from "../LearningArt";
import GameStars from "./GameStars";
import type { GameId, GameRecords } from "./gameProgress";

export const GAME_MISSIONS: { id: GameId; name: string; label: string; description: string; skill: string; rounds: string }[] = [
  { id: "bridge", name: "음표 다리 구조대", label: "01 · 멜로디 강", description: "음표로 다리를 놓고 길 잃은 친구를 건너게 해요.", skill: "음표 길이 · 박자", rounds: "5개 다리" },
  { id: "train", name: "별빛 리듬 열차", label: "02 · 박자 숲", description: "듣고, 기다렸다가, 박자에 맞춰 열차를 달리게 해요.", skill: "빠르기 · 리듬 · 쉼", rounds: "3개 구간" },
  { id: "dynamics", name: "셈여림 지휘자", label: "03 · 별빛 음악회", description: "같은 가락의 셈여림을 바꾸며 음악회를 지휘해요.", skill: "셈여림 · 크레셴도 · 데크레셴도", rounds: "4개 미션" }
];

export default function AdventureMap({ records, onPlay }: { records: GameRecords; onPlay: (id: GameId) => void }) {
  const art: Record<GameId, LearningArtName> = { bridge: "bridge-scene", train: "train-scene", dynamics: "observatory" };
  return <>
    <section className="arcade-world" aria-label="리듬별 탐험 지도">
      <div className="arcade-world-tag"><Flag size={15} /> 세 곳의 불빛을 되찾아 주세요!</div>
      <LearningArt name="world-map" className="arcade-map-art" eager />
      <div className="arcade-islands">
        {GAME_MISSIONS.map((mission, index) => <button key={mission.id} className={`arcade-island island-${mission.id}${mission.id === "dynamics" ? " island-memory" : ""}`}
          onClick={() => onPlay(mission.id)} aria-label={`${mission.name} 게임 시작`}>
          <span className="arcade-island-number">{index + 1}</span><span className="arcade-island-enter"><ArrowUpRight size={18} /></span>
          <strong>{mission.name}</strong><GameStars count={records[mission.id]?.stars ?? 0} size={17} />
        </button>)}
      </div>
      <span className="arcade-world-caption">어디부터 출발해도 좋아요 · 모든 미션 열림</span>
    </section>
    <div className="arcade-missions">
      {GAME_MISSIONS.map((mission) => <article key={mission.id} className={`arcade-mission mission-${mission.id}${mission.id === "dynamics" ? " mission-memory" : ""}`}>
        <LearningArt name={art[mission.id]} className="arcade-mission-art" eager />
        <div className="arcade-mission-body">
        <div className="arcade-mission-heading"><span>{mission.label}</span><span>{mission.rounds}</span></div>
        <h2>{mission.name}</h2><p>{mission.description}</p>
        <div className="arcade-mission-skill">{mission.skill}</div>
        <div className="arcade-mission-record"><GameStars count={records[mission.id]?.stars ?? 0} size={18} /><span>{records[mission.id] ? `최고 ${records[mission.id]!.score.toLocaleString()}점` : "첫 구조를 기다리고 있어요"}</span></div>
        <button className="learn-primary" onClick={() => onPlay(mission.id)}><Play size={16} />{records[mission.id] ? "다시 도전" : "게임 시작"}</button>
        </div>
      </article>)}
    </div>
  </>;
}
