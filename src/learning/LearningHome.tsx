import { useEffect, useRef } from "react";
import { ArrowRight, BookOpen, Check, Star, Trophy } from "lucide-react";
import AppArtwork from "../components/AppArtwork";
import { LESSONS, type LessonId } from "./learningModel";
import AdventureMap from "./games/AdventureMap";
import type { GameId, GameRecords } from "./games/gameProgress";
import "./LearningArcade.css";

export default function LearningHome({ completed, saved, onSelect, onCreate, records, onPlay, totalStars, totalScore }: {
  completed: LessonId[]; saved: boolean; onSelect: (id: LessonId) => void; onCreate: () => void;
  records: GameRecords; onPlay: (id: GameId) => void; totalStars: number; totalScore: number;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <main className="arcade-home" id="learn-main">
    <section className="arcade-intro">
      <div><p className="game-kicker">MAEUM MELODY · MUSIC ADVENTURE</p><h1 ref={heading} tabIndex={-1}>리듬별 구조대</h1>
        <p>음악이 멈춘 리듬별에 도움이 필요해요.<br />음표로 길을 만들고, 박자로 달리고, 기억으로 별을 밝혀요!</p></div>
      <div className="arcade-player"><div className="arcade-player-avatar"><AppArtwork name="headphones" size={58} /></div>
        <div><span>나의 구조대 기록</span><strong><Star size={18} fill="currentColor" /> {totalStars} <small>/ 9 별</small></strong><p><Trophy size={13} /> 최고 기록 합계 {totalScore.toLocaleString()}점</p></div>
      </div>
    </section>
    <AdventureMap records={records} onPlay={onPlay} />
    <section className="arcade-field-guide" aria-labelledby="learn-lessons-heading">
      <div className="arcade-guide-heading"><div><p className="learn-eyebrow"><BookOpen size={15} /> 구조대의 음악 도감</p>
        <h2 id="learn-lessons-heading">무엇부터 배워 볼까요?</h2></div><p>미션이 어려울 땐 여기서 연습해요.</p></div>
      <div className="arcade-guide-links">
        {LESSONS.map((lesson, index) => <button key={lesson.id} className={`learn-lesson-card theme-${lesson.id}`}
          data-complete={completed.includes(lesson.id)} aria-label={`${lesson.title}${completed.includes(lesson.id) ? ", 도감 완료" : ""}`} onClick={() => onSelect(lesson.id)}>
          <span>{completed.includes(lesson.id) ? <Check size={16} /> : `0${index + 1}`}</span><strong>{lesson.title}</strong><ArrowRight size={16} />
        </button>)}
      </div>
      <span className="arcade-guide-caption">도감 퀴즈 {completed.length} / 5 완료 · 게임의 별과 따로 기록돼요</span>
    </section>
    <section className="learn-create-strip"><AppArtwork name="lightbulb" size={52} />
      <div><h2>이번에는 내가 음악을 만들 차례!</h2><p>게임에서 만난 음표로 나만의 리듬과 가락을 만들어요.</p></div>
      <button className="learn-secondary" onClick={onCreate}>리듬·가락 만들기 <ArrowRight size={17} /></button>
    </section>
    <p className="learn-storage-note" role="status">{saved ? "최고 점수와 별은 이 브라우저에 저장돼요. 로그인 없이 즐길 수 있어요." : "기록을 기기에 저장할 수 없어요. 지금 게임은 계속할 수 있지만 화면을 떠나면 새 기록이 사라질 수 있어요."}</p>
  </main>;
}
