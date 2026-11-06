import { useState } from "react";
import MusicSymbol, { type MusicSymbolId } from "./MusicSymbol";
import { LabNote } from "./LearningLabParts";

const SYMBOLS: { id: MusicSymbolId; name: string; short: string; description: string; mission: string }[] = [
  { id: "treble", name: "높은음자리표", short: "높은 소리의 길잡이", description: "오선의 둘째 줄이 ‘솔’의 자리임을 알려 줘요. 보통 높은 소리의 악보에서 만나요.", mission: "소리의 높이를 읽을 때 출발점이 되어 줘요." },
  { id: "bass", name: "낮은음자리표", short: "낮은 소리의 길잡이", description: "두 점 사이의 넷째 줄이 ‘파’의 자리임을 알려 줘요. 보통 낮은 소리의 악보에서 만나요.", mission: "높은음자리표와 낮은음자리표의 모양을 비교해 보세요." },
  { id: "barline", name: "세로줄", short: "한 마디씩 나누어요", description: "오선을 가로지르는 가는 세로줄이에요. 악보를 마디로 나누어 박자를 읽기 쉽게 해 줘요.", mission: "2/4박자라면 두 박을 모은 뒤 다음 마디로 가요." },
  { id: "final", name: "끝세로줄", short: "여기서 곡이 끝나요", description: "가는 줄과 굵은 줄이 나란히 있어요. 곡이 끝나는 곳을 알려 줘요.", mission: "세로줄과 달리, 뒤쪽 줄이 굵다는 것을 찾아보세요." },
  { id: "repeat", name: "도돌이표", short: "한 번 더 연주해요", description: "점을 마주 보는 도돌이표 구간을 보통 한 번 더 연주해요. 시작 도돌이표가 없으면 곡의 처음으로 돌아가요.", mission: "여기 보이는 것은 돌아가는 쪽 도돌이표예요. 점 두 개를 찾아보세요." },
  { id: "sharp", name: "올림표 (♯)", short: "반음 높여요", description: "붙은 음을 반음 높여 연주해요. 피아노에서 바로 이웃한 건반으로 한 칸 높아지는 거예요.", mission: "올림표는 세게 연주하라는 뜻이 아니에요. 소리의 높이를 바꿔요." },
  { id: "flat", name: "내림표 (♭)", short: "반음 낮춰요", description: "붙은 음을 반음 낮춰 연주해요. 피아노에서 바로 이웃한 건반으로 한 칸 낮아지는 거예요.", mission: "내림표는 느리게 연주하라는 뜻이 아니에요." },
  { id: "natural", name: "제자리표 (♮)", short: "원래 높이로 돌아와요", description: "올림표나 내림표로 바꾼 음을 원래의 높이로 되돌려요.", mission: "올림표, 내림표, 제자리표의 모양을 번갈아 골라 보세요." }
];

export default function SymbolsLab() {
  const [selected, setSelected] = useState(SYMBOLS[0]);
  const [revealed, setRevealed] = useState(true);
  return <div className="learn-lab">
    <div className="learn-lab-intro"><h2>악보 속 작은 표지판을 찾아요</h2>
      <p>기호를 골라 뜻을 살펴보고, 설명을 가린 다음 스스로 말해 보세요.</p></div>
    <div className="learn-symbol-layout">
      <div className="learn-symbol-grid" role="group" aria-label="악보 기호 선택">
        {SYMBOLS.map((symbol) => <button key={symbol.id} aria-pressed={selected.id === symbol.id}
          onClick={() => { setSelected(symbol); setRevealed(true); }}>
          <MusicSymbol id={symbol.id} size={85} /><span>{symbol.name}</span>
        </button>)}
      </div>
      <section className="learn-symbol-detail" aria-label="기호 설명">
        <span className="learn-eyebrow">악보 기호 카드</span>
        <MusicSymbol id={selected.id} size={180} />
        <h3>{selected.name}</h3>
        <p className="learn-symbol-short">{revealed ? selected.short : "이 기호는 무슨 뜻일까요?"}</p>
        <div className="learn-symbol-description" aria-live="polite">
          {revealed ? <p>{selected.description}</p> : <p>소리 내어 설명한 뒤<br />아래 버튼으로 확인해 보세요.</p>}
        </div>
        <button className="learn-secondary" aria-expanded={revealed} onClick={() => setRevealed(!revealed)}>
          {revealed ? "설명 가리고 기억하기" : "설명 확인하기"}
        </button>
      </section>
    </div>
    <LabNote>{selected.mission}</LabNote>
  </div>;
}
