import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Ear, Play, RotateCcw, Square, Star } from "lucide-react";
import type { GameResult } from "./gameProgress";
import DynamicsStage from "./DynamicsStage";
import { useDynamicsPerformance } from "./useDynamicsPerformance";
import { DYNAMICS_CHOICES, DYNAMICS_MISSIONS, MELODY, dynamicsPerformanceReward, type DynamicsMarking } from "./dynamicsPerformanceModel";
import "./DynamicsConductorGame.css";

type Purpose = "explore" | "reference" | "attempt";

export default function DynamicsConductorGame({ onExit, onComplete }: {
  onExit: () => void;
  onComplete: (result: GameResult) => void;
}) {
  const audio = useDynamicsPerformance();
  const [mode, setMode] = useState<"explore" | "mission">("explore");
  const [marking, setMarking] = useState<DynamicsMarking>("mf");
  const [purpose, setPurpose] = useState<Purpose>("explore");
  const [missionIndex, setMissionIndex] = useState(0);
  const [heardTarget, setHeardTarget] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [attempts, setAttempts] = useState<number[]>([]);
  const [currentAttempts, setCurrentAttempts] = useState(0);
  const [notice, setNotice] = useState("기호를 눌러 들어 보세요. 연주 중에도 바꿔 볼 수 있어요.");
  const [result, setResult] = useState<GameResult | null>(null);
  const changedDuringAttempt = useRef(false);
  const delivered = useRef(false);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const missionHeading = useRef<HTMLHeadingElement>(null);
  const mission = DYNAMICS_MISSIONS[missionIndex];
  const choice = DYNAMICS_CHOICES.find((item) => item.id === marking)!;

  useEffect(() => {
    (mode === "mission" ? missionHeading : heading).current?.focus({ preventScroll: true });
  }, [mode, missionIndex]);

  function choose(next: DynamicsMarking) {
    setMarking(next);
    setNotice(`${DYNAMICS_CHOICES.find((item) => item.id === next)!.description} 같은 가락으로 차이를 들어요.`);
    if (audio.playing && purpose !== "reference") {
      if (purpose === "attempt" && next !== marking) changedDuringAttempt.current = true;
      audio.setMarking(next);
    } else {
      setPurpose("explore");
      void audio.play(next);
    }
  }

  function changeMode(next: "explore" | "mission") {
    audio.stop();
    setPurpose("explore");
    setMode(next);
    setNotice(next === "explore" ? "기호를 바꾸며 같은 가락을 비교해 보세요." : "목표 연주를 끝까지 듣고, 같은 느낌으로 지휘해 보세요.");
  }

  function listenTarget() {
    setPurpose("reference");
    setNotice("기호의 이름보다 소리의 차이에 귀를 기울여요.");
    void audio.play(mission.target, () => {
      setHeardTarget(true);
      setNotice("이제 기호를 골라 연습하고, 준비되면 ‘이대로 연주하기’를 눌러요.");
    });
  }

  function perform() {
    if (!heardTarget || cleared) return;
    changedDuringAttempt.current = false;
    const selected = marking;
    const count = currentAttempts + 1;
    setPurpose("attempt");
    setNotice("내 연주를 끝까지 들어 보세요. 음높이와 빠르기는 같아요.");
    void audio.play(selected, () => {
      setCurrentAttempts(count);
      if (changedDuringAttempt.current) {
        setNotice("중간에 기호가 바뀌었어요. 원하는 기호를 고른 뒤 처음부터 연주해 보세요.");
        return;
      }
      if (selected !== mission.target) {
        setNotice(`이번에는 ${choice.name}의 느낌이었어요. 목표 연주와 다시 비교해 보세요.`);
        return;
      }
      const next = [...attempts, count];
      setAttempts(next);
      setCleared(true);
      setNotice(`${mission.title} 성공! 기호가 소리의 세기를 바꾸었어요.`);
      if (missionIndex === DYNAMICS_MISSIONS.length - 1 && !delivered.current) {
        delivered.current = true;
        const reward = dynamicsPerformanceReward(next);
        setResult(reward);
        onComplete(reward);
      }
      window.requestAnimationFrame(() => resultHeading.current?.focus({ preventScroll: true }));
    });
  }

  function nextMission() {
    audio.stop();
    setMissionIndex((index) => index + 1);
    setHeardTarget(false);
    setCleared(false);
    setCurrentAttempts(0);
    setPurpose("explore");
    setNotice("새 목표 연주를 듣고 어떤 느낌인지 찾아보세요.");
  }

  function restart() {
    audio.stop();
    setMissionIndex(0);
    setHeardTarget(false);
    setCleared(false);
    setAttempts([]);
    setCurrentAttempts(0);
    setResult(null);
    delivered.current = false;
    setNotice("새 음악회를 시작해요. 목표 연주부터 들어 보세요.");
  }

  return <main className="dynamics-game" id="learn-main" aria-label="셈여림 지휘자 게임">
    <header className="dynamics-game-top">
      <button className="learn-text-button" onClick={() => { audio.stop(); onExit(); }}><ArrowLeft size={17} /> 탐험 지도</button>
      <span>별빛 음악회</span><strong><Star size={17} /> {attempts.length} / 4 미션</strong>
      <button className="learn-text-button" data-testid="dynamics-stop-top" disabled={!audio.playing} onClick={audio.stop}><Square size={16} /> 멈추기</button>
    </header>
    <div className="dynamics-heading"><span className="learn-eyebrow">내 손으로 바꾸는 소리의 표정</span>
      <h1 ref={heading} tabIndex={-1}>셈여림 지휘자</h1><p>같은 가락, 같은 {MELODY.bpm} BPM. 기호를 바꾸면 소리의 세기가 달라져요.</p></div>
    <div className="dynamics-modes" role="group" aria-label="셈여림 게임 모드">
      <button aria-pressed={mode === "explore"} onClick={() => changeMode("explore")}>자유롭게 지휘하기</button>
      <button aria-pressed={mode === "mission"} onClick={() => changeMode("mission")}>도전! 음악회</button>
    </div>
    {mode === "mission" && <section className="dynamics-mission" aria-label="현재 음악회 미션">
      <div><span>{missionIndex + 1} / 4 미션</span><h2 ref={missionHeading} tabIndex={-1}>{mission.title}</h2><p>{mission.description}</p></div>
      <button className="learn-secondary" disabled={audio.playing && purpose === "attempt"} onClick={listenTarget}>
        <Ear size={18} /> 목표 연주 {heardTarget ? "다시 듣기" : "듣기"}</button>
    </section>}
    <DynamicsStage marking={purpose === "reference" && audio.playing ? mission.target : marking}
      playing={audio.playing} frame={audio.frame} reference={purpose === "reference" && audio.playing} />
    <section className="dynamics-palette" aria-labelledby="dynamics-choices-heading">
      <div className="dynamics-palette-heading"><h2 id="dynamics-choices-heading">어떻게 연주할까요?</h2><span>누르면 바로 들려요 · 연주 중에도 바꿀 수 있어요</span></div>
      <div className="dynamics-steady-choices" role="group" aria-label="일정한 셈여림 기호">
        {DYNAMICS_CHOICES.slice(0, 6).map((item) => <button key={item.id} aria-pressed={marking === item.id}
          data-marking={item.id} onClick={() => choose(item.id)}><strong>{item.label}</strong><span>{item.name}</span><small>{item.description}</small></button>)}
      </div>
      <div className="dynamics-changing-choices" role="group" aria-label="점점 바뀌는 셈여림 기호">
        {DYNAMICS_CHOICES.slice(6).map((item) => <button key={item.id} aria-pressed={marking === item.id}
          data-marking={item.id} onClick={() => choose(item.id)}><strong>{item.label}</strong><span>{item.name}<small>{item.description}</small></span></button>)}
      </div>
    </section>
    <div className="dynamics-transport">
      <button className="learn-secondary" onClick={() => { setPurpose("explore"); void audio.play(marking); }}><Play size={17} /> 선택한 기호로 다시 듣기</button>
      <button className="learn-secondary" disabled={!audio.playing} onClick={audio.stop}><Square size={16} /> 멈추기</button>
      {mode === "mission" && !cleared && <button className="learn-primary" disabled={!heardTarget || audio.playing} onClick={perform}>이대로 연주하기 <ArrowRight size={17} /></button>}
    </div>
    <p className="dynamics-notice" role="status">{notice}</p>
    {audio.error && <p className="learn-audio-error" role="alert">{audio.error}</p>}
    {mode === "mission" && !heardTarget && <p className="dynamics-hint">목표 연주를 끝까지 들으면 ‘이대로 연주하기’가 열려요.</p>}
    {mode === "mission" && cleared && <section className="dynamics-result" aria-label="음악회 미션 완료">
      <h2 ref={resultHeading} tabIndex={-1}>{result ? "별빛 음악회 완성!" : "멋진 지휘였어요!"}</h2>
      {result && <p><Star size={20} /> {result.stars}개 별 · {result.score}점</p>}
      <p>{DYNAMICS_CHOICES.find((item) => item.id === mission.target)!.description}</p>
      {result ? <><button className="learn-primary" onClick={() => { audio.stop(); onExit(); }}>탐험 지도로 돌아가기</button>
        <button className="learn-secondary" onClick={restart}><RotateCcw size={16} /> 다시 도전</button></>
        : <button className="learn-primary" onClick={nextMission}>다음 미션 <ArrowRight size={17} /></button>}
    </section>}
    <p className="dynamics-footnote">편안한 기기 음량으로 비교해요. 셈여림은 음악 안에서 비교하는 세기이며, 기기의 고정된 음량이나 데시벨을 뜻하지 않아요.</p>
  </main>;
}
