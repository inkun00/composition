import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import type { Meter } from "../music/meter";
import type { SoundEffectId } from "../music/soundEffects";
import type { NoteEvent, SoundEffectEvent } from "../music/types";
import NoteLyrics from "./NoteLyrics";
import ScoreMeasure from "./ScoreMeasure";
import SoundEffectEditor from "./SoundEffectEditor";
import "./MeasureSoundEffectDialog.css";

type Props = Readonly<{
  measureIndex: number;
  notes: readonly NoteEvent[];
  meter: Meter;
  capacity: number;
  events: readonly SoundEffectEvent[];
  playing: boolean;
  onPlay: () => void;
  onAdd: (effectId: SoundEffectId) => void;
  onMove: (eventId: string, offsetBeats: number) => void;
  onRemove: (eventId: string) => void;
  onClose: () => void;
}>;

export default function MeasureSoundEffectDialog({
  measureIndex, notes, meter, capacity, events, playing, onPlay, onAdd, onMove, onRemove, onClose
}: Props) {
  const [notePositions, setNotePositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="measure-sound-overlay" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="measure-sound-dialog" role="dialog" aria-modal="true"
        aria-labelledby="measure-sound-title">
        <header className="measure-sound-header">
          <div>
            <span>🎬 마디에 장면 소리 넣기</span>
            <h2 id="measure-sound-title">{measureIndex + 1}마디의 어느 박자에 소리를 놓을까요?</h2>
            <p>소리를 고른 뒤 아래 박자선에서 좌우로 끌어 위치를 바꿔 보세요.</p>
          </div>
          <div className="measure-sound-header-actions">
            <button type="button" className="measure-sound-play" onClick={onPlay}>
              <Play size={15} fill="currentColor" /> {playing ? "듣는 중" : "이 마디 듣기"}
            </button>
            <button type="button" className="measure-sound-close" aria-label="소리 추가 창 닫기"
              onClick={onClose}><X size={22} /></button>
          </div>
        </header>

        <div className="measure-sound-score">
          <ScoreMeasure notes={notes} meter={meter} playingNoteId={null}
            onNoteLayout={setNotePositions} />
          <div className="measure-sound-lyrics">
            <strong>이 마디 가사</strong>
            <NoteLyrics notes={notes} meter={meter} measureIndex={measureIndex}
              notePositions={notePositions} readOnly onChange={() => undefined} />
          </div>
        </div>

        <SoundEffectEditor measureIndex={measureIndex} capacity={capacity} events={events}
          compact onAdd={onAdd} onMove={onMove} onRemove={onRemove} />

        <footer>
          <span>{events.length === 0 ? "아직 넣은 소리가 없어요." : `${events.length}개의 소리를 넣었어요.`}</span>
          <button type="button" onClick={onClose}>완료</button>
        </footer>
      </section>
    </div>
  );
}
