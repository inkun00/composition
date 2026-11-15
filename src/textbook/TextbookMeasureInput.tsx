import { useId, useState } from "react";
import { Eraser, Plus, Undo2 } from "lucide-react";
import { NoteSymbol } from "../learning/LearningScore";
import type { NoteId } from "../learning/learningModel";
import { add, compare, rational, sum, toNumber, type Rational } from "../music/rational";
import { pitchName } from "../music/score";
import type { NoteEvent } from "../music/types";
import { publicAssetUrl } from "../platform/portable";
import { TEXTBOOK_PITCHES } from "./textbookScore";
import "./TextbookMeasureInput.css";

type Props = {
  index: number;
  notes: readonly NoteEvent[];
  disabled: boolean;
  onChange: (notes: NoteEvent[]) => void;
};

type LengthChoice = {
  id: string;
  label: string;
  symbol: NoteId | "half-rest";
  duration: Rational;
  dotted?: boolean;
  rest?: boolean;
};

const LENGTHS: readonly LengthChoice[] = [
  { id: "eighth", label: "8분음표", symbol: "eighth", duration: rational(1, 2) },
  { id: "quarter", label: "4분음표", symbol: "quarter", duration: rational(1) },
  { id: "dotted-quarter", label: "점4분음표", symbol: "quarter", duration: rational(3, 2), dotted: true },
  { id: "half", label: "2분음표", symbol: "half", duration: rational(2) },
  { id: "whole", label: "온음표", symbol: "whole", duration: rational(4) },
  { id: "quarter-rest", label: "4분쉼표", symbol: "quarter-rest", duration: rational(1), rest: true },
  { id: "half-rest", label: "2분쉼표", symbol: "half-rest", duration: rational(2), rest: true }
];

const CAPACITY = rational(4);

function pitchLabel(pitch: number) {
  return pitch === 72 ? `높은 ${pitchName(pitch)}` : pitchName(pitch);
}

function beatLabel(beats: number) {
  return beats === .5 ? "반 박" : `${beats}박`;
}

export default function TextbookMeasureInput({ index, notes, disabled, onChange }: Props) {
  const controlId = useId();
  const [pitch, setPitch] = useState<number>(60);
  const [lengthId, setLengthId] = useState("quarter");
  const selected = LENGTHS.find((item) => item.id === lengthId)!;
  const used = sum(notes.map((note) => note.duration));
  const usedBeats = toNumber(used);
  const remaining = Math.max(0, 4 - usedBeats);
  const full = compare(used, CAPACITY) === 0;
  const over = compare(used, CAPACITY) > 0;
  const fits = compare(add(used, selected.duration), CAPACITY) <= 0;
  const selectionLabel = selected.rest ? selected.label : `${pitchLabel(pitch)} · ${selected.label}`;
  const measureNumber = index + 5;
  const status = over ? `${beatLabel(usedBeats - 4)} 넘었어요. 마지막 음표를 빼 주세요.`
    : full ? "4박을 모두 채웠어요!" : `${beatLabel(remaining)} 더 넣을 수 있어요.`;

  function append() {
    if (disabled || !fits) return;
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID() : `textbook-note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const note: NoteEvent = {
      id,
      pitch: selected.rest ? null : pitch,
      duration: selected.duration,
      ...(selected.dotted ? { dotted: true } : {})
    };
    onChange([...notes, note]);
  }

  return <section className="textbook-measure-input" aria-labelledby={`${controlId}-heading`}>
    <div className="textbook-input-heading">
      <h3 id={`${controlId}-heading`}>{measureNumber}마디 음표 넣기</h3>
      <span className={`textbook-input-count${full ? " is-full" : ""}${over ? " is-over" : ""}`}>
        {usedBeats} / 4박
      </span>
    </div>
    <div className="textbook-input-beats" role="progressbar" aria-label={`${measureNumber}마디 채운 박`}
      aria-valuemin={0} aria-valuemax={4} aria-valuenow={Math.min(4, Math.max(0, usedBeats))}
      aria-valuetext={`${usedBeats}박 입력, ${status}`}>
      {[0, 1, 2, 3].map((beat) => <span key={beat} aria-hidden="true">
        <i style={{ width: `${Math.min(1, Math.max(0, usedBeats - beat)) * 100}%` }} />
      </span>)}
    </div>
    <p className="textbook-input-instruction" id={`${controlId}-instruction`}>
      길이와 음높이를 고르고 ‘넣기’를 눌러요.
    </p>
    <fieldset className="textbook-input-fieldset" disabled={disabled}>
      <legend><span aria-hidden="true">1</span> 음표 길이</legend>
      <div className="textbook-input-lengths">
        {LENGTHS.map((item) => {
          const tooLong = compare(add(used, item.duration), CAPACITY) > 0;
          return <button key={item.id} type="button" className="textbook-input-option"
            data-duration={item.id} aria-pressed={lengthId === item.id} disabled={tooLong}
            aria-label={`${item.label}, ${beatLabel(toNumber(item.duration))}`}
            onClick={() => setLengthId(item.id)}>
            <span className="textbook-input-length" title={tooLong ? "남은 박보다 길어요" : undefined}>
              <span className="textbook-input-symbol" aria-hidden="true">
                {item.symbol === "half-rest"
                  ? <img src={publicAssetUrl("/notation/rests/half.png")} alt="" />
                  : <NoteSymbol id={item.symbol} size={29} />}
                {item.dotted && <span className="textbook-input-dot">·</span>}
              </span>
              <strong>{item.label}</strong><small>{beatLabel(toNumber(item.duration))}</small>
            </span>
          </button>;
        })}
      </div>
    </fieldset>
    <fieldset className="textbook-input-fieldset" disabled={disabled || selected.rest}>
      <legend><span aria-hidden="true">2</span> 음높이 <small>{selected.rest ? "쉼표는 음높이가 없어요" : "도에서 높은 도까지"}</small></legend>
      <div className="textbook-input-pitches">
        {TEXTBOOK_PITCHES.map((value) => <button key={value} type="button" className="textbook-input-option"
          data-pitch={value} aria-pressed={pitch === value} aria-label={pitchLabel(value)}
          onClick={() => setPitch(value)}>
          <span className="textbook-input-pitch">{value === 72 ? <><small>높은</small>도</> : pitchLabel(value)}</span>
        </button>)}
      </div>
    </fieldset>
    <div className="textbook-input-actions">
      <button className="textbook-input-add" type="button" disabled={disabled || !fits}
        data-testid="textbook-add-note"
        aria-describedby={`${controlId}-status ${controlId}-instruction`} onClick={append}>
        <Plus size={17} aria-hidden="true" />{full ? "이 마디 완성" : `${selectionLabel} 넣기`}
      </button>
      <div className="textbook-input-edit-actions">
        <button type="button" disabled={disabled || !notes.length}
          onClick={() => onChange(notes.slice(0, -1))} aria-label={`${measureNumber}마디 마지막 음표 빼기`}>
          <Undo2 size={16} aria-hidden="true" />하나 빼기
        </button>
        <button type="button" disabled={disabled || !notes.length}
          onClick={() => onChange([])} aria-label={`${measureNumber}마디 모두 비우기`}>
          <Eraser size={16} aria-hidden="true" />마디 비우기
        </button>
      </div>
    </div>
    <p className={`textbook-input-status${over ? " is-over" : ""}`} id={`${controlId}-status`} role="status">
      {status}{!disabled && !fits && !full && !over ? " 더 짧은 음표를 골라 주세요." : ""}
    </p>
  </section>;
}
