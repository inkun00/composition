import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Hand, Play, RotateCcw, Square, Star, Volume2 } from "lucide-react";
import { NoteSymbol } from "../LearningScore";
import { getNote } from "../learningModel";
import { TRAIN_BPM, TRAIN_ROUNDS, judgeTrainTap, trainResult, trainTimeline, type TrainHit, type TrainResult } from "./rhythmTrainModel";
import { TrainAudio } from "./trainAudio";
import "./RhythmTrainGame.css";

type Phase = "ready" | "loading" | "demo" | "countin" | "playing" | "result";
type Props = { onExit: () => void; onComplete: (result: { stars: number; score: number }) => void };

function TrainEngine({ glow }: { glow: boolean }) {
  return <svg viewBox="0 0 160 100" aria-hidden="true" className={glow ? "train-engine lit" : "train-engine"}>
    <path d="M11 71h137l-8 12H8Z" fill="#263d55" />
    <rect x="38" y="26" width="82" height="49" rx="12" fill="#ed8f52" />
    <path d="M93 15h37l9 14H88Z" fill="#3f7971" />
    <rect x="94" y="27" width="37" height="47" rx="6" fill="#4d998e" />
    <rect x="102" y="33" width="22" height="22" rx="4" fill="#d9f1df" />
    <rect x="34" y="15" width="17" height="25" rx="4" fill="#425a65" />
    <ellipse cx="22" cy="57" rx="14" ry="16" fill="#ffc966" />
    <circle className="train-headlight" cx="18" cy="53" r="8" fill="#fff4b5" />
    <path d="M9 14c-9-7 7-17 15-9 14-6 22 7 11 13-10 6-17-4-26-4" fill="#f5f0d6" />
    {[43, 87, 121].map((x) => <g key={x}><circle cx={x} cy="80" r="13" fill="#2e4a55" /><circle cx={x} cy="80" r="6" fill="#f4dc91" /></g>)}
    <path d="M43 80h78" stroke="#d0dbc9" strokeWidth="4" strokeLinecap="round" />
  </svg>;
}

export default function RhythmTrainGame({ onExit, onComplete }: Props) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [beat, setBeat] = useState(-4);
  const [heard, setHeard] = useState(false);
  const [gentle, setGentle] = useState(true);
  const [hits, setHits] = useState<TrainHit[]>([]);
  const [extras, setExtras] = useState(0);
  const [combo, setCombo] = useState(0);
  const [feedback, setFeedback] = useState("먼저 리듬을 듣고, 열차를 출발시켜 주세요!");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState<TrainResult[]>([]);
  const [expeditionComplete, setExpeditionComplete] = useState<{ stars: number; score: number } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pad = useRef<HTMLButtonElement>(null);
  const audio = useRef<TrainAudio | null>(null);
  const animation = useRef(0);
  const generation = useRef(0);
  const phaseRef = useRef<Phase>("ready");
  const origin = useRef(0);
  const hitsRef = useRef<TrainHit[]>([]);
  const extrasRef = useRef(0);
  const comboRef = useRef(0);
  const delivered = useRef(false);
  const round = TRAIN_ROUNDS[roundIndex];
  const cues = trainTimeline(round.notes);
  const targetCount = cues.filter((cue) => !cue.rest).length;
  const result = trainResult(cues, hits, extras);
  const active = phase === "demo" || phase === "countin" || phase === "playing" || phase === "loading";

  useEffect(() => {
    heading.current?.focus();
  }, [roundIndex, expeditionComplete]);

  function updatePhase(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function halt(message?: string) {
    generation.current++;
    cancelAnimationFrame(animation.current);
    audio.current?.stop();
    updatePhase("ready");
    setBeat(-4);
    if (message) setFeedback(message);
  }

  useEffect(() => {
    const hidden = () => {
      if (document.hidden && ["demo", "countin", "playing", "loading"].includes(phaseRef.current)) {
        halt("잠깐 쉬었어요. 준비되면 다시 출발해 주세요.");
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      generation.current++;
      cancelAnimationFrame(animation.current);
      audio.current?.dispose();
      audio.current = null;
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  function tap() {
    if (phaseRef.current !== "playing") return;
    const elapsedMs = performance.now() - origin.current;
    if (elapsedMs < 0) return;
    const hit = judgeTrainTap(cues, elapsedMs, TRAIN_BPM, gentle ? 240 : 150, hitsRef.current);
    audio.current?.tap();
    if (hit) {
      hitsRef.current = [...hitsRef.current, hit];
      setHits(hitsRef.current);
      comboRef.current++;
      setCombo(comboRef.current);
      setFeedback(hit.quality === "perfect" ? "딱 맞았어요! 반짝, 열차에 불이 켜졌어요." : hit.offsetMs < 0
        ? "잘했어요! 조금 빠르게 눌렀어요." : "잘했어요! 조금 늦게 눌렀어요.");
    } else {
      extrasRef.current++;
      setExtras(extrasRef.current);
      comboRef.current = 0;
      setCombo(0);
      setFeedback("잠깐! 음표가 빛나는 선에 닿을 때 눌러요. 쉼표에서는 기다려요.");
    }
  }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select, a, [contenteditable='true']")) return;
      if (target instanceof HTMLButtonElement && target !== pad.current && !target.disabled) return;
      if (phaseRef.current !== "playing") {
        if (target === pad.current) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (event.repeat) return;
      tap();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  async function start(demo: boolean) {
    halt();
    const current = generation.current;
    hitsRef.current = [];
    extrasRef.current = 0;
    comboRef.current = 0;
    setHits([]);
    setExtras(0);
    setCombo(0);
    setError("");
    updatePhase("loading");
    try {
      audio.current ??= new TrainAudio();
      const schedule = await audio.current.start(round.notes, TRAIN_BPM, demo);
      if (!schedule || current !== generation.current) return;
      origin.current = schedule.playAt;
      updatePhase(demo ? "demo" : "countin");
      setFeedback(demo ? "열차 소리를 들어 보세요. 음표가 시작할 때 ‘딴’!" : "하나, 둘, 셋, 넷! 준비 박을 센 뒤 시작해요.");
      if (!demo) pad.current?.focus({ preventScroll: true });
      let lastPaint = 0;
      function frame(now: number) {
        if (current !== generation.current) return;
        const currentBeat = (now - schedule!.playAt) / (60_000 / TRAIN_BPM);
        if (!demo && currentBeat >= 0 && phaseRef.current === "countin") {
          updatePhase("playing");
          setFeedback("출발! 음표가 선에 닿을 때 톡!");
        }
        if (now - lastPaint >= 30) {
          lastPaint = now;
          setBeat(currentBeat);
        }
        const finish = schedule!.endAt + (demo ? 40 : 260);
        if (now >= finish) {
          audio.current?.stop();
          if (demo) {
            setHeard(true);
            setBeat(-4);
            updatePhase("ready");
            setFeedback("잘 들었나요? 이제 ‘열차 출발!’을 누르고 직접 연주해 보세요.");
          } else {
            updatePhase("result");
            setFeedback("역에 도착했어요! 어떤 음표를 잘 맞혔는지 볼까요?");
          }
          return;
        }
        animation.current = requestAnimationFrame(frame);
      }
      animation.current = requestAnimationFrame(frame);
    } catch {
      if (current !== generation.current) return;
      halt();
      setError("소리를 시작하지 못했어요. 기기의 소리 설정을 확인하고 다시 들어 주세요.");
    }
  }

  function next() {
    if (!result.hits) return;
    if (roundIndex === TRAIN_ROUNDS.length - 1) {
      if (delivered.current) return;
      delivered.current = true;
      const all = [...accepted, result];
      const accuracy = all.reduce((sum, item) => sum + item.accuracy, 0) / all.length;
      const reward = { score: all.reduce((sum, item) => sum + item.score, 0), stars: accuracy >= 0.9 ? 3 : accuracy >= 0.6 ? 2 : 1 };
      setExpeditionComplete(reward);
      onComplete(reward);
      return;
    }
    halt();
    setAccepted([...accepted, result]);
    setRoundIndex(roundIndex + 1);
    setHeard(false);
    setHits([]);
    setExtras(0);
    setFeedback("새로운 역이에요. 이번 리듬을 먼저 들어 보세요!");
  }

  function restartExpedition() {
    halt();
    delivered.current = false;
    setExpeditionComplete(null);
    setAccepted([]);
    setRoundIndex(0);
    setHeard(false);
    setHits([]);
    setExtras(0);
    setCombo(0);
    setFeedback("새로운 여행을 시작해요. 먼저 리듬을 들어 보세요!");
  }

  if (expeditionComplete) return <main id="learn-main" className="rhythm-train-game train-expedition-complete" aria-label="리듬 열차 탐험 완료">
    <div className="train-complete-medal" aria-hidden="true"><TrainEngine glow /></div>
    <p className="train-complete-eyebrow">세 개의 역, 모두 도착!</p>
    <h1 ref={heading} tabIndex={-1}>리듬 열차 탐험 완료!</h1>
    <div className="train-result-stars" aria-label={`탐험 별 ${expeditionComplete.stars}개 획득`}>{[1, 2, 3].map((value) =>
      <Star key={value} size={42} fill={value <= expeditionComplete.stars ? "currentColor" : "none"} />)}</div>
    <strong className="train-complete-score">총 {expeditionComplete.score}점</strong>
    <p>내 손으로 박자를 만들고, 쉼표도 기다렸어요.<br />리듬 기관사 탐험 도장을 받았어요!</p>
    <div className="train-result-actions">
      <button className="train-primary" onClick={onExit}>탐험 지도로 돌아가기 <ArrowRight size={17} /></button>
      <button className="train-secondary" onClick={restartExpedition}><RotateCcw size={17} /> 처음부터 다시 달리기</button>
    </div>
  </main>;

  return <main id="learn-main" className="rhythm-train-game" aria-label="리듬 열차 게임">
    <div className="train-game-top"><button onClick={() => { halt(); onExit(); }} className="train-back"><ArrowLeft size={17} /> 게임 지도</button>
      <span className="train-stage-label">리듬 열차 · {roundIndex + 1} / {TRAIN_ROUNDS.length}역</span>
      <span className="train-score"><Star size={16} /> {accepted.reduce((sum, item) => sum + item.score, 0) + result.score}점</span></div>
    <div className="train-heading"><p>박자를 맞춰, 반짝 열차에 불을 켜 주세요!</p><h1 ref={heading} tabIndex={-1}>{round.title}</h1><span>{round.mission}</span></div>
    <div className="train-controls"><div className="train-difficulty" role="group" aria-label="리듬 판정 난이도">
      <button disabled={active} aria-pressed={gentle} onClick={() => setGentle(true)}>느긋하게</button>
      <button disabled={active} aria-pressed={!gentle} onClick={() => setGentle(false)}>정확하게</button>
    </div><span>♩ = {TRAIN_BPM} · 4/4박자</span></div>
    <div className={`train-scene phase-${phase}`}>
      <div className="train-sky-stars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <div className="train-mountain back" aria-hidden="true" /><div className="train-mountain front" aria-hidden="true" />
      <div className="train-destination"><span>다음 역</span><strong>{roundIndex + 1}</strong></div>
      <div className="train-light-row" aria-label={`${targetCount}개 도착등 중 ${hits.length}개 켜짐`}>
        {Array.from({ length: targetCount }, (_, index) => <span key={index} className={index < hits.length ? "on" : ""}><Star size={16} /></span>)}
      </div>
      <div className="train-world-engine" style={{ "--train-progress": `${Math.min(65, hits.length / targetCount * 65)}%` } as CSSProperties}>
        <TrainEngine glow={hits.length > 0} />
      </div>
      <div className="train-world-track" aria-hidden="true" />
      {phase === "countin" && <div className="train-countdown"><span>준비 박</span><strong>{Math.max(1, Math.min(4, Math.floor(beat + 4) + 1))}</strong><small>아직 누르지 않고 기다려요</small></div>}
      {phase === "ready" && <div className="train-scene-invitation"><span>리듬으로 달리는 열차</span><strong>{heard ? "이제 기관사가 되어 볼까요?" : "귀를 기울이면 길이 보여요"}</strong></div>}
      <div className="train-rhythm-lane" aria-hidden="true">
        <div className="train-hit-line"><span>여기서 톡!</span></div>
        {cues.map((cue) => {
          const hit = hits.some((item) => item.index === cue.index);
          const missed = !cue.rest && !hit && beat > cue.beat + (gentle ? 240 : 150) / 750 && phase !== "demo";
          const isCurrent = active && beat >= 0 && Math.abs(cue.beat - beat) <= 0.2;
          const x = active && phase !== "loading" ? 22 + (cue.beat - beat) * 17 : 27 + cue.beat * 17;
          return <div key={cue.index} className={`train-moving-note${cue.rest ? " rest" : ""}${hit ? " hit" : ""}${missed ? " missed" : ""}${isCurrent ? " is-current" : ""}`}
            style={{ left: `${x}%`, "--static-note-position": `${27 + cue.beat * 17}%` } as CSSProperties}><NoteSymbol id={cue.id} size={32} /><small>{cue.rest ? "쉼!" : getNote(cue.id).beats === 0.5 ? "½박" : `${cue.duration}박`}</small>
          </div>;
        })}
      </div>
      <div className="train-beat-lights" aria-label="진행 박 표시">{[0, 1, 2, 3].map((value) => <span key={value}
        className={active && beat >= 0 && Math.floor(beat) % 4 === value ? "active" : ""}>{value + 1}</span>)}</div>
    </div>
    <div className="train-live-feedback" role="status" aria-live="polite"><span>{feedback}</span>{combo > 1 && <strong>{combo} 콤보!</strong>}</div>
    {phase === "result" ? <div className="train-round-result">
      <div className="train-result-stars" aria-label={`${result.stars}개 별`}>{[1, 2, 3].map((value) => <Star key={value} size={33} fill={value <= result.stars ? "currentColor" : "none"} />)}</div>
      <h2>{result.hits === result.total && !result.extras ? "모든 도착등이 반짝!" : result.hits ? "음악을 타고 한 역 도착!" : "한 번 더 연습해 볼까요?"}</h2>
      <p>음표 {result.total}개 중 {result.hits}개 성공 · 추가로 누름 {result.extras}번 · {result.score}점</p>
      <div className="train-result-notes">{cues.map((cue) => <span key={cue.index} className={cue.rest ? "rest" : hits.some((hit) => hit.index === cue.index) ? "hit" : "missed"}>
        <NoteSymbol id={cue.id} size={28} /><small>{cue.rest ? "쉬는 박" : hits.some((hit) => hit.index === cue.index) ? "성공" : "다시 연습"}</small></span>)}</div>
      <div className="train-result-actions"><button className="train-secondary" onClick={() => void start(false)}><RotateCcw size={17} /> 다시 달리기</button>
        <button className="train-primary" disabled={!result.hits} onClick={next}>{roundIndex === TRAIN_ROUNDS.length - 1 ? "탐험 도장 받기" : "다음 역으로"}<ArrowRight size={17} /></button></div>
    </div> : <>
      <button ref={pad} className={`train-tap-pad${phase === "playing" ? " enabled" : ""}`} aria-disabled={phase !== "playing"}
        onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); pad.current?.focus({ preventScroll: true }); tap(); } }}
        onClick={(event) => { if (event.detail === 0) tap(); }}
        onKeyDown={(event) => { if (event.key === "Enter" && event.repeat) event.preventDefault(); }}
        aria-label="리듬 두드리기. 스페이스 키 또는 터치로 음표가 선에 닿을 때 누르세요">
        <Hand size={28} aria-hidden="true" /><strong>{phase === "playing" ? "톡! 눌러요" : phase === "countin" ? "준비 박을 세어요" : "내 손으로 열차를 움직여요"}</strong><span>터치 · 클릭 · 스페이스 키</span>
      </button>
      <div className="train-action-row"><button className="train-secondary" disabled={active} onClick={() => void start(true)}><Volume2 size={17} /> {heard ? "리듬 다시 듣기" : "리듬 먼저 듣기"}</button>
        {active ? <button className="train-secondary" onClick={() => halt("멈췄어요. 준비되면 다시 출발해요.")}><Square size={16} /> 멈추기</button>
          : <button className="train-primary" disabled={!heard} onClick={() => void start(false)}><Play size={17} /> 열차 출발!</button>}
      </div>
    </>}
    {error && <p className="train-audio-error" role="alert">{error}</p>}
    <details className="train-help"><summary>어떻게 하는 게임인가요?</summary><p>① 리듬을 먼저 들어요. ② 출발을 누르고 준비 박 네 번을 기다려요. ③ 음표가 빛나는 선에 닿으면 한 번 눌러요. 긴 음표는 여러 번 누르지 않아요. 쉼표에서는 기다려요.</p><p>이 게임에서는 4분음표가 한 박이에요. 잘못 눌러도 다시 달릴 수 있어요. 소리가 지연되거나 처음이면 ‘느긋하게’ 모드로 해 보세요.</p></details>
  </main>;
}
