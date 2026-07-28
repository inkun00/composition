import { useEffect, useRef } from "react";
import { Layers3, Music2, Volume2 } from "lucide-react";
import { previewBeatGroove, stopBeatPreview } from "../audio/drumGroove";
import type { AccompanimentStyleId } from "../music/accompaniment";
import {
  BEAT_INSTRUMENTS,
  findBeatInstrument,
  normalizeBeatInstrumentIds,
  type BeatInstrumentId,
  type BeatInstrumentRole
} from "../music/beatInstruments";
import type { Meter } from "../music/meter";
import PlayIcon from "./PlayIcon";
import "./BeatInstrumentChooser.css";

type BeatInstrumentChooserProps = Readonly<{
  value: readonly BeatInstrumentId[];
  styleId: AccompanimentStyleId;
  meter: Meter;
  bpm: number;
  volume: number;
  disabled: boolean;
  playing: boolean;
  onChange: (value: BeatInstrumentId[]) => void;
  onVolumeChange: (value: number) => void;
  onPlayingChange: (playing: boolean) => void;
}>;

const roles: readonly Readonly<{
  id: BeatInstrumentRole;
  title: string;
  description: string;
}>[] = [
  { id: "low", title: "낮은 쿵", description: "중요한 박자를 잡아요" },
  { id: "middle", title: "가운데 짝", description: "박자의 중심을 채워요" },
  { id: "high", title: "잔박자 찰찰", description: "움직임을 더해요" }
];

function layerLabel(count: number): string {
  if (count === 0) return "비트 없이";
  if (count === 1) return "1겹 · 가볍게";
  if (count === 2) return "2겹 · 알차게";
  return "3겹 · 신나게";
}

export default function BeatInstrumentChooser({
  value,
  styleId,
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
  const selected = normalizeBeatInstrumentIds(value);

  useEffect(() => () => {
    if (previewEndTimer.current !== null) window.clearTimeout(previewEndTimer.current);
    void stopBeatPreview();
  }, []);

  async function stopPreview() {
    if (previewEndTimer.current !== null) window.clearTimeout(previewEndTimer.current);
    previewEndTimer.current = null;
    await stopBeatPreview();
    onPlayingChange(false);
  }

  async function toggleInstrument(instrumentId: BeatInstrumentId) {
    await stopPreview();
    const instrument = findBeatInstrument(instrumentId);
    const active = selected.includes(instrumentId);
    const withoutRole = selected.filter((id) => findBeatInstrument(id).role !== instrument.role);
    onChange(active ? withoutRole : normalizeBeatInstrumentIds([...withoutRole, instrumentId]));
  }

  async function togglePreview() {
    if (playing) {
      await stopPreview();
      return;
    }
    const duration = await previewBeatGroove(styleId, meter, selected, bpm, volume);
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
            <small>박자 느낌을 직접 만들어요</small>
            <h3 id="beat-instrument-heading">비트를 주는 악기를 골라요</h3>
            <p>소리를 비교해 보고 각 줄에서 하나씩, 최대 세 가지를 겹칠 수 있어요.</p>
          </div>
        </div>
        <div className={`beat-layer-count layer-${selected.length}`} aria-live="polite">
          <Layers3 size={17} aria-hidden="true" />
          <span>지금은</span>
          <strong>{layerLabel(selected.length)}</strong>
        </div>
      </div>

      <div className="beat-role-groups">
        {roles.map((role, roleIndex) => (
          <fieldset className="beat-role-group" key={role.id}>
            <legend>
              <b>{roleIndex + 1}</b>
              <span><strong>{role.title}</strong><small>{role.description}</small></span>
            </legend>
            <div className="beat-instrument-options">
              {BEAT_INSTRUMENTS.filter((instrument) => instrument.role === role.id).map((instrument) => {
                const active = selected.includes(instrument.id);
                return (
                  <button key={instrument.id} type="button"
                    data-testid={`beat-instrument-${instrument.id}`}
                    className={active ? "active" : ""}
                    aria-pressed={active}
                    disabled={disabled}
                    title={instrument.description}
                    onClick={() => void toggleInstrument(instrument.id)}>
                    <span>{instrument.icon}</span>
                    <strong>{instrument.name}</strong>
                    <small>{active ? "고른 소리 ✓" : "이 소리 고르기"}</small>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="beat-volume-control">
        <label htmlFor="beat-volume">
          <Volume2 size={18} aria-hidden="true" />
          <span><strong>비트 소리 크기</strong><small>다른 반주에 묻히면 더 크게 올려 보세요.</small></span>
        </label>
        <input id="beat-volume" data-testid="beat-volume" type="range"
          min="0" max="160" step="5" value={volume} disabled={disabled}
          aria-valuetext={`${volume}%`}
          onChange={(event) => onVolumeChange(Number(event.currentTarget.value))} />
        <output htmlFor="beat-volume">{volume}%</output>
      </div>

      <div className="beat-listen-row">
        <p>{selected.length === 0
          ? "아직 비트 악기를 고르지 않았어요. 지금 반주는 비트 없이 연주돼요."
          : `${selected.map((id) => findBeatInstrument(id).name).join(" + ")} 소리를 직접 들어 보세요.`}</p>
        <button type="button" className="beat-preview-button"
          data-testid="preview-selected-beat"
          disabled={(disabled && !playing) || selected.length === 0}
          onClick={() => void togglePreview()}>
          <PlayIcon playing={playing} />
          {playing ? "비트 멈추기" : "고른 비트 들어보기"}
        </button>
      </div>
    </section>
  );
}
