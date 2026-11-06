import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, RotateCcw, Sparkles } from "lucide-react";
import { QUIZZES, type LessonId } from "./learningModel";

type Props = { lesson: LessonId; active: boolean; onComplete: () => void; onExplore: () => void; onNext: () => void };

export default function LearningQuiz({ lesson, active, onComplete, onExplore, onNext }: Props) {
  const questions = QUIZZES[lesson];
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const question = questions[index];
  const correct = selected === question.answer;

  useEffect(() => {
    if (active) heading.current?.focus({ preventScroll: true });
  }, [active, index, done]);

  function next() {
    if (index === questions.length - 1) {
      onComplete();
      setDone(true);
    } else {
      setIndex((value) => value + 1);
      setSelected(null);
    }
  }

  if (done) return (
    <section className="learn-quiz-complete" aria-label="퀴즈 완료">
      <span className="learn-award"><Sparkles size={42} aria-hidden="true" /></span>
      <p className="learn-eyebrow">오늘도 하나 더 배웠어요</p>
      <h2 ref={heading} tabIndex={-1}>음악 발견 도장, 획득!</h2>
      <p>틀려도 다시 생각하고 도전한 여러분이 멋져요.<br />배운 내용을 다른 놀이터에서도 만나 볼까요?</p>
      <button className="learn-primary" onClick={onNext}>다음 놀이터로 <ArrowRight size={18} /></button>
      <button className="learn-text-button" onClick={() => { setDone(false); setIndex(0); setSelected(null); }}>
        <RotateCcw size={16} /> 한 번 더 풀기
      </button>
    </section>
  );

  return (
    <section className="learn-quiz" aria-labelledby="learn-quiz-title">
      <div className="learn-section-top"><span className="learn-eyebrow">생각해 볼까요?</span>
        <span>{index + 1} / {questions.length} 문제</span></div>
      <div className="learn-quiz-dots" aria-hidden="true">
        {questions.map((item, position) => <span key={item.id} className={position <= index ? "filled" : ""} />)}
      </div>
      <h2 id="learn-quiz-title" tabIndex={-1} ref={heading}>{question.prompt}</h2>
      <p className="learn-muted">시간 제한은 없어요. 알맞은 답을 골라 보세요.</p>
      <div className="learn-answers" role="group" aria-label="정답 고르기">
        {question.options.map((option, position) => (
          <button key={option} disabled={correct} aria-pressed={selected === position}
            className={selected === position ? correct ? "is-correct" : "is-retry" : ""}
            onClick={() => setSelected(position)}>
            <span className="learn-answer-number">{correct && selected === position ? <Check size={18} /> : position + 1}</span>
            {option}
          </button>
        ))}
      </div>
      <div aria-live="polite" aria-atomic="true" className="learn-quiz-feedback">
        {selected !== null && <div className={`learn-feedback ${correct ? "success" : "hint"}`}>
          <strong>{correct ? "맞았어요!" : "괜찮아요. 다시 생각해 볼까요?"}</strong>
          <p>{question.explanation}</p>
        </div>}
      </div>
      <div className="learn-quiz-footer">
        <button className="learn-secondary" onClick={onExplore}>체험 다시 보기</button>
        {correct && <button className="learn-primary" onClick={next}>
          {index === questions.length - 1 ? "도장 받기" : "다음 문제"} <ArrowRight size={17} />
        </button>}
      </div>
    </section>
  );
}
