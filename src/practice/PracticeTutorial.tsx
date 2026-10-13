import { BookOpen, ChevronRight, X } from "lucide-react";
import { useState } from "react";

const LESSONS = [
  { title: "작은 목표를 골라요", text: "처음에는 1마디, 4/4박자로 시작해 보세요. 한 마디에는 4분음표가 네 개 들어가요.", tip: "먼저 아래의 마디 수와 박자를 골라요." },
  { title: "말을 리듬으로 바꿔요", text: "먼저 리듬 악기를 고르고 음표를 선택한 뒤 빈칸에 배치해요. ‘악보 추가하기’로 최대 3개의 다른 리듬을 만들고 함께 들을 수 있어요.", tip: "다 채우기 전에도 마디별로 들을 수 있어요. 만든 음표 아래에 가사를 넣어요. 다른 음표를 선택해도 이미 배치한 리듬은 바뀌지 않아요." },
  { title: "원하면 높낮이를 붙여요", text: "가락 만들기는 선택이에요. 완성한 리듬을 그대로 사용해 높낮이를 붙여요. 마디 바로 위에서 칸 채우기와 악보에 넣기 중 편한 방식을 골라요.", tip: "첫 화음을 고르면 다음 마디에는 자주 연결하는 화음이 보여요. 앞 화음을 바꾸면 뒤 화음도 후보 안에서 맞춰요. 만든 음표와 가사는 그대로예요. 화음 밖의 음도 색다른 느낌을 만들 수 있으니 안내와 함께 직접 들어 비교해 보세요." },
  { title: "귀로 확인하고 간직해요", text: "‘3 음악 저장하기’에서 완성한 리듬이나 가락을 MP3·MP4로 저장해요. MP4는 막대 모드와 악보 모드 중에서 골라 미리 살펴볼 수 있어요.", tip: "막대의 길이는 리듬, 높이는 가락을 보여요. 악보 모드는 만든 음표와 쉼표를 그대로 보여요. 가사는 선택이에요. ‘4 음악 공유하기’로 샘보드를 열고 저장한 파일을 직접 올려 보세요." }
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
