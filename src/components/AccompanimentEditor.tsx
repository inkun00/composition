import { useState, type ReactNode } from "react";
import {
  ACCOMPANIMENT_MODES,
  ACCOMPANIMENT_PLAYING_STYLES,
  MAX_ACCOMPANIMENT_INSTRUMENTS,
  isAccompanimentInstrument,
  type AccompanimentStyleId
} from "../music/accompaniment";
import { findInstrument, INSTRUMENTS, type InstrumentId } from "../music/instruments";
import PlayIcon from "./PlayIcon";

const ACCOMPANIMENT_INSTRUMENTS = INSTRUMENTS.filter((instrument) => isAccompanimentInstrument(instrument.id));

type Props = {
  styleId: AccompanimentStyleId;
  instrumentIds: readonly InstrumentId[];
  disabled: boolean;
  playback: Readonly<{ state: "idle" | "playing" | "paused"; disabled: boolean; onListen: () => void }>;
  onChange: (styleId: AccompanimentStyleId, instrumentIds?: readonly InstrumentId[]) => void;
  onToggleInstrument: (instrumentId: InstrumentId) => void;
  children: ReactNode;
};

export default function AccompanimentEditor({ styleId, instrumentIds, disabled, playback, onChange, onToggleInstrument, children }: Props) {
  const [view, setView] = useState<"mode" | "playing">("mode");
  const [showAllModes, setShowAllModes] = useState(false);
  const activeMode = ACCOMPANIMENT_MODES.find((mode) => mode.styleId === styleId &&
    mode.instrumentIds.length === instrumentIds.length &&
    mode.instrumentIds.every((id, index) => findInstrument(id).id === findInstrument(instrumentIds[index]).id));

  return (
    <>
      <div className="accompaniment-style-with-guide">
        <div className="accompaniment-heading">
          <div><span className="section-kicker">자동 반주 만들기</span><h2 id="accompaniment-heading">반주</h2></div>
        </div>
        <div className="accompaniment-summary">
          <small>내가 고른 반주</small>
          <strong>{activeMode?.name ?? "내가 만든 반주"}</strong>
          <span>{instrumentIds.length}개 악기 선택됨</span>
        </div>
        <p>악기를 고르면 내 가락과 다른 악기의 역할에 맞춰 반주가 만들어져요.</p>
        <div className="accompaniment-style-content">
          <div className="accompaniment-style-tabs" role="tablist" aria-label="반주 선택 모드">
            <button type="button" role="tab" id="accompaniment-mode-tab" aria-controls="accompaniment-style-panel"
              data-testid="accompaniment-mode-tab" aria-selected={view === "mode"}
              className={view === "mode" ? "active" : ""} onClick={() => setView("mode")}>쉬운 반주 고르기</button>
            <button type="button" role="tab" id="accompaniment-playing-tab" aria-controls="accompaniment-style-panel"
              data-testid="accompaniment-playing-tab" aria-selected={view === "playing"}
              className={view === "playing" ? "active" : ""} onClick={() => setView("playing")}>내가 직접 바꾸기</button>
          </div>
          <div role="tabpanel" id="accompaniment-style-panel"
            aria-labelledby={view === "mode" ? "accompaniment-mode-tab" : "accompaniment-playing-tab"}
            aria-label={view === "mode" ? "쉬운 반주 선택" : "반주 직접 바꾸기"}>
            {view === "mode" ? (
              <>
                <div className="accompaniment-mode-grid" role="group" aria-label="쉬운 반주 선택">
                  {ACCOMPANIMENT_MODES.slice(0, showAllModes ? ACCOMPANIMENT_MODES.length : 6).map((mode) => (
                    <button key={mode.id} type="button" data-testid={`accompaniment-mode-${mode.id}`}
                      className={activeMode?.id === mode.id ? "active" : ""} aria-pressed={activeMode?.id === mode.id}
                      disabled={disabled} onClick={() => onChange(mode.styleId, mode.instrumentIds)}>
                      <span>{mode.icon}</span><strong>{mode.name}</strong>
                    </button>
                  ))}
                </div>
                <button type="button" className="accompaniment-more-modes" data-testid="toggle-more-accompaniment-modes"
                  onClick={() => setShowAllModes((current) => !current)}>
                  {showAllModes ? "자주 쓰는 6가지만 보기" : "다른 느낌 4개 더 보기"}
                </button>
                <div className="easy-accompaniment-result">
                  <div><strong>{activeMode ? `${activeMode.icon} ${activeMode.name} 반주를 골랐어요` : "카드를 눌러 반주를 골라 보세요"}</strong></div>
                  <div className="easy-accompaniment-instruments" aria-label="함께 연주하는 악기">
                    {instrumentIds.map((id) => {
                      const instrument = findInstrument(id);
                      return <span key={instrument.id}>{instrument.icon} {instrument.name}</span>;
                    })}
                  </div>
                  <button type="button" className="easy-accompaniment-listen" data-testid="listen-selected-accompaniment"
                    disabled={playback.disabled} onClick={playback.onListen}>
                    <PlayIcon playing={playback.state === "playing"} />
                    {playback.state === "playing" ? "잠깐 멈추기" : playback.state === "paused" ? "계속 들어보기" : "지금 들어보기"}
                  </button>
                </div>
              </>
            ) : (
              <div className="accompaniment-style-grid">
                {ACCOMPANIMENT_PLAYING_STYLES.map((style) => (
                  <button key={style.id} type="button" data-testid={`accompaniment-style-${style.id}`}
                    className={styleId === style.id ? "accompaniment-style active" : "accompaniment-style"}
                    aria-pressed={styleId === style.id} disabled={disabled} onClick={() => onChange(style.id)}>
                    <span>{style.alias}</span><strong>{style.name}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {children}
      <div className="instrument-bank-heading"><strong>반주 트랙 추가</strong><span>최대 {MAX_ACCOMPANIMENT_INSTRUMENTS}개</span></div>
      <div className="accompaniment-instruments" aria-label="반주 악기 여러 개 선택">
        {ACCOMPANIMENT_INSTRUMENTS.map((instrument) => {
          const active = instrumentIds.includes(instrument.id);
          const blocked = !active && instrumentIds.length >= MAX_ACCOMPANIMENT_INSTRUMENTS;
          return (
            <button key={instrument.id} type="button" data-testid={`accompaniment-instrument-${instrument.id}`}
              className={active ? "accompaniment-instrument active" : "accompaniment-instrument"}
              aria-pressed={active} disabled={blocked || disabled} onClick={() => onToggleInstrument(instrument.id)}>
              <span>{instrument.icon}</span><strong>{instrument.name}</strong>
            </button>
          );
        })}
      </div>
      {instrumentIds.length === 0 && <p className="accompaniment-warning">반주 악기 없음 · 가락만 연주</p>}
    </>
  );
}
