import { BookOpen, ChevronRight, X } from "lucide-react";
import { useState } from "react";

const LESSONS = [
  { title: "작은 목표를 골라요", text: "마디 수와 박자를 골라요. 4/4박자 한 마디는 4분음표 네 개예요.", tip: "처음에는 1마디로 시작해 보세요." },
  { title: "말을 리듬으로 바꿔요", text: "음표나 쉼표 버튼을 누르면 선택한 마디에 들어가요. 빈칸을 누르면 한 번 더 넣고, 배치한 칸을 누르면 삭제돼요.", tip: "악보는 3개까지 겹칠 수 있어요. 가사는 음표 아래에 넣어요." },
  { title: "원하면 높낮이를 붙여요", text: "가락 만들기로 바로 시작해도 돼요. 음표를 넣고 칸을 누르거나 악보의 음표를 끌어 높낮이를 정해요.", tip: "만든 리듬이 있다면 그대로 이어서 가락을 붙여요. 악보에서는 ↑·↓ 키로 반음씩 옮겨요." },
  { title: "귀로 확인하고 간직해요", text: "음악 저장하기에서 MP3·MP4로 저장해요. 가락과 가사는 선택이에요.", tip: "MP4: 막대 길이는 리듬, 높이는 가락. 악보 모드는 만든 악보예요. 음악 공유하기에서 저장한 파일을 올려요." }
];

export default function PracticeTutorial() {
  const [open, setOpen] = useState(false);
  const [lesson, setLesson] = useState(0);
  return (
    <div className="practice-tutorial">
      <button type="button" className="practice-help-button" aria-label="처음이라면? 연습 안내" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <BookOpen size={18} /> 도움말
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
