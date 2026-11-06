import type { CSSProperties } from "react";
import LearningArt from "../LearningArt";
import ScoreMeasure from "../../components/ScoreMeasure";
import { DYNAMICS_CHOICES, MELODY, type DynamicsMarking } from "./dynamicsPerformanceModel";
import type { DynamicsPerformanceFrame } from "./DynamicsPerformanceAudio";

const notes = MELODY.midi.map((pitch, index) => ({
  id: `dynamics-note-${index}`, pitch, duration: { numerator: 1, denominator: 1 }
}));

export default function DynamicsStage({ marking, playing, frame, reference }: {
  marking: DynamicsMarking;
  playing: boolean;
  frame: DynamicsPerformanceFrame;
  reference: boolean;
}) {
  const choice = DYNAMICS_CHOICES.find((item) => item.id === marking)!;
  return <section className={`dynamics-stage${playing ? " is-playing" : ""}`} aria-label="별빛 음악회 연주 무대">
    <LearningArt name="observatory" className="dynamics-backdrop" eager />
    <div className="dynamics-stage-status" role="status">
      <span>{reference ? "목표 연주" : "내가 지휘하는 연주"}</span>
      <strong>{reference ? "귀를 기울여 들어 보세요" : `${choice.label} · ${choice.name}`}</strong>
      <small>{playing ? reference ? "소리의 세기가 어떻게 달라지나요?" : choice.description : "기호를 누르면 연주가 시작돼요"}</small>
    </div>
    <LearningArt name="guide-bird" className="dynamics-conductor-bird" eager />
    <div className="dynamics-sound-meter" style={{ "--sound-level": frame.gain / .21 } as CSSProperties}>
      <label htmlFor="dynamics-live-meter">지금 들리는 소리의 세기</label>
      <meter id="dynamics-live-meter" min={0} max={.21} value={frame.gain} aria-label="연주 소리의 상대적 세기" />
      <div><span>여리게</span><span>세게</span></div>
    </div>
    <div className="dynamics-score-strip" aria-label="같은 가락 두 마디, 음높이와 빠르기는 고정">
      {[0, 1].map((bar) => <div key={bar}>
        <ScoreMeasure notes={notes.slice(bar * 4, bar * 4 + 4)} compact showSignature={bar === 0}
          playingNoteId={playing && frame.activeIndex >= 0 ? `dynamics-note-${frame.activeIndex}` : null} />
      </div>)}
    </div>
  </section>;
}
