import { useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Play, RotateCcw, Square, Star, Undo2 } from "lucide-react";
import LearningScore, { NoteSymbol } from "../LearningScore";
import { getNote, totalBeats, type NoteId } from "../learningModel";
import { useLearningPlayback } from "../useLearningPlayback";
import { BRIDGE_LEVELS, bridgeLevelScore, bridgeStars, bridgeTileRemaining, canPlaceBridgeTile, judgeBridge } from "./bridgeGameModel";
import "./BeatBridgeGame.css";

type Props = { onExit: () => void; onComplete: (result: { stars: number; score: number }) => void };

function BridgeBird({ friend = false }: { friend?: boolean }) {
  return <svg viewBox="0 0 88 92" aria-hidden="true" className="bridge-bird-art">
    <ellipse cx="43" cy="82" rx="26" ry="5" fill="#214f4220" />
    <path d="M32 76v9m22-9v9m-23 0h-8m31 0h8" stroke="#b76a25" strokeWidth="4" strokeLinecap="round" />
    <path d="M18 48Q13 26 31 19Q30 6 43 14Q53 4 57 21Q77 34 68 59Q60 80 38 77Q16 74 18 48" fill={friend ? "#f3aa6c" : "#f5da74"} stroke="#925f32" strokeWidth="2" />
    <path d="M21 53Q5 38 8 60Q17 73 29 62" fill={friend ? "#e98a53" : "#dcb94d"} />
    <ellipse cx="50" cy="58" rx="13" ry="16" fill="#fff8da" />
    <circle cx="38" cy="35" r="3" fill="#32453a" /><circle cx="59" cy="35" r="3" fill="#32453a" />
    <path d="m45 42 11 2-7 7Z" fill="#e18a31" />
    <circle cx="30" cy="43" r="5" fill="#f6a28b" opacity=".7" /><circle cx="66" cy="43" r="5" fill="#f6a28b" opacity=".7" />
    <path d="M27 24Q47 16 66 25" stroke="#17675b" strokeWidth="8" strokeLinecap="round" />
    <path d="M44 19v-6" stroke="#17675b" strokeWidth="5" strokeLinecap="round" />
  </svg>;
}

export default function BeatBridgeGame({ onExit, onComplete }: Props) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [notes, setNotes] = useState<NoteId[]>([]);
  const [cleared, setCleared] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [score, setScore] = useState(0);
  const [notice, setNotice] = useState("");
  const completionReported = useRef(false);
  const audio = useLearningPlayback();
  const level = BRIDGE_LEVELS[levelIndex];
  const beats = totalBeats(notes);
  const final = levelIndex === BRIDGE_LEVELS.length - 1;
  const remaining = level.beats - beats;

  function mistake(message: string) {
    setNotice(message);
    setMistakes((value) => value + 1);
    setTotalMistakes((value) => value + 1);
  }

  function add(id: NoteId) {
    if (cleared) return;
    audio.stop();
    if (!canPlaceBridgeTile(level, notes, id)) {
      mistake(`${getNote(id).name}는 ${getNote(id).beats === 0.5 ? "반" : getNote(id).beats} 박이에요. 남은 ${remaining}박과 조각 수를 확인해 주세요.`);
      return;
    }
    setNotes([...notes, id]);
    setNotice("");
  }

  function cross() {
    if (cleared) return;
    audio.stop();
    const result = judgeBridge(level, notes);
    if (!result.correct) { mistake(result.message); return; }
    setNotice(result.message);
    setCleared(true);
    const nextScore = score + bridgeLevelScore(mistakes);
    setScore(nextScore);
    if (final && !completionReported.current) {
      completionReported.current = true;
      onComplete({ score: nextScore, stars: bridgeStars(totalMistakes) });
    }
  }

  function next() {
    audio.stop();
    setLevelIndex((value) => value + 1);
    setNotes([]);
    setCleared(false);
    setMistakes(0);
    setNotice("");
  }

  function restart() {
    audio.stop();
    setLevelIndex(0);
    setNotes([]);
    setCleared(false);
    setMistakes(0);
    setTotalMistakes(0);
    setScore(0);
    setNotice("");
    completionReported.current = false;
  }

  return <section className="bridge-game" aria-label="음표 다리 구조대 게임">
    <header className="bridge-game-header">
      <button className="bridge-back" onClick={() => { audio.stop(); onExit(); }}><ArrowLeft size={17} /> 탐험 지도</button>
      <div><span>음표 다리 구조대</span><strong>{levelIndex + 1} / {BRIDGE_LEVELS.length} 다리</strong></div>
      <span className="bridge-score"><Star size={18} fill="currentColor" /> {score}점</span>
    </header>
    <div className="bridge-mission"><span className="bridge-mission-number">MISSION 0{levelIndex + 1}</span>
      <h1>{level.title}</h1><p>{level.mission}</p></div>
    <div className={`bridge-scene${cleared ? " is-cleared" : ""}`} aria-label={cleared ? "친구가 다리를 건너 도착했어요" : `${level.beats}박 개울, 다리 ${beats}박 완성`}>
      <svg className="bridge-landscape" viewBox="0 0 900 320" preserveAspectRatio="none" aria-hidden="true">
        <rect width="900" height="320" fill="#dff2ef" />
        <circle cx="760" cy="54" r="31" fill="#f8dd86" />
        <path d="M0 130Q100 55 240 145T480 140T720 120T900 130V320H0Z" fill="#bbd7b2" />
        <path d="M0 190Q110 90 260 200T500 190T760 180T900 150V320H0Z" fill="#8fbf9c" />
        <path d="M280 320 355 145H553L650 320Z" fill="#72c9cc" />
        <path d="M320 270q80-30 140 0t135 0M350 210q60-20 110 0t100 0M390 170q50-13 90 0" fill="none" stroke="#b5e7df" strokeWidth="5" strokeLinecap="round" />
        <path d="M0 204Q115 180 288 212L265 320H0ZM900 204Q780 180 611 212L639 320H900Z" fill="#638b55" />
        <path d="M0 200Q115 178 288 208L279 226Q131 202 0 225ZM900 200Q780 178 611 208L621 225Q771 202 900 225Z" fill="#b8d778" />
        <path d="M80 69q18-22 42-9q26-14 41 11q23 1 25 15H62q1-14 18-17ZM520 35q17-20 36-6q27-11 35 10q21 0 24 14H500q0-12 20-18Z" fill="#fffdf0" opacity=".9" />
      </svg>
      <div className="bridge-friend"><BridgeBird friend /><span>{cleared ? "고마워!" : "기다릴게!"}</span></div>
      <div className="bridge-traveler"><BridgeBird /><span>{cleared ? "야호, 도착!" : "건너갈 수 있을까?"}</span></div>
      <div className="bridge-gap-sign">{level.beats}/4박자 · {level.beats}박 개울</div>
      <div className="bridge-plank-track" style={{ "--bridge-beats": level.beats } as CSSProperties}>
        {notes.map((id, index) => <div key={`${index}-${id}`} className={`bridge-plank${id === "quarter-rest" ? " is-rest" : ""}${audio.activeIndex === index ? " is-playing" : ""}`}
          style={{ width: `${getNote(id).beats / level.beats * 100}%` }}>
          <NoteSymbol id={id} size={30} /><small>{getNote(id).beats === 0.5 ? "½" : getNote(id).beats}박</small>
        </div>)}
        {remaining > 0 && <div className="bridge-empty-plank" style={{ width: `${remaining / level.beats * 100}%` }}><span>{remaining}박 남음</span></div>}
      </div>
      <div className="bridge-level-flags" aria-label={`${levelIndex + (cleared ? 1 : 0)}개 다리 구조 완료`}>
        {BRIDGE_LEVELS.map((item, index) => <span key={item.id} className={index < levelIndex || (index === levelIndex && cleared) ? "complete" : ""}>
          <Star size={17} fill={index < levelIndex || (index === levelIndex && cleared) ? "currentColor" : "none"} />
        </span>)}
      </div>
    </div>
    <div className={`bridge-feedback${cleared ? " is-clear" : ""}`} role="status" aria-live="polite">
      {notice || `아래 음표 조각을 눌러 다리를 놓아요. 현재 ${beats} / ${level.beats}박.`}
    </div>
    {cleared ? <div className="bridge-clear-panel">
      <div className="bridge-earned-stars" aria-label={`${bridgeStars(final ? totalMistakes : mistakes)}개 별`}>
        {[0, 1, 2].map((index) => <Star key={index} size={32} fill={index < bridgeStars(final ? totalMistakes : mistakes) ? "currentColor" : "none"} />)}
      </div>
      <h2>{final ? "다섯 친구 모두 구조했어요!" : `친구 구조 성공! +${bridgeLevelScore(mistakes)}점`}</h2>
      <p>{level.fact}</p>
      <div>{final ? <><button className="bridge-primary" onClick={onExit}>탐험 지도로 돌아가기 <ArrowRight size={18} /></button>
        <button className="bridge-light-button" onClick={restart}><RotateCcw size={17} /> 새 기록 도전</button></>
        : <button className="bridge-primary" onClick={next}>다음 친구 구하기 <ArrowRight size={18} /></button>}</div>
    </div> : <div className="bridge-build-panel">
      <div className="bridge-inventory-heading"><h2>내 다리 조각</h2><span>4분음표 = 한 박</span></div>
      <div className="bridge-inventory" role="group" aria-label="다리에 놓을 음표 조각">
        {(Object.keys(level.inventory) as NoteId[]).map((id) => {
          const count = bridgeTileRemaining(level, notes, id);
          return <button key={id} disabled={count === 0} className={count === 0 ? "used" : ""}
            aria-label={`${getNote(id).name} 조각 놓기, ${count}개 남음`} onClick={() => add(id)}>
            <span className="bridge-piece-count">×{count}</span><NoteSymbol id={id} size={43} />
            <strong>{getNote(id).name}</strong><small>{getNote(id).beats === 0.5 ? "반" : getNote(id).beats} 박 조각</small>
          </button>;
        })}
      </div>
      <div className="bridge-controls">
        <button className="bridge-primary" onClick={cross}>다리 건너기 <ArrowRight size={18} /></button>
        <button className="bridge-light-button" disabled={!notes.length} onClick={() => { audio.stop(); setNotes(notes.slice(0, -1)); setNotice(""); }}><Undo2 size={17} /> 하나 빼기</button>
        <button className="bridge-light-button" disabled={!notes.length} onClick={() => { audio.stop(); setNotes([]); setNotice(""); }}><RotateCcw size={17} /> 다시 놓기</button>
      </div>
    </div>}
    <details className="bridge-score-details"><summary>내 다리를 소리와 악보로 확인하기</summary>
      <LearningScore notes={notes} beatsPerBar={level.beats} activeIndex={audio.activeIndex} />
      <button className="bridge-light-button" disabled={!notes.length} onClick={() => audio.playing ? audio.stop() : void audio.play({ notes, bpm: 90, beatsPerBar: level.beats })}>
        {audio.playing ? <Square size={17} /> : <Play size={17} />}{audio.playing ? "멈추기" : "다리 리듬 듣기"}</button>
      <p>짧은 딱 소리는 박을 짚어 줘요. 쉼표에서는 가락 소리를 쉬어요.</p>
    </details>
    {audio.error && <p className="bridge-audio-error" role="alert">{audio.error}</p>}
  </section>;
}
