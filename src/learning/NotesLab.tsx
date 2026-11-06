import { useState } from "react";
import { NOTES, getNote, secondsForBeats, type NoteId } from "./learningModel";
import LearningScore, { NoteSymbol } from "./LearningScore";
import { BeatRail, LabNote, ListenButton } from "./LearningLabParts";
import type { LearningPlayback } from "./useLearningPlayback";

export default function NotesLab({ audio }: { audio: LearningPlayback }) {
  const [selected, setSelected] = useState<NoteId>("half");
  const [bpm, setBpm] = useState(80);
  const note = getNote(selected);
  const beatsLabel = note.beats === 0.5 ? "반 박 (½박)" : `${note.beats}박`;
  return <div className="learn-lab">
    <div className="learn-lab-intro"><h2>이 음표는 얼마나 길까요?</h2>
      <p>음표를 고르고 들어 보세요. 소리가 이어지는 동안 박자 칸이 움직여요.</p></div>
    <div className="learn-note-palette" role="group" aria-label="음표와 쉼표 선택">
      {NOTES.map((item) => <button key={item.id} aria-pressed={selected === item.id}
        onClick={() => { audio.stop(); setSelected(item.id); }}>
        <NoteSymbol id={item.id} size={43} /><strong>{item.name}</strong>
        <span>{item.beats === 0.5 ? "½" : item.beats}박</span>
      </button>)}
    </div>
    <div className="learn-demonstration">
      <div className="learn-section-top"><span className="learn-eyebrow">음표 길이 실험실</span><span>{bpm} BPM</span></div>
      <div className="learn-note-experiment">
        <div className="learn-note-spot"><NoteSymbol id={selected} size={100} /></div>
        <div><h3>{note.name} <span className="learn-beats-value">{beatsLabel}</span></h3>
          <p>{selected === "quarter-rest" ? "소리는 쉬어도 마음속 박자는 계속 가요." : "한 번 소리 내고, 이 길이만큼 이어 가요."}</p>
          <strong className="learn-time">지금 빠르기에서는 약 {secondsForBeats(note.beats, bpm).toFixed(2)}초</strong>
        </div>
      </div>
      <BeatRail total={Math.max(1, Math.ceil(note.beats))} active={audio.beat} filled={note.beats} />
      {note.beats === 0.5 && <p className="learn-muted">한 박을 똑같이 둘로 나누면 반 박이에요.</p>}
      <label className="learn-slider-label">빠르기도 바꿔 볼까요? <strong>{bpm} BPM</strong>
        <input type="range" aria-label="음표 체험 빠르기" min="60" max="120" step="10" value={bpm}
          onChange={(event) => { audio.stop(); setBpm(Number(event.target.value)); }} />
      </label>
      <ListenButton audio={audio} onPlay={() => void audio.play({ notes: [selected], bpm })}
        label={note.rest ? "쉬는 길이 느껴보기" : "이 음표 들어보기"} />
      {note.rest && <p className="learn-muted">쉼표 체험은 소리 없이 박자 표시만 움직여요.</p>}
    </div>
    <LabNote>이 놀이터에서는 4분음표를 한 박으로 세어요. 빠르기가 바뀌어도 2분음표는 2박, 4분음표는 1박이에요.</LabNote>
    <details className="learn-details"><summary>실제 악보에서는 어떻게 생겼을까요?</summary>
      <LearningScore notes={[selected]} beatsPerBar={4} activeIndex={audio.activeIndex} />
      <p>비어 있는 마디에 선택한 음표 하나만 놓아 본 모습이에요.</p>
    </details>
  </div>;
}
