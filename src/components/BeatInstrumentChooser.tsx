import { useEffect, useRef, useState } from "react";
import { Drum, Music2, Plus, Trash2, Volume2 } from "lucide-react";
import { previewBeatPattern, stopBeatPreview } from "../audio/drumGroove";
import { createEditableRockBeatPattern } from "../audio/animeRockArrangement";
import {
  BEAT_PATTERN_MEASURES,
  MAX_BEAT_PATTERN_INSTRUMENTS,
  beatPatternInstrumentIds,
  beatPatternSlotOffset,
  beatPatternStep,
  beatPatternSubdivision,
  normalizeBeatPattern,
  type BeatPatternEvent,
  type BeatPatternSubdivision
} from "../music/beatPattern";
import {
  BEAT_INSTRUMENTS,
  MAX_BEAT_VOLUME,
  findBeatInstrument,
  type BeatInstrumentId,
  type BeatInstrumentRole
} from "../music/beatInstruments";
import type { Meter } from "../music/meter";
import PlayIcon from "./PlayIcon";
import "./BeatInstrumentChooser.css";
import "./BeatInstrumentChooserPreset.css";

type BeatInstrumentChooserProps = Readonly<{
  events: readonly BeatPatternEvent[];
  meter: Meter;
  bpm: number;
  volume: number;
  disabled: boolean;
  playing: boolean;
  onChange: (events: BeatPatternEvent[]) => void;
  onVolumeChange: (value: number) => void;
  onPlayingChange: (playing: boolean) => void;
}>;

const roles: readonly Readonly<{ id: BeatInstrumentRole; title: string }>[] = [
  { id: "low", title: "낮은 쿵" },
  { id: "middle", title: "가운데 짝" },
  { id: "high", title: "잔박자 찰찰" }
];

const defaultTrackInstruments: readonly BeatInstrumentId[] = ["kick", "snare", "hihat"];
let nextEventId = 1;

function initialTrackInstruments(events: readonly BeatPatternEvent[], meter: Meter): BeatInstrumentId[] {
  const used = beatPatternInstrumentIds(normalizeBeatPattern(events, meter))
    .slice(0, MAX_BEAT_PATTERN_INSTRUMENTS);
  return used.length > 0 ? used : [defaultTrackInstruments[0]];
}

function initialTrackSubdivisions(
  events: readonly BeatPatternEvent[],
  meter: Meter,
  instrumentIds: readonly BeatInstrumentId[]
): BeatPatternSubdivision[][] {
  return instrumentIds.map((instrumentId) =>
    Array.from({ length: BEAT_PATTERN_MEASURES }, (_, measureIndex) =>
      beatPatternSubdivision(events, instrumentId, meter, measureIndex)));
}

function slotPositionLabel(slotIndex: number, subdivision: BeatPatternSubdivision): string {
  const beatNumber = Math.floor(slotIndex / subdivision) + 1;
  const part = slotIndex % subdivision;
  if (subdivision === 1 || part === 0) return `${beatNumber}번째 박자`;
  if (subdivision === 2) return `${beatNumber}번째 박자의 뒤쪽 1/2`;
  return `${beatNumber}번째 박자의 ${part + 1}/4 지점`;
}

export default function BeatInstrumentChooser({
  events,
  meter,
  bpm,
  volume,
  disabled,
  playing,
  onChange,
  onVolumeChange,
  onPlayingChange
}: BeatInstrumentChooserProps) {
  const previewEndTimer = useRef<number | null>(null);
  const [trackInstrumentIds, setTrackInstrumentIds] = useState<BeatInstrumentId[]>(() =>
    initialTrackInstruments(events, meter));
  const [trackSubdivisions, setTrackSubdivisions] = useState<BeatPatternSubdivision[][]>(() => {
    const instrumentIds = initialTrackInstruments(events, meter);
    return initialTrackSubdivisions(events, meter, instrumentIds);
  });
  const [activeTrackIndex, setActiveTrackIndex] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const normalizedEvents = normalizeBeatPattern(events, meter);
  const activeInstrumentId = trackInstrumentIds[activeTrackIndex] ?? trackInstrumentIds[0] ?? "kick";
  const activeInstrument = findBeatInstrument(activeInstrumentId);

  useEffect(() => () => {
    if (previewEndTimer.current !== null) window.clearTimeout(previewEndTimer.current);
    void stopBeatPreview();
  }, []);

  useEffect(() => {
    const instrumentIds = initialTrackInstruments(events, meter);
    setTrackInstrumentIds(instrumentIds);
    setTrackSubdivisions(initialTrackSubdivisions(events, meter, instrumentIds));
    setActiveTrackIndex(0);
    setSelectedEventId(null);
    // The meter changes only when a new beat grid is required.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meter.beats, meter.beatUnit]);

  async function stopPreview() {
    if (previewEndTimer.current !== null) window.clearTimeout(previewEndTimer.current);
    previewEndTimer.current = null;
    await stopBeatPreview();
    onPlayingChange(false);
  }

  async function selectTrack(index: number) {
    await stopPreview();
    setActiveTrackIndex(index);
  }

  async function chooseInstrument(instrumentId: BeatInstrumentId) {
    if (instrumentId === activeInstrumentId ||
      trackInstrumentIds.some((id, index) => index !== activeTrackIndex && id === instrumentId)) return;
    await stopPreview();
    const nextTracks = [...trackInstrumentIds];
    nextTracks[activeTrackIndex] = instrumentId;
    setTrackInstrumentIds(nextTracks);
    onChange(normalizeBeatPattern(normalizedEvents.map((event) =>
      event.instrumentId === activeInstrumentId ? { ...event, instrumentId } : event), meter));
  }

  async function addInstrumentTrack() {
    if (trackInstrumentIds.length >= MAX_BEAT_PATTERN_INSTRUMENTS) return;
    await stopPreview();
    const nextInstrument = [...defaultTrackInstruments, ...BEAT_INSTRUMENTS.map((instrument) => instrument.id)]
      .find((instrumentId) => !trackInstrumentIds.includes(instrumentId));
    if (!nextInstrument) return;
    setTrackInstrumentIds((current) => [...current, nextInstrument]);
    setTrackSubdivisions((current) => [
      ...current,
      Array.from({ length: BEAT_PATTERN_MEASURES }, () => 1 as BeatPatternSubdivision)
    ]);
    setActiveTrackIndex(trackInstrumentIds.length);
    setSelectedEventId(null);
  }

  async function applyRockDrumPreset() {
    await stopPreview();
    const rockEvents = normalizeBeatPattern(createEditableRockBeatPattern(meter), meter);
    const rockInstruments: BeatInstrumentId[] = ["kick", "snare", "hihat"];
    setTrackInstrumentIds(rockInstruments);
    setTrackSubdivisions(initialTrackSubdivisions(rockEvents, meter, rockInstruments));
    setActiveTrackIndex(0);
    setSelectedEventId(null);
    onChange(rockEvents);
  }

  async function removeInstrumentTrack(index: number) {
    if (trackInstrumentIds.length <= 1) return;
    await stopPreview();
    const removedInstrumentId = trackInstrumentIds[index];
    const nextTracks = trackInstrumentIds.filter((_, trackIndex) => trackIndex !== index);
    setTrackInstrumentIds(nextTracks);
    setTrackSubdivisions((current) => current.filter((_, trackIndex) => trackIndex !== index));
    setActiveTrackIndex((current) => {
      if (current > index) return current - 1;
      if (current === index) return Math.min(index, nextTracks.length - 1);
      return current;
    });
    onChange(normalizedEvents.filter((event) => event.instrumentId !== removedInstrumentId));
    if (normalizedEvents.some((event) => event.id === selectedEventId &&
      event.instrumentId === removedInstrumentId)) setSelectedEventId(null);
  }

  async function toggleSlot(trackIndex: number, measureIndex: number, slotIndex: number) {
    await stopPreview();
    setActiveTrackIndex(trackIndex);
    const instrumentId = trackInstrumentIds[trackIndex];
    if (!instrumentId) return;
    const subdivision = trackSubdivisions[trackIndex]?.[measureIndex] ?? 1;
    const offsetBeats = beatPatternSlotOffset(meter, slotIndex, subdivision);
    const existing = normalizedEvents.find((event) =>
      event.instrumentId === instrumentId &&
      event.measureIndex === measureIndex && event.offsetBeats === offsetBeats);
    if (existing) {
      setSelectedEventId(null);
      onChange(normalizeBeatPattern(
        normalizedEvents.filter((event) => event.id !== existing.id),
        meter
      ));
      return;
    }
    const newEvent: BeatPatternEvent = {
      id: `beat-${Date.now()}-${nextEventId++}`,
      instrumentId,
      measureIndex,
      offsetBeats
    };
    setSelectedEventId(newEvent.id);
    onChange(normalizeBeatPattern([...normalizedEvents, newEvent], meter));
  }

  async function clearTrackPattern(trackIndex: number) {
    await stopPreview();
    setActiveTrackIndex(trackIndex);
    const instrumentId = trackInstrumentIds[trackIndex];
    onChange(normalizedEvents.filter((event) => event.instrumentId !== instrumentId));
    if (normalizedEvents.some((event) => event.id === selectedEventId &&
      event.instrumentId === instrumentId)) setSelectedEventId(null);
  }

  async function halveMeasureBeats(trackIndex: number, measureIndex: number) {
    const current = trackSubdivisions[trackIndex]?.[measureIndex] ?? 1;
    if (current >= 4) return;
    await stopPreview();
    setActiveTrackIndex(trackIndex);
    setSelectedEventId(null);
    setTrackSubdivisions((subdivisions) => subdivisions.map((measures, index) =>
      index === trackIndex ? measures.map((value, indexInTrack) =>
        indexInTrack === measureIndex ? (value * 2) as BeatPatternSubdivision : value) : measures));
  }

  async function doubleMeasureBeats(trackIndex: number, measureIndex: number) {
    const current = trackSubdivisions[trackIndex]?.[measureIndex] ?? 1;
    if (current <= 1) return;
    await stopPreview();
    setActiveTrackIndex(trackIndex);
    setSelectedEventId(null);
    const nextSubdivision = (current / 2) as BeatPatternSubdivision;
    const instrumentId = trackInstrumentIds[trackIndex];
    const nextStep = beatPatternStep(meter) / nextSubdivision;
    const coarsened = normalizedEvents.map((event) =>
      event.instrumentId === instrumentId && event.measureIndex === measureIndex ? {
      ...event,
      offsetBeats: Math.floor((event.offsetBeats + .0001) / nextStep) * nextStep
    } : event);
    setTrackSubdivisions((subdivisions) => subdivisions.map((measures, index) =>
      index === trackIndex ? measures.map((value, indexInTrack) =>
        indexInTrack === measureIndex ? nextSubdivision : value) : measures));
    onChange(normalizeBeatPattern(coarsened, meter));
  }

  async function deleteSelectedEvent(trackIndex: number, measureIndex: number) {
    const instrumentId = trackInstrumentIds[trackIndex];
    const selected = normalizedEvents.find((event) =>
      event.id === selectedEventId && event.instrumentId === instrumentId &&
      event.measureIndex === measureIndex);
    if (!selected) return;
    await stopPreview();
    setActiveTrackIndex(trackIndex);
    setSelectedEventId(null);
    onChange(normalizedEvents.filter((event) => event.id !== selected.id));
  }

  async function togglePreview() {
    if (playing) {
      await stopPreview();
      return;
    }
    const duration = await previewBeatPattern(meter, normalizedEvents, bpm, volume);
    if (duration <= 0) return;
    onPlayingChange(true);
    previewEndTimer.current = window.setTimeout(() => {
      previewEndTimer.current = null;
      onPlayingChange(false);
    }, duration * 1000);
  }

  return (
    <section className="beat-instrument-chooser" aria-labelledby="beat-instrument-heading">
      <div className="beat-instrument-heading">
        <div className="beat-instrument-title">
          <span className="beat-instrument-icon"><Music2 size={20} aria-hidden="true" /></span>
          <div>
            <small>비트를 직접 만들어요</small>
            <h3 id="beat-instrument-heading">악기마다 네 마디 비트를 쌓아 보세요</h3>
            <p>첫 악기의 박자를 만든 뒤 악기를 추가하면 최대 세 악기까지 함께 연주할 수 있어요.</p>
          </div>
        </div>
        <div className="beat-event-count" aria-live="polite">
          <span>겹친 악기</span>
          <strong>{trackInstrumentIds.length} / {MAX_BEAT_PATTERN_INSTRUMENTS}</strong>
          <small>놓은 소리 {normalizedEvents.length}개</small>
        </div>
      </div>

      <div className="beat-preset-picker" aria-label="기본 비트 추가">
        <div>
          <strong>기본 비트 추가</strong>
          <span>여러 드럼 소리를 한 번에 넣을 수 있어요.</span>
        </div>
        <button type="button" className="beat-rock-preset" data-testid="beat-rock-preset"
          disabled={disabled} onClick={() => void applyRockDrumPreset()}>
          <Drum size={22} aria-hidden="true" />
          <span><strong>록 드럼</strong><small>큰통(킥)·작은북(스네어)·하이햇</small></span>
          <em>한 번에 넣기</em>
        </button>
      </div>

      <div className="beat-track-picker">
        <div className="beat-track-picker-heading">
          <div>
            <strong>1. 편집할 악기 줄을 골라요</strong>
            <span>각 악기는 저마다 다른 네 마디 박자를 가질 수 있어요.</span>
          </div>
          <button type="button" className="beat-add-track" data-testid="beat-add-instrument"
            disabled={disabled || trackInstrumentIds.length >= MAX_BEAT_PATTERN_INSTRUMENTS}
            onClick={() => void addInstrumentTrack()}>
            <Plus size={16} aria-hidden="true" />
            {trackInstrumentIds.length >= MAX_BEAT_PATTERN_INSTRUMENTS ? "악기 3개 모두 사용 중" : "악기 추가"}
          </button>
        </div>
        <div className="beat-track-tabs" role="tablist" aria-label="중첩 비트 악기">
          {trackInstrumentIds.map((instrumentId, index) => {
            const instrument = findBeatInstrument(instrumentId);
            const trackEventCount = normalizedEvents.filter((event) => event.instrumentId === instrumentId).length;
            const active = activeTrackIndex === index;
            return (
              <article className={`beat-track-tab${active ? " active" : ""}`} key={`${instrumentId}-${index}`}>
                <button type="button" role="tab" aria-selected={active}
                  data-testid={`beat-track-${index}`} disabled={disabled}
                  onClick={() => void selectTrack(index)}>
                  <span>{instrument.icon}</span>
                  <span><small>{index + 1}번 악기</small><strong>{instrument.name}</strong></span>
                  <em>{trackEventCount}개</em>
                </button>
                {trackInstrumentIds.length > 1 && (
                  <button type="button" className="beat-remove-track"
                    data-testid={`beat-remove-track-${index}`}
                    disabled={disabled}
                    aria-label={`${index + 1}번 ${instrument.name} 비트 악기 빼기`}
                    onClick={() => void removeInstrumentTrack(index)}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <div className="beat-palette">
        <div className="beat-palette-heading">
          <strong>{activeTrackIndex + 1}번 악기로 쓸 소리를 골라요</strong>
          <span>{activeInstrument.icon} 지금은 <b>{activeInstrument.name}</b></span>
        </div>
        <div className="beat-role-groups">
          {roles.map((role) => (
            <fieldset className="beat-role-group" key={role.id}>
              <legend>{role.title}</legend>
              <div className="beat-instrument-options">
                {BEAT_INSTRUMENTS.filter((instrument) => instrument.role === role.id).map((instrument) => {
                  const active = activeInstrumentId === instrument.id;
                  const usedByAnotherTrack = trackInstrumentIds.some((id, index) =>
                    index !== activeTrackIndex && id === instrument.id);
                  return (
                    <button key={instrument.id} type="button"
                      data-testid={`beat-instrument-${instrument.id}`}
                      className={active ? "active" : ""}
                      aria-pressed={active}
                      disabled={disabled || usedByAnotherTrack}
                      title={usedByAnotherTrack ? "다른 악기 줄에서 이미 사용하고 있어요." : instrument.description}
                      onClick={() => void chooseInstrument(instrument.id)}>
                      <span>{instrument.icon}</span>
                      <strong>{instrument.name}</strong>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      <div className="beat-pattern-section-heading">
        <strong>2. 중첩된 비트를 위아래로 보며 편집해요</strong>
        <span>빈 칸은 눌러 소리를 넣고, 소리가 든 칸은 다시 눌러 지워요.</span>
      </div>
      <div className="beat-pattern-stack">
        {trackInstrumentIds.map((instrumentId, trackIndex) => {
          const instrument = findBeatInstrument(instrumentId);
          const trackEvents = normalizedEvents.filter((event) => event.instrumentId === instrumentId);
          const active = activeTrackIndex === trackIndex;
          return (
            <section className={`beat-pattern-editor beat-pattern-track-editor${active ? " active" : ""}`}
              key={`${instrumentId}-${trackIndex}`}
              aria-label={`${trackIndex + 1}번 ${instrument.name} 4마디 비트`}>
              <div className="beat-pattern-heading">
                <div className="beat-pattern-track-summary">
                  <span aria-hidden="true">{instrument.icon}</span>
                  <span>
                    <strong>{trackIndex + 1}번 · {instrument.name}의 4마디</strong>
                    <small>{trackEvents.length}개 소리{active ? " · 악기 선택 중" : ""}</small>
                  </span>
                </div>
                <button type="button" className="beat-clear-track"
                  disabled={disabled || trackEvents.length === 0}
                  onClick={() => void clearTrackPattern(trackIndex)}>
                  <Trash2 size={13} aria-hidden="true" /> 이 줄 비우기
                </button>
              </div>
              <div className="beat-measure-grid">
                {Array.from({ length: BEAT_PATTERN_MEASURES }, (_, measureIndex) => {
                  const subdivision = trackSubdivisions[trackIndex]?.[measureIndex] ?? 1;
                  const slotsPerMeasure = meter.beats * subdivision;
                  const selectedMeasureEvent = trackEvents.find((event) =>
                    event.id === selectedEventId && event.measureIndex === measureIndex);
                  return (
                  <section className="beat-pattern-measure" key={measureIndex}>
                    <header className="beat-measure-header">
                      <strong>{measureIndex + 1}마디</strong>
                      <div className="beat-measure-controls"
                        aria-label={`${instrument.name} ${measureIndex + 1}마디 박자 길이 조절`}>
                        <span>{subdivision === 1 ? "1박자" : `1/${subdivision}박자`}</span>
                        <button type="button" data-testid={`beat-half-${trackIndex}-${measureIndex}`}
                          disabled={disabled || subdivision >= 4}
                          title="이 마디의 박자 칸을 절반으로 나눠요."
                          onClick={() => void halveMeasureBeats(trackIndex, measureIndex)}>1/2</button>
                        <button type="button" data-testid={`beat-double-${trackIndex}-${measureIndex}`}
                          disabled={disabled || subdivision <= 1}
                          title="이 마디의 박자 칸을 두 배 길이로 합쳐요."
                          onClick={() => void doubleMeasureBeats(trackIndex, measureIndex)}>2배</button>
                        <button type="button" className="beat-delete-event"
                          data-testid={`beat-delete-${trackIndex}-${measureIndex}`}
                          disabled={disabled || !selectedMeasureEvent}
                          title="이 마디에서 선택한 비트 소리를 지워요."
                          onClick={() => void deleteSelectedEvent(trackIndex, measureIndex)}>
                          삭제
                        </button>
                      </div>
                    </header>
                    <div className={`beat-slot-grid subdivision-${subdivision}`}
                      style={{ gridTemplateColumns: `repeat(${slotsPerMeasure}, minmax(0, 1fr))` }}>
                      {Array.from({ length: slotsPerMeasure }, (_, slotIndex) => {
                        const offsetBeats = beatPatternSlotOffset(meter, slotIndex, subdivision);
                        const placedEvent = trackEvents.find((event) =>
                          event.measureIndex === measureIndex &&
                          Math.abs(event.offsetBeats - offsetBeats) < .0001);
                        const selected = placedEvent?.id === selectedEventId;
                        const positionLabel = slotPositionLabel(slotIndex, subdivision);
                        const beatNumber = Math.floor(slotIndex / subdivision) + 1;
                        const partIndex = slotIndex % subdivision;
                        return (
                          <div className={`beat-slot${partIndex === 0 ? " beat-start" : ""}${placedEvent ? " filled" : ""}${selected ? " selected" : ""}`}
                            key={slotIndex}>
                            <button type="button" className={placedEvent ? "selected-sound" : ""}
                              data-testid={`beat-slot-${trackIndex}-${measureIndex}-${slotIndex}`}
                              disabled={disabled}
                              aria-label={`${measureIndex + 1}마디 ${positionLabel}에 ${instrument.name} ${placedEvent ? "삭제" : "넣기"}`}
                              onClick={() => void toggleSlot(trackIndex, measureIndex, slotIndex)}>
                              <b>{partIndex === 0 ? beatNumber : "·"}</b>
                              {placedEvent && <span aria-hidden="true">{instrument.icon}</span>}
                              {!placedEvent && <small aria-hidden="true">+</small>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="beat-volume-control">
        <label htmlFor="beat-volume">
          <Volume2 size={18} aria-hidden="true" />
          <span><strong>비트 소리 크기</strong><small>반주에 묻히면 최대 {MAX_BEAT_VOLUME}%까지 올려 보세요.</small></span>
        </label>
        <input id="beat-volume" data-testid="beat-volume" type="range"
          min="0" max={MAX_BEAT_VOLUME} step="5" value={volume} disabled={disabled}
          aria-valuetext={`${volume}%`}
          onChange={(event) => onVolumeChange(Number(event.currentTarget.value))} />
        <output htmlFor="beat-volume">{volume}%</output>
      </div>

      <div className="beat-listen-row">
        <p>{normalizedEvents.length === 0
          ? "아직 놓은 소리가 없어요. 비트는 자동으로 들어가지 않아요."
          : `${trackInstrumentIds.length}개 악기로 만든 ${normalizedEvents.length}개 소리를 함께 들어 보세요.`}</p>
        <button type="button" className="beat-preview-button"
          data-testid="preview-selected-beat"
          disabled={(disabled && !playing) || normalizedEvents.length === 0}
          onClick={() => void togglePreview()}>
          <PlayIcon playing={playing} />
          {playing ? "비트 멈추기" : "겹친 4마디 비트 들어보기"}
        </button>
      </div>
    </section>
  );
}
