import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Compass, Sparkles } from "lucide-react";
import LearningHome from "./LearningHome";
import LearningQuiz from "./LearningQuiz";
import NotesLab from "./NotesLab";
import MeterLab from "./MeterLab";
import TempoLab from "./TempoLab";
import DynamicsLab from "./DynamicsLab";
import SymbolsLab from "./SymbolsLab";
import { LESSONS, type LessonId } from "./learningModel";
import { useLearningPlayback } from "./useLearningPlayback";
import { useLearningProgress } from "./useLearningProgress";
import MusicGameScreen from "./games/MusicGameScreen";
import LearningArt from "./LearningArt";
import { useLearningButtonFeel } from "./useLearningButtonFeel";
import { useGameProgress, type GameId } from "./games/gameProgress";
import "./MusicLearning.css";
import "./LearningLabs.css";
import "./LearningArtDirection.css";

export default function MusicLearning({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [lessonId, setLessonId] = useState<LessonId | null>(null);
  const [gameId, setGameId] = useState<GameId | null>(null);
  const [tab, setTab] = useState<"explore" | "quiz">("explore");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const interactionRoot = useLearningButtonFeel();
  const audio = useLearningPlayback();
  const progress = useLearningProgress();
  const games = useGameProgress();
  const lesson = LESSONS.find((item) => item.id === lessonId);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    titleRef.current?.focus({ preventScroll: true });
  }, [lessonId, gameId]);

  function select(id: LessonId | null) {
    audio.stop();
    setLessonId(id);
    setGameId(null);
    setTab("explore");
  }

  function playGame(id: GameId) {
    audio.stop();
    setLessonId(null);
    setGameId(id);
  }

  function changeTab(value: "explore" | "quiz") {
    audio.stop();
    setTab(value);
    document.getElementById(value === "explore" ? "learn-explore-tab" : "learn-quiz-tab")?.focus();
  }

  function nextLesson() {
    const index = LESSONS.findIndex((item) => item.id === lessonId);
    select(LESSONS[index + 1]?.id ?? null);
  }

  return <div className="music-learning" ref={interactionRoot}>
    <a className="learn-skip" href="#learn-main">학습 내용으로 건너뛰기</a>
    <header className="learn-header"><div className="learn-header-inner">
      <button className="learn-back" onClick={lesson || gameId ? () => select(null) : onClose}><ArrowLeft size={18} />{lesson || gameId ? "탐험 지도" : "마음멜로디로"}</button>
      <button className="learn-brand" onClick={() => select(null)} aria-label="음악 학습하기 처음으로"><BookOpen size={23} /><strong>음악 학습하기</strong></button>
      <span className="learn-header-progress"><Sparkles size={17} /><strong>{games.totalStars}</strong> / 9 별</span>
    </div></header>
    {gameId ? <MusicGameScreen game={gameId} onExit={() => select(null)} onComplete={(result) => games.recordResult(gameId, result)} /> : !lesson ? (
      <LearningHome completed={progress.completed} saved={games.saved} onSelect={select} onCreate={onCreate}
        records={games.records} totalStars={games.totalStars} totalScore={games.totalScore} onPlay={playGame} />
    ) : (
      <div className="learn-workspace">
        <nav className="learn-lesson-nav" aria-label="다섯 가지 음악 학습">
          <p className="learn-eyebrow">나의 탐험 지도</p>
          {LESSONS.map((item, index) => <button key={item.id} aria-current={item.id === lessonId ? "step" : undefined}
            onClick={() => select(item.id)}><span>{progress.completed.includes(item.id) ? <Check size={16} /> : `0${index + 1}`}</span><strong>{item.title}</strong></button>)}
          <div className="learn-nav-note"><LearningArt name="guide-bird" className="learn-guide-bird" /><p>천천히, 여러 번 해 봐도 괜찮아요.</p><small>모든 단원은 자유롭게 열려 있어요.</small></div>
        </nav>
        <main className="learn-lesson-main" id="learn-main">
          <div className="learn-lesson-heading"><div><span className="learn-eyebrow">음악 도감 {LESSONS.indexOf(lesson) + 1} / 5</span>
            <h1 ref={titleRef} tabIndex={-1}>{lesson.title}</h1><p>{lesson.subtitle}</p></div>
            <LearningArt name="guide-bird" className="learn-lesson-bird" eager /></div>
          <div className="learn-tab-list" role="tablist" aria-label="학습 방법">
            <button id="learn-explore-tab" role="tab" aria-selected={tab === "explore"} aria-controls="learn-explore-panel"
              tabIndex={tab === "explore" ? 0 : -1} onClick={() => changeTab("explore")}
              onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { changeTab("quiz"); document.getElementById("learn-quiz-tab")?.focus(); } }}>
              <Compass size={18} /> 먼저 체험하기</button>
            <button id="learn-quiz-tab" role="tab" aria-selected={tab === "quiz"} aria-controls="learn-quiz-panel"
              tabIndex={tab === "quiz" ? 0 : -1} onClick={() => changeTab("quiz")}
              onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { changeTab("explore"); document.getElementById("learn-explore-tab")?.focus(); } }}>
              <Sparkles size={18} /> 도전! 발견 퀴즈</button>
          </div>
          <div id="learn-explore-panel" role="tabpanel" aria-labelledby="learn-explore-tab" hidden={tab !== "explore"}>
            {lessonId === "notes" && <NotesLab audio={audio} />}
            {lessonId === "meter" && <MeterLab audio={audio} />}
            {lessonId === "tempo" && <TempoLab audio={audio} active={tab === "explore"} />}
            {lessonId === "dynamics" && <DynamicsLab audio={audio} />}
            {lessonId === "symbols" && <SymbolsLab />}
            <div className="learn-ready"><span>발견한 것을 기억하고 있나요?</span><button className="learn-primary" onClick={() => { changeTab("quiz"); window.scrollTo({ top: 0, behavior: "instant" }); }}>
              퀴즈로 확인하기 <ArrowRight size={17} /></button></div>
          </div>
          <div id="learn-quiz-panel" role="tabpanel" aria-labelledby="learn-quiz-tab" hidden={tab !== "quiz"}>
            <LearningQuiz key={lesson.id} lesson={lesson.id} active={tab === "quiz"} onComplete={() => progress.markComplete(lesson.id)}
              onExplore={() => changeTab("explore")} onNext={nextLesson} />
          </div>
          {audio.error && <p className="learn-audio-error" role="alert">{audio.error}</p>}
          {!progress.saved && <p className="learn-storage-note" role="status">발견 도장을 저장하지 못했어요. 학습은 계속할 수 있지만 새로고침하면 기록이 사라질 수 있어요.</p>}
        </main>
      </div>
    )}
    <footer className="learn-footer">작은 소리에서 시작하는 큰 발견 <span>마음멜로디 음악 놀이터</span></footer>
  </div>;
}
