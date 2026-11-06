import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, RotateCcw, Sparkles, Star, Volume2, VolumeX } from "lucide-react";
import MusicSymbol from "../MusicSymbol";
import { NoteSymbol } from "../LearningScore";
import { useLearningPlayback } from "../useLearningPlayback";
import GameStars from "./GameStars";
import { createMemoryDeck, MEMORY_STAGES, memoryReward, memoryStars, type MemoryCard } from "./memoryGameModel";
import type { GameResult } from "./gameProgress";
import "./MemoryConstellationGame.css";

export default function MemoryConstellationGame({ onExit, onComplete }: {
  onExit: () => void; onComplete: (result: GameResult) => void;
}) {
  const [stage, setStage] = useState(0);
  const [deck, setDeck] = useState(() => createMemoryDeck(0));
  const [flipped, setFlipped] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [combo, setCombo] = useState(0);
  const [moves, setMoves] = useState(0);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState("카드 두 장을 뒤집어 기호와 뜻을 만나게 해 주세요.");
  const [complete, setComplete] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const audio = useLearningPlayback();
  const current = MEMORY_STAGES[stage];
  const cleared = matched.length === current.items.length;
  const mismatch = flipped.length === 2;

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [stage]);
  useEffect(() => {
    if (!cleared) return;
    resultHeading.current?.focus({ preventScroll: true });
    resultHeading.current?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  }, [cleared]);

  function flip(card: MemoryCard) {
    if (cleared || mismatch || flipped.includes(card.key) || matched.includes(card.item.id)) return;
    audio.stop();
    const next = [...flipped, card.key];
    setFlipped(next);
    if (next.length !== 2) { setNotice("잘 기억해 두세요. 이제 다른 카드 한 장을 골라요!"); return; }
    setMoves((value) => value + 1);
    const previous = deck.find((item) => item.key === next[0])!;
    if (previous.item.id !== card.item.id) {
      setMistakes((value) => value + 1);
      setCombo(0);
      setNotice(`다른 짝이네요! ${card.item.label}의 뜻은 ‘${card.item.meaning}’예요. 위치를 기억해 보세요.`);
      return;
    }
    const nextMatched = [...matched, card.item.id];
    const nextScore = score + memoryReward(combo + 1);
    setMatched(nextMatched);
    setFlipped([]);
    setCombo((value) => value + 1);
    setScore(nextScore);
    setNotice(`별 하나 반짝! ${card.item.label} = ${card.item.meaning}. ${combo + 1}연속 발견!`);
    if (!muted) void audio.play({ notes: card.item.note ? [card.item.note] : ["eighth", "eighth"],
      bpm: 110, dynamic: card.item.dynamic ?? "mp" });
    if (nextMatched.length === current.items.length && stage === MEMORY_STAGES.length - 1) {
      setComplete(true);
      onComplete({ stars: memoryStars(mistakes), score: nextScore });
    }
  }

  function nextStage() {
    audio.stop();
    setStage(stage + 1);
    setDeck(createMemoryDeck(stage + 1));
    setMatched([]);
    setFlipped([]);
    setNotice("새 별자리가 나타났어요. 같은 짝을 찾아 주세요!");
  }

  return <main className="memory-game" id="learn-main">
    <header className="music-game-top"><button className="learn-secondary" onClick={onExit}><ArrowLeft size={17} /> 탐험 지도</button>
      <span>별자리 {stage + 1} / 3</span><strong><Star size={18} /> {score.toLocaleString()}점</strong></header>
    <div className="memory-heading"><p className="game-kicker">MISSION 03 · 기억의 관측소</p>
      <h1 ref={heading} tabIndex={-1}>기호 별자리 맞추기</h1><p>{current.tip}</p></div>
    <section className="memory-sky" aria-label={`${current.name}, ${matched.length}개 별 발견`}>
      <svg className="memory-constellation" viewBox="0 0 800 150" aria-hidden="true">
        <path d="M70 110 200 35 340 90 470 28 610 80 740 40" fill="none" stroke="#8191c5" strokeWidth="2" strokeDasharray="5 9" />
        {current.items.map((item, index) => <g key={item.id} className={matched.includes(item.id) ? "lit" : ""}
          transform={`translate(${70 + index * (670 / Math.max(1, current.items.length - 1))}, ${index % 2 ? 40 : 100})`}>
          <circle r="20" /><path d="m0-13 4 9 10 1-8 7 3 10-9-5-9 5 3-10-8-7 10-1Z" />
        </g>)}
      </svg>
      <div className="memory-sky-caption"><strong>{current.name}</strong><span>{matched.length} / {current.items.length}개 별이 깨어났어요</span></div>
    </section>
    <div className="memory-round-stats"><span><Eye size={16} /> {moves}번 뒤집기</span><span><Sparkles size={16} /> {combo}콤보</span>
      <button aria-pressed={muted} onClick={() => { audio.stop(); setMuted(!muted); }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{muted ? "소리 켜기" : "소리 끄기"}</button></div>
    <div className={`memory-deck count-${deck.length}`} role="group" aria-label="기억 카드">
      {deck.map((card, index) => {
        const found = matched.includes(card.item.id);
        const open = found || flipped.includes(card.key);
        return <button key={card.key} className={`memory-card ${open ? "face-up" : "face-down"}${found ? " matched" : ""}`}
          data-pair={card.item.id} data-side={card.side} aria-pressed={open}
          aria-label={open ? `${card.side === "sign" ? card.item.label : card.item.meaning}${found ? ", 짝 완성" : ""}` : `뒷면 카드 ${index + 1}`}
          disabled={found || mismatch || cleared} onClick={() => flip(card)}>
          {!open ? <><span className="memory-card-number">{index + 1}</span><Star size={33} aria-hidden="true" /><span>뒤집기</span></>
            : card.side === "meaning" ? <><span className="memory-card-type">뜻 카드</span><strong className="memory-meaning">{card.item.meaning}</strong></>
              : <><span className="memory-card-type">기호 카드</span>
                {card.item.dynamic && <strong className="memory-dynamic">{card.item.dynamic}</strong>}
                {card.item.note && <NoteSymbol id={card.item.note} size={54} />}
                {card.item.symbol && <MusicSymbol id={card.item.symbol} size={65} />}
                <span className="memory-sign-label">{card.item.label}</span></>}
          {found && <Check className="memory-found-check" size={17} aria-hidden="true" />}
        </button>;
      })}
    </div>
    <p className="memory-notice" role="status">{notice}</p>
    {mismatch && <button className="learn-primary memory-retry" onClick={() => { setFlipped([]); setNotice("위치를 기억하고, 다른 짝을 찾아볼까요?"); }}><RotateCcw size={18} /> 기억했어요, 다시 뒤집기</button>}
    {cleared && <section className="memory-clear" aria-label="별자리 완성">
      <Sparkles size={32} /><h2 ref={resultHeading} tabIndex={-1}>{complete ? "모든 별자리를 밝혔어요!" : "별자리 완성!"}</h2>
      <GameStars count={memoryStars(mistakes)} size={28} /><p>{complete ? `총 ${score.toLocaleString()}점! 음악 기호와 뜻이 친구가 되었어요.` : "기억한 카드가 모여 밤하늘을 밝혔어요."}</p>
      <button className="learn-primary" onClick={complete ? onExit : nextStage}>{complete ? "탐험 지도 돌아가기" : "다음 별자리로"}<ArrowRight size={18} /></button>
    </section>}
    {audio.error && <p className="learn-audio-error" role="alert">{audio.error}</p>}
    <p className="memory-footnote">시간 제한은 없어요. 틀려도 카드를 기억하면 다음 기회에 별을 찾을 수 있어요.</p>
  </main>;
}
