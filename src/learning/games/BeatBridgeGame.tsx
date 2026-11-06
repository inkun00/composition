import { useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Play, RotateCcw, Square, Star, Undo2 } from "lucide-react";
import LearningScore, { NoteSymbol } from "../LearningScore";
import { getNote, totalBeats, type NoteId } from "../learningModel";
import { useLearningPlayback } from "../useLearningPlayback";
import { publicAssetUrl } from "../../platform/portable";
import { BRIDGE_LEVELS, bridgeLevelScore, bridgeStars, bridgeTileRemaining, canPlaceBridgeTile, judgeBridge } from "./bridgeGameModel";
import { useBridgeSceneMotion, useBridgeTileMotion } from "./useBridgeMotion";
import "./BeatBridgeGame.css";

type Props = { onExit: () => void; onComplete: (result: { stars: number; score: number }) => void };

function BridgeBird({ friend = false }: { friend?: boolean }) {
  return <img src={publicAssetUrl("/learning-art/guide-bird.webp")} alt="" aria-hidden="true"
    draggable={false} className={`bridge-bird-art${friend ? " is-friend" : ""}`} />;
}

function BridgePlank({ id, width, playing }: { id: NoteId; width: number; playing: boolean }) {
  const ref = useBridgeTileMotion();
  const note = getNote(id);
  return <div ref={ref} className={`bridge-plank${id === "quarter-rest" ? " is-rest" : ""}${id === "eighth" ? " is-short" : ""}${playing ? " is-playing" : ""}`}
    style={{ width: `${width}%` }}>
    <NoteSymbol id={id} size={30} /><small>{note.beats === .5 ? "½" : note.beats}박</small>
  </div>;
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
  const motion = useBridgeSceneMotion(cleared, mistakes, level.id);

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
    <div ref={motion.sceneRef} className={`bridge-scene${cleared ? " is-cleared" : ""}`} aria-label={cleared ? "친구가 다리를 건너 도착했어요" : `${level.beats}박 개울, 다리 ${beats}박 완성`}>
      <img className="bridge-landscape" src={publicAssetUrl("/learning-art/bridge-scene.webp")}
        alt="" aria-hidden="true" draggable={false} fetchPriority="high" />
      <div className="bridge-friend"><BridgeBird friend /><span>{cleared ? "고마워!" : "기다릴게!"}</span></div>
      <div ref={motion.travelerRef} className="bridge-traveler"><BridgeBird /><span>{cleared ? "야호, 도착!" : "건너갈 수 있을까?"}</span></div>
      <div className="bridge-gap-sign">{level.beats}/4박자 · {level.beats}박 개울</div>
      <div ref={motion.trackRef} className="bridge-plank-track" style={{ "--bridge-beats": level.beats } as CSSProperties}>
        {notes.map((id, index) => <BridgePlank key={`${index}-${id}`} id={id}
          width={getNote(id).beats / level.beats * 100} playing={audio.activeIndex === index} />)}
        {remaining > 0 && <div className="bridge-empty-plank" style={{ width: `${remaining / level.beats * 100}%` }}><span>{remaining}박 남음</span></div>}
      </div>
      <div className="bridge-level-flags" aria-label={`${levelIndex + (cleared ? 1 : 0)}개 다리 구조 완료`}>
        {BRIDGE_LEVELS.map((item, index) => <span key={item.id} className={index < levelIndex || (index === levelIndex && cleared) ? "complete" : ""}>
          <Star size={17} fill={index < levelIndex || (index === levelIndex && cleared) ? "currentColor" : "none"} />
        </span>)}
      </div>
    </div>
    <div className={`bridge-feedback${cleared ? " is-clear" : ""}`} role="status" aria-live="polite">
      {notice || `음표 조각을 눌러 다리를 놓아요. 현재 ${beats} / ${level.beats}박.`}
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
