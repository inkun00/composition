import { useState } from "react";
import { Volume2 } from "lucide-react";
import { DYNAMICS, type DynamicId, type NoteId } from "./learningModel";
import LearningScore from "./LearningScore";
import { LabNote, ListenButton } from "./LearningLabParts";
import type { LearningPlayback } from "./useLearningPlayback";

const RHYTHM: NoteId[] = ["quarter", "quarter", "quarter", "quarter"];
type Change = "steady" | "crescendo" | "decrescendo";

export default function DynamicsLab({ audio }: { audio: LearningPlayback }) {
  const [dynamic, setDynamic] = useState<DynamicId>("mf");
  const [change, setChange] = useState<Change>("steady");
  const selected = DYNAMICS.find((item) => item.id === dynamic)!;

  return <div className="learn-lab">
    <div className="learn-lab-intro"><h2>작게, 조금 세게, 점점 세게!</h2>
      <p>같은 네 음을 서로 다른 세기로 들어 보세요. 빠르기는 똑같아요.</p></div>
    <div className="learn-dynamic-palette" role="group" aria-label="셈여림 기호 선택">
      {DYNAMICS.map((item) => <button key={item.id} aria-pressed={dynamic === item.id && change === "steady"}
        onClick={() => { audio.stop(); setDynamic(item.id); setChange("steady"); }}>
        <strong className="learn-music-type">{item.id}</strong><span>{item.description}</span>
      </button>)}
    </div>
    <div className="learn-demonstration">
      <div className="learn-section-top"><span className="learn-eyebrow">셈여림 실험실</span><span>빠르기는 84 BPM</span></div>
      <div className="learn-dynamic-readout">
        <span className="learn-music-type">{change === "steady" ? dynamic : change === "crescendo" ? "cresc." : "decresc."}</span>
        <div><h3>{change === "steady" ? selected.name : change === "crescendo" ? "크레셴도" : "데크레셴도"}</h3>
          <p>{change === "steady" ? selected.description : change === "crescendo" ? "점점 세게 연주해요." : "점점 여리게 연주해요."}</p></div>
      </div>
      <LearningScore notes={RHYTHM} activeIndex={audio.activeIndex} dynamic={change === "steady" ? dynamic : undefined} />
      <div className={`learn-volume-bars ${change}`} aria-label={change === "steady" ? `${dynamic}로 같은 세기` : change === "crescendo" ? "점점 세게" : "점점 여리게"}>
        {RHYTHM.map((_, index) => {
          const strength = change === "steady" ? (DYNAMICS.findIndex((item) => item.id === dynamic) + 1) / DYNAMICS.length
            : change === "crescendo" ? (index + 1) / 4 : (4 - index) / 4;
          return <div key={index} className={audio.activeIndex === index ? "active" : ""}>
            <span style={{ height: `${18 + strength * 54}px` }} /><small>{index + 1}번째 음</small>
          </div>;
        })}
      </div>
      <ListenButton audio={audio} onPlay={() => void audio.play({ notes: RHYTHM, bpm: 84, dynamic,
        crescendo: change === "crescendo", decrescendo: change === "decrescendo" })} />
      <p className="learn-muted"><Volume2 size={15} aria-hidden="true" /> 편안한 기기 음량으로 들어 보세요. 막대는 소리 세기의 변화를 나타내요.</p>
    </div>
    <div className="learn-hairpin-options" role="group" aria-label="점점 바뀌는 셈여림">
      <button aria-pressed={change === "crescendo"} onClick={() => { audio.stop(); setChange("crescendo"); }}>
        <svg viewBox="0 0 120 40" aria-hidden="true"><path d="M112 5 8 20 112 35" /></svg>
        <strong>크레셴도</strong><span>점점 세게</span>
      </button>
      <button aria-pressed={change === "decrescendo"} onClick={() => { audio.stop(); setChange("decrescendo"); }}>
        <svg viewBox="0 0 120 40" aria-hidden="true"><path d="m8 5 104 15L8 35" /></svg>
        <strong>데크레셴도</strong><span>점점 여리게</span>
      </button>
    </div>
    <LabNote>mf는 메조 포르테, “조금 세게”라는 뜻이에요. 셈여림은 음악 안에서 비교하는 세기예요. mf가 언제나 같은 데시벨이나 기기 음량인 것은 아니에요.</LabNote>
  </div>;
}
