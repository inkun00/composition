import { BookOpen, ChevronRight, X } from "lucide-react";
import { useState } from "react";

const LESSONS = [
  { title: "한 마디부터 만들어요", text: "먼저 1마디의 빈칸에 음표를 넣어 보세요. 마디 수와 빠르기는 곡 설정에서 바꿀 수 있어요.", tip: "마디가 덜 채워져도 미리듣기로 소리를 확인할 수 있어요." },
  { title: "음표를 고르고 빈칸을 눌러요", text: "음표나 쉼표를 고른 뒤 원하는 빈칸을 눌러요. 채운 리듬 칸을 다시 누르면 지워져요.", tip: "실수하면 되돌리기. 가사는 한 줄로 쓰면 음표에 나누어 들어가요." },
  { title: "높낮이로 가락을 만들어요", text: "가락만들기는 빈칸을 눌러 바로 음을 넣어요. 리듬만들고 가락넣기는 리듬을 완성한 뒤 음높이를 골라요.", tip: "만든 리듬은 가락에 담겨요. 가락 악기로만 연주해요. 악보에서는 ↑·↓ 키로 반음씩 옮겨요." },
  { title: "귀로 확인하고 간직해요", text: "음악 저장하기에서 MP3·MP4로 저장해요. 가락과 가사는 선택이에요.", tip: "MP4: 막대 길이는 리듬, 높이는 가락. 악보 모드는 만든 악보예요. 게시판 열기를 눌러 저장한 파일을 첨부해요." }
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
