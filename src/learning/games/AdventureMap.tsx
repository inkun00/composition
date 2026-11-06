import { Flag, Layers, Music2, Play, TrainFront } from "lucide-react";
import GameStars from "./GameStars";
import type { GameId, GameRecords } from "./gameProgress";

export const GAME_MISSIONS: { id: GameId; name: string; label: string; description: string; skill: string; rounds: string }[] = [
  { id: "bridge", name: "음표 다리 구조대", label: "01 · 멜로디 강", description: "음표로 다리를 놓고 길 잃은 친구를 건너게 해요.", skill: "음표 길이 · 박자", rounds: "5개 다리" },
  { id: "train", name: "별빛 리듬 열차", label: "02 · 박자 숲", description: "듣고, 기다렸다가, 박자에 맞춰 열차를 달리게 해요.", skill: "빠르기 · 리듬 · 쉼", rounds: "3개 구간" },
  { id: "memory", name: "기호 별자리 맞추기", label: "03 · 기억의 관측소", description: "기호와 뜻의 위치를 기억해 꺼진 별자리를 밝혀요.", skill: "셈여림 · 악보 기호", rounds: "3개 별자리" }
];

export default function AdventureMap({ records, onPlay }: { records: GameRecords; onPlay: (id: GameId) => void }) {
  const icons = { bridge: <Music2 size={38} />, train: <TrainFront size={38} />, memory: <Layers size={38} /> };
  return <>
    <section className="arcade-world" aria-label="리듬별 탐험 지도">
      <div className="arcade-world-tag"><Flag size={15} /> 세 곳의 불빛을 되찾아 주세요!</div>
      <svg className="arcade-map-art" viewBox="0 0 1100 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="arcade-sky" x2="0" y2="1"><stop stopColor="#b8e5df" /><stop offset="1" stopColor="#e6f0c6" /></linearGradient>
          <pattern id="arcade-water" width="70" height="30" patternUnits="userSpaceOnUse"><path d="M0 15q18-8 35 0t35 0" fill="none" stroke="#75bdc0" strokeWidth="2" /></pattern>
        </defs>
        <rect width="1100" height="360" fill="url(#arcade-sky)" />
        <circle cx="960" cy="60" r="33" fill="#ffdf87" />
        <g fill="#fffbea" opacity=".8"><path d="M90 67q-12-30 17-36 18-26 38 0 33-3 27 36Z" /><path d="M704 75q-12-30 17-36 18-26 38 0 33-3 27 36Z" /></g>
        <path d="M0 170q150-110 310-28t270-19 300 0 250-30v267H0Z" fill="#a1c99c" />
        <path d="M0 240q190-120 350-30t300-10 250-27 210 46v141H0Z" fill="#73a985" />
        <path d="M0 316q190-110 390-30t340 0 370-30v104H0Z" fill="#579b88" />
        <path d="M295 0q-75 100 30 170t-20 190" fill="none" stroke="#87ced0" strokeWidth="70" />
        <path d="M295 0q-75 100 30 170t-20 190" fill="none" stroke="url(#arcade-water)" strokeWidth="50" />
        <path d="M185 235Q340 294 535 167T898 143" stroke="#47725f" strokeWidth="20" fill="none" />
        <path d="M185 229Q340 288 535 161T898 137" stroke="#ead8a0" strokeWidth="16" fill="none" strokeDasharray="2 25" strokeLinecap="round" />
        <g fill="#2f765c"><path d="m48 260 28-59 28 59Z" /><path d="m430 136 24-52 24 52Z" /><path d="m730 284 29-65 29 65Z" /><path d="m1030 200 30-70 30 70Z" /></g>
        <g fill="#f5d687"><circle cx="382" cy="258" r="5" /><circle cx="695" cy="142" r="5" /><circle cx="780" cy="130" r="5" /></g>
      </svg>
      <div className="arcade-islands">
        {GAME_MISSIONS.map((mission, index) => <button key={mission.id} className={`arcade-island island-${mission.id}`}
          onClick={() => onPlay(mission.id)} aria-label={`${mission.name} 게임 시작`}>
          <span className="arcade-island-number">{index + 1}</span><span className="arcade-island-icon">{icons[mission.id]}</span>
          <strong>{mission.name}</strong><GameStars count={records[mission.id]?.stars ?? 0} size={17} />
        </button>)}
      </div>
      <span className="arcade-world-caption">어디부터 출발해도 좋아요 · 모든 미션 열림</span>
    </section>
    <div className="arcade-missions">
      {GAME_MISSIONS.map((mission) => <article key={mission.id} className={`arcade-mission mission-${mission.id}`}>
        <div className="arcade-mission-heading"><span>{mission.label}</span><span>{mission.rounds}</span></div>
        <h2>{mission.name}</h2><p>{mission.description}</p>
        <div className="arcade-mission-skill">{mission.skill}</div>
        <div className="arcade-mission-record"><GameStars count={records[mission.id]?.stars ?? 0} size={18} /><span>{records[mission.id] ? `최고 ${records[mission.id]!.score.toLocaleString()}점` : "첫 구조를 기다리고 있어요"}</span></div>
        <button className="learn-primary" onClick={() => onPlay(mission.id)}><Play size={16} />{records[mission.id] ? "다시 도전" : "게임 시작"}</button>
      </article>)}
    </div>
  </>;
}
