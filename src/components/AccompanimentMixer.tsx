import { Headphones, SlidersHorizontal, Volume2, VolumeX, X } from "./AppArtworkIcons";
import type { AccompanimentTrackState } from "../audio/accompanimentRuntime";
import type { AccompanimentMixerController } from "../hooks/useAccompanimentMixer";
import { assignEnsembleRoles, type EnsembleRole } from "../music/accompanimentEnsemble";
import { accompanimentTrackSettings } from "../music/accompanimentMix";
import { findInstrument, type InstrumentId } from "../music/instruments";
import "./AccompanimentMixer.css";
import MusicChoiceArtwork from "./MusicChoiceArtwork";

const STATUS_LABELS: Record<AccompanimentTrackState["status"], string> = {
  loading: "악기 소리 준비 중",
  ready: "악기 소리 준비됨",
  error: "악기 소리를 불러오지 못했어요",
  playing: "연주 중",
  rest: "쉬는 중",
  muted: "소리 꺼짐"
};

const ROLE_LABELS: Record<EnsembleRole, string> = {
  bass: "저음으로 중심 잡기", harmony: "화음으로 받치기", pulse: "리듬 더하기",
  pad: "긴 울림으로 감싸기", counterline: "아래에서 가락 이어주기",
  answer: "노래에 답하는 가락", ornament: "가볍게 꾸미기"
};

type Props = {
  instrumentIds: readonly InstrumentId[];
  mixer: AccompanimentMixerController;
  canListen: boolean;
  editingDisabled: boolean;
  controlsDisabled?: boolean;
  onSolo: (instrumentId: InstrumentId) => void;
  onRemove: (instrumentId: InstrumentId) => void;
};

export default function AccompanimentMixer({ instrumentIds, mixer, canListen, editingDisabled, controlsDisabled = false, onSolo, onRemove }: Props) {
  const roles = assignEnsembleRoles(instrumentIds);
  return (
    <section className="accompaniment-mixer" aria-label="현재 반주 트랙">
      <div className="accompaniment-mixer-heading">
        <div><SlidersHorizontal size={18} aria-hidden="true" /><strong>악기별 소리 확인</strong></div>
        <span>{instrumentIds.length}개 반주 악기</span>
      </div>
      <p className="accompaniment-mixer-help">단독 듣기로 각 악기의 소리를 확인하고 음량을 조절해 보세요.</p>
      {instrumentIds.map((instrumentId) => {
        const instrument = findInstrument(instrumentId);
        const mix = accompanimentTrackSettings(mixer.trackMix, instrument.id);
        const runtime = mixer.trackStates[instrument.id];
        const solo = mixer.soloInstrumentId === instrument.id;
        const muted = (mix.muted && !solo) || mix.volume === 0;
        const level = muted ? 0 : runtime?.level ?? 0;
        const status = runtime?.status === "error" ? STATUS_LABELS.error : muted ? "소리 꺼짐"
          : runtime ? STATUS_LABELS[runtime.status] : "재생하면 악기 소리를 확인해요";
        return (
          <div className={`accompaniment-mixer-track${solo ? " solo" : ""}`} key={instrument.id}
            data-testid={`mixer-track-${instrument.id}`}>
            <div className="accompaniment-mixer-identity">
              <span className="accompaniment-mixer-icon" aria-hidden="true"><MusicChoiceArtwork symbol={instrument.icon} size={30} /></span>
              <div><strong>{instrument.name}</strong><small>{ROLE_LABELS[roles.find((role) =>
                role.instrumentId === instrument.id)?.role ?? "pad"]}</small></div>
              <button type="button" className="accompaniment-mixer-remove" disabled={editingDisabled}
                aria-label={`${instrument.name} 반주에서 빼기`} onClick={() => onRemove(instrument.id)}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="accompaniment-mixer-signal">
              <meter min={0} max={1} value={level} aria-label={`${instrument.name} 실제 소리 크기`}
                data-testid={`mixer-level-${instrument.id}`} />
              <span className={runtime?.status === "error" ? "error" : ""}
                data-testid={`mixer-status-${instrument.id}`} title={runtime?.message}>{status}</span>
            </div>
            <div className="accompaniment-mixer-controls">
              <label>
                <span>음량 <output>{mix.volume}%</output></span>
                <input type="range" min={0} max={150} step={1} value={mix.volume} disabled={controlsDisabled}
                  aria-label={`${instrument.name} 반주 음량`} data-testid={`mixer-volume-${instrument.id}`}
                  onChange={(event) => mixer.setTrackVolume(instrument.id, Number(event.target.value))} />
              </label>
              <button type="button" aria-pressed={mix.muted} disabled={controlsDisabled} onClick={() => mixer.toggleTrackMute(instrument.id)}
                aria-label={`${instrument.name} ${mix.muted ? "소리 켜기" : "소리 끄기"}`}
                data-testid={`mixer-mute-${instrument.id}`}>
                {mix.muted ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
                {mix.muted ? "소리 켜기" : "소리 끄기"}
              </button>
              <button type="button" aria-pressed={solo} disabled={!canListen} onClick={() => onSolo(instrument.id)}
                aria-label={`${instrument.name} ${solo ? "단독 듣기 중지" : "단독 듣기"}`}
                data-testid={`mixer-solo-${instrument.id}`}>
                <Headphones size={15} aria-hidden="true" />{solo ? "듣기 중지" : "단독 듣기"}
              </button>
            </div>
            {runtime?.status === "error" && runtime.message && (
              <p className="accompaniment-mixer-error">{runtime.message}</p>
            )}
          </div>
        );
      })}
      {instrumentIds.length === 0 && <p className="accompaniment-mixer-empty">반주 악기를 추가하면 여기에서 소리를 조절할 수 있어요.</p>}
    </section>
  );
}
