import { Bike, Footprints, MoonStar, PersonStanding, Rabbit, Turtle, type LucideIcon } from "lucide-react";
import type { AccompanimentStyleId } from "../music/accompaniment";
import { rhythmPreferenceForStyle } from "../music/rhythmPreference";
import "./SongMoodSetup.css";

const TEMPO_CHOICES = [
  { id: "slow", Icon: MoonStar, name: "느림", bpm: 72, description: "차분하고 포근해요" },
  { id: "normal", Icon: PersonStanding, name: "보통", bpm: 96, description: "편안하게 걸어가요" },
  { id: "fast", Icon: Bike, name: "빠름", bpm: 128, description: "신나고 힘이 넘쳐요" }
] as const;

const RHYTHM_CHOICES = [
  {
    id: "short",
    Icon: Rabbit,
    name: "짧게 통통",
    description: "짧은 소리가 이어져 빠르고 신나게 느껴져요",
    styleId: "children_song",
  },
  {
    id: "medium",
    Icon: Footprints,
    name: "고르게 또박",
    description: "한 박자씩 고르게 나와 자연스럽게 느껴져요",
    styleId: "folk",
  },
  {
    id: "long",
    Icon: Turtle,
    name: "길게 여유롭게",
    description: "긴 소리가 이어져 천천히 편안하게 느껴져요",
    styleId: "opera",
  }
] as const satisfies readonly {
  id: string;
  Icon: LucideIcon;
  name: string;
  description: string;
  styleId: AccompanimentStyleId;
}[];

type SongMoodSetupProps = Readonly<{
  bpm: number;
  rhythmStyleId: AccompanimentStyleId;
  disabled: boolean;
  onTempoChange: (bpm: number) => void;
  onRhythmChange: (styleId: AccompanimentStyleId) => void;
}>;

export default function SongMoodSetup({
  bpm,
  rhythmStyleId,
  disabled,
  onTempoChange,
  onRhythmChange
}: SongMoodSetupProps) {
  return (
    <section className="song-mood-setup" aria-labelledby="song-mood-heading">
      <div className="compact-heading">
        <span className="number-badge">1</span>
        <div>
          <h2 id="song-mood-heading">노래 느낌을 먼저 골라요</h2>
          <p>주제에 어울리는 빠르기와 음의 움직임을 정해 보세요.</p>
        </div>
      </div>

      <div className="song-mood-top-row">
        <fieldset className="mood-choice-group">
          <legend>① 얼마나 빠르게 갈까요?</legend>
          <p>숫자가 클수록 더 빠르게 들려요. BPM은 1분 동안 세는 박자 수예요.</p>
          <div className="tempo-mood-options">
            {TEMPO_CHOICES.map((choice) => (
              <button key={choice.id} type="button" disabled={disabled}
                className={bpm === choice.bpm ? "active" : ""}
                aria-pressed={bpm === choice.bpm}
                data-testid={`mood-tempo-${choice.id}`}
                onClick={() => onTempoChange(choice.bpm)}>
                <span className="mood-option-icon"><choice.Icon size={20} strokeWidth={2.1} /></span>
                <strong>{choice.name}</strong>
                <b>{choice.bpm} BPM</b>
                <small>{choice.description}</small>
              </button>
            ))}
          </div>
          {!TEMPO_CHOICES.some((choice) => choice.bpm === bpm) &&
            <span className="custom-mood-value">지금 빠르기 · {bpm} BPM</span>}
        </fieldset>

        <fieldset className="mood-choice-group">
          <legend>② 음이 어떻게 움직일까요?</legend>
          <p>같은 빠르기라도 짧은 음이 많으면 더 빠르게 느껴져요.</p>
          <div className="rhythm-mood-options">
            {RHYTHM_CHOICES.map((choice) => {
              const active = rhythmPreferenceForStyle(rhythmStyleId) === choice.id;
              return (
                <button key={choice.id} type="button" disabled={disabled}
                  className={active ? "active" : ""} aria-pressed={active}
                  data-testid={`mood-rhythm-${choice.id}`}
                  onClick={() => onRhythmChange(choice.styleId)}>
                  <span className="mood-option-icon"><choice.Icon size={20} strokeWidth={2.1} /></span>
                  <strong>{choice.name}</strong>
                  <small>{choice.description}</small>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </section>
  );
}
