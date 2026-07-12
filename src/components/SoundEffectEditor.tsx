import { useMemo, useRef, useState } from "react";
import { previewSoundEffect } from "../audio/soundEffects";
import { findSoundEffect, SOUND_EFFECTS, type SoundEffectCategory, type SoundEffectId } from "../music/soundEffects";
import type { SoundEffectEvent } from "../music/types";

type SoundEffectEditorProps = Readonly<{
  measureIndex: number;
  capacity: number;
  events: readonly SoundEffectEvent[];
  onAdd: (effectId: SoundEffectId) => void;
  onMove: (eventId: string, offsetBeats: number) => void;
  onRemove: (eventId: string) => void;
}>;

export default function SoundEffectEditor({
  measureIndex, capacity, events, onAdd, onMove, onRemove
}: SoundEffectEditorProps) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const draggingId = useRef<string | null>(null);
  const [category, setCategory] = useState<SoundEffectCategory | "all">("all");
  const filteredEffects = useMemo(() =>
    category === "all" ? SOUND_EFFECTS : SOUND_EFFECTS.filter((effect) => effect.category === category),
  [category]);
  const categories: readonly { id: SoundEffectCategory | "all"; label: string }[] = [
    { id: "all", label: `전체 ${SOUND_EFFECTS.length}개` },
    { id: "nature", label: "자연" },
    { id: "animal", label: "동물" },
    { id: "home", label: "집" },
    { id: "school", label: "학교" },
    { id: "city", label: "도시" },
    { id: "body", label: "몸짓" },
    { id: "weather", label: "날씨" },
    { id: "magic", label: "마법" },
    { id: "vehicle", label: "탈것" },
    { id: "percussion", label: "타악기" }
  ];

  const moveFromPointer = (event: React.PointerEvent, eventId: string) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const trackPadding = Math.min(26, rect.width * 0.1);
    const ratio = Math.max(0, Math.min(1,
      (event.clientX - rect.left - trackPadding) / Math.max(1, rect.width - trackPadding * 2)));
    const snapped = Math.round(ratio * capacity * 4) / 4;
    onMove(eventId, Math.min(capacity - 0.01, snapped));
  };

  return (
    <section className="sound-effect-editor" aria-labelledby="sound-effect-heading">
      <div className="sound-effect-heading">
        <div><span className="section-kicker">소리 추가</span><h2 id="sound-effect-heading">{measureIndex + 1}마디에 짧은 소리를 놓아요</h2></div>
        <p>아이콘을 누른 뒤, 아래 선에서 좌우로 끌어 재생 시간을 정해요.</p>
      </div>
      <label className="sound-effect-filter">
        <span>소리 종류</span>
        <select value={category} onChange={(event) => setCategory(event.target.value as SoundEffectCategory | "all")}>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <div className="sound-effect-palette">
        {filteredEffects.map((effect) => (
          <button key={effect.id} type="button" data-testid={`add-effect-${effect.id}`}
            title={effect.description} onClick={() => { onAdd(effect.id); void previewSoundEffect(effect.id); }}>
            <span>{effect.icon}</span><strong>{effect.name}</strong>
          </button>
        ))}
      </div>
      <div className="sound-effect-timeline" ref={timelineRef} data-testid="sound-effect-timeline">
        <div className="sound-effect-beats" aria-hidden="true">
          {Array.from({ length: Math.ceil(capacity) + 1 }, (_, index) => <i key={index} />)}
        </div>
        {events.map((event) => {
          const effect = findSoundEffect(event.effectId);
          return (
            <div key={event.id} className="placed-sound-effect"
              style={{ left: `calc(26px + (100% - 52px) * ${event.offsetBeats / capacity})` }}>
              <button type="button" className="effect-drag-handle"
                data-testid={`effect-${event.id}`} aria-label={`${effect.name}, ${event.offsetBeats + 1}박 위치`}
                onPointerDown={(pointerEvent) => {
                  draggingId.current = event.id;
                  pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
                  moveFromPointer(pointerEvent, event.id);
                }}
                onPointerMove={(pointerEvent) => {
                  if (draggingId.current === event.id) moveFromPointer(pointerEvent, event.id);
                }}
                onPointerUp={(pointerEvent) => {
                  if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
                    pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
                  }
                  draggingId.current = null;
                }}>
                <span>{effect.icon}</span><small>{event.offsetBeats.toFixed(2).replace(/\.00$/, "")}박</small>
              </button>
              <button type="button" className="effect-remove" aria-label={`${effect.name} 지우기`}
                onClick={() => onRemove(event.id)}>×</button>
            </div>
          );
        })}
        {events.length === 0 && <span className="effect-empty">아직 놓은 소리가 없어요.</span>}
      </div>
    </section>
  );
}
