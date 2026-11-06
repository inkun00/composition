import { useState } from "react";
import { Check, Undo2, RotateCcw } from "lucide-react";
import { NOTES, getNote, measureFeedback, totalBeats, type NoteId } from "./learningModel";
import LearningScore, { NoteSymbol } from "./LearningScore";
import { BeatRail, LabNote, ListenButton } from "./LearningLabParts";
import type { LearningPlayback } from "./useLearningPlayback";

export default function MeterLab({ audio }: { audio: LearningPlayback }) {
  const [meter, setMeter] = useState(2);
  const [notes, setNotes] = useState<NoteId[]>([]);
  const [notice, setNotice] = useState("");
  const sum = totalBeats(notes);
  const result = measureFeedback(notes, meter);

  function add(id: NoteId) {
    audio.stop();
    if (sum + getNote(id).beats > meter) {
      setNotice(`${getNote(id).name}를 넣으면 한 마디의 ${meter}박을 넘어요. 더 짧은 음표를 골라 볼까요?`);
      return;
    }
    setNotice("");
    setNotes([...notes, id]);
  }

  return <div className="learn-lab">
    <div className="learn-lab-intro"><h2>박자 주머니를 딱 맞게 채워요</h2>
      <p>음표를 눌러 한 마디를 완성해 보세요. 음표의 개수보다 박자의 합이 중요해요.</p></div>
    <div className="learn-meter-controls" role="group" aria-label="박자표 선택">
      {[2, 3, 4].map((value) => <button key={value} aria-pressed={meter === value}
        onClick={() => { audio.stop(); setMeter(value); setNotes([]); setNotice(""); }}>
        <span className="learn-time-signature" aria-hidden="true"><b>{value}</b><b>4</b></span>
        <span>{value}/4박자</span>
      </button>)}
    </div>
    <div className="learn-meter-explainer"><span className="learn-time-signature" aria-hidden="true"><b>{meter}</b><b>4</b></span>
      <div><strong>아래의 4 → 4분음표가 한 박</strong><p>위의 {meter} → 한 마디에 {meter}박씩 모아요.</p></div>
    </div>
    <div className="learn-demonstration">
      <div className="learn-section-top"><span className="learn-eyebrow">한 마디 채우기</span><strong>{sum} / {meter}박</strong></div>
      <LearningScore notes={notes} beatsPerBar={meter} activeIndex={audio.activeIndex} />
      <div className="learn-measure-slots" aria-label="넣은 음표">
        {notes.length === 0 ? <p>아래에서 음표를 눌러 넣어 주세요.</p> : notes.map((id, index) => (
          <span key={`${index}-${id}`} className={audio.activeIndex === index ? "active" : ""}>
            <NoteSymbol id={id} size={27} /><small>{getNote(id).beats === 0.5 ? "½" : getNote(id).beats}박</small>
          </span>
        ))}
      </div>
      <BeatRail total={meter} filled={sum} active={audio.beat} />
      <p className={`learn-meter-feedback ${result.state === "exact" ? "success" : ""}`} role="status">
        {result.state === "exact" && <Check size={19} />} {notice || result.message}
      </p>
      <div className="learn-note-palette compact" role="group" aria-label="마디에 음표 넣기">
        {NOTES.map((note) => <button key={note.id} onClick={() => add(note.id)}
          aria-label={`${note.name} 넣기, ${note.beats === 0.5 ? "반" : note.beats} 박`}>
          <NoteSymbol id={note.id} size={33} /><strong>{note.name}</strong><span>{note.beats === 0.5 ? "½" : note.beats}박</span>
        </button>)}
      </div>
      <div className="learn-player-row">
        <ListenButton audio={audio} disabled={notes.length === 0} label="내 마디 들어보기"
          onPlay={() => void audio.play({ notes, bpm: 84, beatsPerBar: meter })} />
        <button className="learn-secondary" disabled={notes.length === 0}
          onClick={() => { audio.stop(); setNotes(notes.slice(0, -1)); setNotice(""); }}><Undo2 size={16} /> 하나 빼기</button>
        <button className="learn-text-button" disabled={notes.length === 0}
          onClick={() => { audio.stop(); setNotes([]); setNotice(""); }}><RotateCcw size={16} /> 비우기</button>
      </div>
    </div>
    <LabNote>2/4박자는 음표를 두 개만 넣으라는 뜻이 아니에요. 2분음표 하나도, 4분음표 둘도, 8분음표 넷도 2박을 채워요. 재생할 때 짧은 딱 소리는 박을 짚어 줘요.</LabNote>
  </div>;
}
