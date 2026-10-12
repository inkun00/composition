import { BookOpen, ChevronRight, X } from "lucide-react";
import { useState } from "react";

const LESSONS = [
  { title: "작은 목표를 골라요", text: "처음에는 1마디, 4/4박자로 시작해 보세요. 한 마디에는 4분음표가 네 개 들어가요.", tip: "먼저 아래의 마디 수와 박자를 골라요." },
  { title: "말을 리듬으로 바꿔요", text: "먼저 리듬 악기를 고르고 마디를 채워요. ‘악보 추가하기’로 최대 3개의 다른 리듬을 만들고 함께 들을 수 있어요.", tip: "다 채우기 전에도 마디별로 들을 수 있어요. 음표 아래에 가사를 넣거나 ‘가사에 음표 붙이기’로 리듬 초안을 만들어요." },
  { title: "리듬에 높낮이를 붙여요", text: "모든 악보의 박자가 맞으면 ‘가락 만들기’로 넘어가요. 첫 악보의 음표를 도·레·미 칸으로 옮겨 가락을 만들어요.", tip: "추가한 악보는 리듬 반주가 돼요. 가락을 만드는 중에도 음표 길이와 쉼표를 고치고 박자를 다시 확인해요." },
  { title: "귀로 확인하고 간직해요", text: "힌트를 보고 가까운 음을 시도해 보세요. 화면 아래에서 악기를 고르고 미리듣기로 마음에 드는 가락을 찾아요.", tip: "MP3는 연주 소리, MP4는 검은 화면에 가사가 나오는 영상이에요." }
];

export default function PracticeTutorial() {
  const [open, setOpen] = useState(false);
  const [lesson, setLesson] = useState(0);
  return (
    <div className="practice-tutorial">
      <button type="button" className="practice-help-button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <BookOpen size={18} /> 처음이라면? 연습 안내
      </button>
      {open && <section className="practice-lesson" aria-label="연습 튜토리얼">
        <div className="practice-lesson-heading">
          <span>함께 해 보기 · {lesson + 1} / {LESSONS.length}</span>
          <button type="button" aria-label="연습 안내 닫기" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <h2>{LESSONS[lesson].title}</h2>
        <p>{LESSONS[lesson].text}</p>
        <small>{LESSONS[lesson].tip}</small>
        <div className="practice-lesson-controls">
          <div aria-label="안내 순서">{LESSONS.map((item, index) => <button key={item.title} type="button"
            aria-label={`${index + 1}번째 안내: ${item.title}`} aria-pressed={lesson === index}
            onClick={() => setLesson(index)}>{index + 1}</button>)}</div>
          <button type="button" onClick={() => lesson < LESSONS.length - 1 ? setLesson(lesson + 1) : setOpen(false)}>
            {lesson < LESSONS.length - 1 ? "다음 안내" : "연습해 볼게요"}<ChevronRight size={16} />
          </button>
        </div>
      </section>}
    </div>
  );
}
