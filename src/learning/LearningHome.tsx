import { ArrowRight, Check, Sparkles } from "lucide-react";
import AppArtwork, { type AppArtworkName } from "../components/AppArtwork";
import { LESSONS, type LessonId } from "./learningModel";
import { NoteSymbol } from "./LearningScore";

const ARTWORK: Record<LessonId, AppArtworkName> = {
  notes: "melody-stage", meter: "rhythm-stage", tempo: "tempo-fast", dynamics: "volume-on", symbols: "book"
};

export default function LearningHome({ completed, saved, onSelect, onCreate }: {
  completed: LessonId[]; saved: boolean; onSelect: (id: LessonId) => void; onCreate: () => void;
}) {
  const next = LESSONS.find((lesson) => !completed.includes(lesson.id)) ?? LESSONS[0];
  return <main className="learn-home" id="learn-main">
    <section className="learn-hero">
      <div className="learn-hero-copy"><span className="learn-eyebrow"><span className="learn-tiny-dot" /> 듣고 · 만지고 · 발견하는 음악</span>
        <h1>소리로 배우는<br /><em>음악 놀이터</em></h1>
        <p>2분음표는 얼마나 길까? mf는 무슨 뜻일까?<br />직접 들어 보고, 작은 게임으로 하나씩 알아가요.</p>
        <button className="learn-primary" onClick={() => onSelect(next.id)}>
          {completed.length ? "이어서 탐험하기" : "첫 번째 놀이터로"} <ArrowRight size={18} />
        </button>
        <span className="learn-hero-caption">처음이어도 괜찮아요. 정답보다 발견이 먼저!</span>
      </div>
      <div className="learn-hero-art" aria-hidden="true">
        <div className="learn-staff-lines" />
        <div className="learn-floating-note note-one"><NoteSymbol id="half" size={75} /><span>2박</span></div>
        <div className="learn-floating-note note-two"><strong>mf</strong><span>조금 세게</span></div>
        <AppArtwork name="melody-stage" size={270} className="learn-hero-image" />
        <span className="learn-hero-sticker"><Sparkles size={17} /> 음악이랑 친해지는 시간</span>
      </div>
    </section>
    <section className="learn-discoveries" aria-label="내 학습 기록">
      <div><span className="learn-progress-icon"><Sparkles size={22} /></span><div><strong>나의 음악 발견</strong><span>{completed.length === LESSONS.length ? "모든 놀이터를 탐험했어요!" : "퀴즈를 마치고 발견 도장을 모아 보세요."}</span></div></div>
      <div className="learn-progress-stamps" aria-label={`${LESSONS.length}개 중 ${completed.length}개 단원 완료`}>
        {LESSONS.map((lesson, index) => <span key={lesson.id} className={completed.includes(lesson.id) ? "complete" : ""}
          title={lesson.title}>{completed.includes(lesson.id) ? <Check size={19} aria-hidden="true" /> : index + 1}</span>)}
        <strong>{completed.length}<span> / {LESSONS.length}</span></strong>
      </div>
    </section>
    <section className="learn-lessons" aria-labelledby="learn-lessons-heading">
      <div className="learn-section-heading"><div><p className="learn-eyebrow">작은 발견, 다섯 가지</p><h2 id="learn-lessons-heading">무엇부터 배워 볼까요?</h2></div><p>원하는 곳부터 시작해도 좋아요.</p></div>
      <div className="learn-lesson-grid">
        {LESSONS.map((lesson, index) => <button key={lesson.id} className={`learn-lesson-card theme-${lesson.id}`} onClick={() => onSelect(lesson.id)}>
          <div className="learn-card-top"><span className="learn-card-number">0{index + 1}</span>
            <span className="learn-card-kind">{completed.includes(lesson.id) ? <><Check size={14} /> 발견 완료</> : "체험 + 퀴즈"}</span></div>
          <AppArtwork name={ARTWORK[lesson.id]} size={100} className="learn-card-art" />
          <h3>{lesson.title}</h3><p>{lesson.description}</p>
          <span className="learn-card-bottom">놀러 가기 <ArrowRight size={18} /></span>
        </button>)}
      </div>
    </section>
    <section className="learn-create-strip"><AppArtwork name="lightbulb" size={56} />
      <div><h2>배운 음악으로, 내 노래도 만들어 볼까요?</h2><p>직접 음표를 놓으며 리듬과 가락을 만들 수 있어요.</p></div>
      <button className="learn-secondary" onClick={onCreate}>리듬·가락 만들기 <ArrowRight size={17} /></button>
    </section>
    <p className="learn-storage-note" role="status">{saved ? "발견 도장은 이 브라우저에 저장돼요. 로그인 없이 배울 수 있어요." : "지금은 이 기기에 기록을 저장할 수 없어요. 화면을 떠나면 발견 도장이 사라질 수 있어요."}</p>
  </main>;
}
