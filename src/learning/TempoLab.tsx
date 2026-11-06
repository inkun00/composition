import { useEffect, useState } from "react";
import { Hand, RotateCcw } from "lucide-react";
import LearningScore from "./LearningScore";
import { BeatRail, LabNote, ListenButton } from "./LearningLabParts";
import { secondsForBeats, type NoteId } from "./learningModel";
import type { LearningPlayback } from "./useLearningPlayback";

const RHYTHM: NoteId[] = ["quarter", "quarter", "quarter", "quarter"];
const TEMPOS = [{ name: "Largo", korean: "아주 느리게", bpm: 50 },
  { name: "Andante", korean: "걷는 빠르기로", bpm: 84 }, { name: "Allegro", korean: "빠르게", bpm: 132 }];

export default function TempoLab({ audio, active }: { audio: LearningPlayback; active: boolean }) {
  const [bpm, setBpm] = useState(84);
  const [taps, setTaps] = useState<number[]>([]);
  const [tapping, setTapping] = useState(false);
  const [tapResult, setTapResult] = useState("");

  useEffect(() => {
    if (!active) {
      setTaps([]);
      setTapping(false);
      setTapResult("");
    }
  }, [active]);

  function reset() {
    setTaps([]);
    setTapping(false);
    setTapResult("");
  }

  function changeTempo(value: number) {
    audio.stop();
    setBpm(value);
    reset();
  }

  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] < 100) return;
    const next = [...taps, now];
    setTaps(next);
    if (next.length < 4) return;
    const expected = 60_000 / bpm;
    const intervals = next.slice(1).map((value, index) => value - next[index]);
    const averageError = intervals.reduce((sum, interval) => sum + Math.abs(interval - expected), 0) / 3 / expected;
    const measured = Math.round(180_000 / (next[3] - next[0]));
    setTapping(false);
    setTapResult(averageError <= 0.25
      ? `일정한 박자를 잘 느꼈어요! 목표 ${bpm} BPM, 내가 누른 빠르기는 약 ${measured} BPM이에요.`
      : `내가 누른 빠르기는 약 ${measured} BPM이에요. 목표는 ${bpm} BPM! 다시 듣고 일정하게 눌러 볼까요?`);
  }

  return <div className="learn-lab">
    <div className="learn-lab-intro"><h2>같은 네 박, 다르게 걸어요</h2>
      <p>음표는 그대로인데, 빠르기를 바꾸면 어떻게 들릴까요?</p></div>
    <div className="learn-tempo-presets" role="group" aria-label="빠르기말 체험">
      {TEMPOS.map((tempo) => <button key={tempo.name} aria-pressed={bpm === tempo.bpm}
        onClick={() => changeTempo(tempo.bpm)}><strong>{tempo.name}</strong><span>{tempo.korean}</span><small>예: {tempo.bpm} BPM</small></button>)}
    </div>
    <div className="learn-demonstration">
      <div className="learn-section-top"><span className="learn-eyebrow">빠르기 실험실</span><span>4분음표 = 한 박</span></div>
      <div className="learn-tempo-readout"><strong>{bpm}<small>BPM</small></strong><p>1분에 {bpm}박<br /><b>한 박 ≈ {secondsForBeats(1, bpm).toFixed(2)}초</b></p></div>
      <label className="learn-slider-label">느리게 <span>빠르게</span>
        <input type="range" min="40" max="160" step="1" value={bpm} aria-label="빠르기 BPM"
          onChange={(event) => changeTempo(Number(event.target.value))} />
      </label>
      <LearningScore notes={RHYTHM} activeIndex={audio.activeIndex} />
      <BeatRail total={4} active={audio.beat} />
      <ListenButton audio={audio} label="네 박 들어보기" onPlay={() => { reset(); void audio.play({ notes: RHYTHM, bpm, beatsPerBar: 4 }); }} />
      <p className="learn-muted">빠르기는 박자가 흐르는 속도예요. 소리의 높이나 세기를 바꾸는 게 아니에요.</p>
    </div>
    <section className="learn-tap-game" aria-labelledby="learn-tap-title">
      <div><span className="learn-eyebrow">미니 게임</span><h3 id="learn-tap-title">내 손이 메트로놈!</h3>
        <p>위에서 먼저 듣고, 같은 간격으로 네 번 눌러 보세요.<br />터치, 클릭 또는 버튼에 초점을 두고 스페이스 키로 할 수 있어요.</p></div>
      {!tapping ? <button className="learn-secondary" onClick={() => { audio.stop(); reset(); setTapping(true); }}>
        <Hand size={18} /> {tapResult ? "다시 도전하기" : "박자 누르기 시작"}</button>
        : <button className="learn-tap-pad" onClick={tap} aria-label={`박자 누르기 ${taps.length}회 완료, 네 번 누르세요`}>
          <Hand size={28} aria-hidden="true" /><strong>{taps.length === 0 ? "여기서 시작!" : `${taps.length} / 4`}</strong>
          <span>일정한 간격으로 톡, 톡</span>
        </button>}
      <p role="status" className="learn-tap-result">{tapResult || (tapping ? "첫 번째 누르기부터 간격을 재요. 준비되면 눌러 주세요." : "점수보다, 일정한 간격을 느끼는 것이 중요해요.")}</p>
      {tapping && <button className="learn-text-button" onClick={reset}><RotateCcw size={16} /> 다시 준비하기</button>}
    </section>
    <LabNote>빠르기말은 곡의 느낌에 따라 달라질 수 있어요. 위 BPM은 비교를 위한 예시예요. BPM 숫자는 1분에 몇 박인지 구체적으로 알려 줘요.</LabNote>
  </div>;
}
