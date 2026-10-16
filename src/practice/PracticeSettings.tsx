import { meterKey, SUPPORTED_METERS } from "../music/meter";
import type { usePracticeState } from "./usePracticeState";

type Props = { practice: ReturnType<typeof usePracticeState>; disabled: boolean; hidden: boolean };

export default function PracticeSettings({ practice, disabled, hidden }: Props) {
  const { draft, step } = practice;
  const rhythmLocked = draft.mode === "rhythm-melody" && step === "melody";
  return (
    <details className="practice-settings-disclosure" hidden={hidden}>
      <summary>곡 설정 <span>{draft.measures.length}마디 · {meterKey(draft.meter)}박자 · {draft.bpm} BPM</span></summary>
      <fieldset className="practice-settings" disabled={disabled}>
        <legend className="practice-sr-only">연습할 곡 설정</legend>
        <label className="practice-title-field">가락 이름
          <input aria-label="연습 가락 이름" maxLength={80} value={draft.title}
            onChange={(event) => practice.configure({ title: event.target.value })} />
        </label>
        <label>마디 수
          <select aria-label="연습할 마디 수" value={draft.measures.length} disabled={rhythmLocked}
            onChange={(event) => practice.resize(Number(event.target.value))}>
            {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>{count}마디</option>
            ))}
          </select>
        </label>
        <label>박자
          <select aria-label="연습 박자" value={meterKey(draft.meter)} disabled={rhythmLocked}
            onChange={(event) => {
              const meter = SUPPORTED_METERS.find((item) => meterKey(item) === event.target.value);
              if (meter) practice.setMeter(meter);
            }}>
            {SUPPORTED_METERS.map((meter) => (
              <option key={meterKey(meter)} value={meterKey(meter)}>{meterKey(meter)}박자</option>
            ))}
          </select>
        </label>
        <label>빠르기
          <select aria-label="연습 빠르기" value={draft.bpm}
            onChange={(event) => practice.configure({ bpm: Number(event.target.value) })}>
            {[60, 72, 84, 96, 108, 120, 144].map((bpm) => (
              <option key={bpm} value={bpm}>{bpm} BPM{bpm === 72 ? " · 천천히" : bpm === 96 ? " · 보통" : ""}</option>
            ))}
            {![60, 72, 84, 96, 108, 120, 144].includes(draft.bpm) && <option value={draft.bpm}>{draft.bpm} BPM</option>}
          </select>
        </label>
      </fieldset>
    </details>
  );
}
