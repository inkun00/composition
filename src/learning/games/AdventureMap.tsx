import { ArrowUpRight, Flag, Play } from "lucide-react";
import LearningArt, { type LearningArtName } from "../LearningArt";
import GameStars from "./GameStars";
import type { GameId, GameRecords } from "./gameProgress";

export const GAME_MISSIONS: { id: GameId; name: string; label: string; description: string; skill: string; rounds: string }[] = [
  { id: "bridge", name: "음표 다리 구조대", label: "01 · 멜로디 강", description: "음표로 다리를 놓고 길 잃은 친구를 건너게 해요.", skill: "음표 길이 · 박자", rounds: "5개 다리" },
  { id: "train", name: "별빛 리듬 열차", label: "02 · 박자 숲", description: "듣고, 기다렸다가, 박자에 맞춰 열차를 달리게 해요.", skill: "빠르기 · 리듬 · 쉼", rounds: "3개 구간" },
  { id: "memory", name: "기호 별자리 맞추기", label: "03 · 기억의 관측소", description: "기호와 뜻의 위치를 기억해 꺼진 별자리를 밝혀요.", skill: "셈여림 · 악보 기호", rounds: "3개 별자리" }
];

export default function AdventureMap({ records, onPlay }: { records: GameRecords; onPlay: (id: GameId) => void }) {
  const art: Record<GameId, LearningArtName> = { bridge: "bridge-scene", train: "train-scene", memory: "observatory" };
  return <>
    <section className="arcade-world" aria-label="리듬별 탐험 지도">
      <div className="arcade-world-tag"><Flag size={15} /> 세 곳의 불빛을 되찾아 주세요!</div>
      <LearningArt name="world-map" className="arcade-map-art" eager />
      <div className="arcade-islands">
        {GAME_MISSIONS.map((mission, index) => <button key={mission.id} className={`arcade-island island-${mission.id}`}
          onClick={() => onPlay(mission.id)} aria-label={`${mission.name} 게임 시작`}>
          <span className="arcade-island-number">{index + 1}</span><span className="arcade-island-enter"><ArrowUpRight size={18} /></span>
          <strong>{mission.name}</strong><GameStars count={records[mission.id]?.stars ?? 0} size={17} />
        </button>)}
      </div>
      <span className="arcade-world-caption">어디부터 출발해도 좋아요 · 모든 미션 열림</span>
    </section>
    <div className="arcade-missions">
      {GAME_MISSIONS.map((mission) => <article key={mission.id} className={`arcade-mission mission-${mission.id}`}>
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
