import { useEffect, useRef, useState } from "react";
import { playComposition, stopPlayback, type PlaybackMeasure } from "../audio/player";
import type { AccompanimentStyleId } from "../music/accompaniment";
import { getCandidates } from "../music/candidates";
import { HARMONY_PRESETS, type HarmonyPreset } from "../music/harmonyPresets";
import type { Meter } from "../music/meter";
import {
  rankRecommendedCandidates,
  recommendedEndingPitch
} from "../music/recommendation";
import { prioritizeCandidatesForRhythm } from "../music/rhythmPreference";
import PlayIcon from "./PlayIcon";
import "./HarmonyPresetChooser.css";

type HarmonyPresetChooserProps = Readonly<{
  preset: HarmonyPreset;
  meter: Meter;
  bpm: number;
  accompanimentStyleId: AccompanimentStyleId;
  disabled: boolean;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onSelect: (id: string) => void;
}>;

export function buildHarmonyPreviewMeasures(
  preset: HarmonyPreset,
  meter: Meter,
  accompanimentStyleId: AccompanimentStyleId = "children_song"
): readonly PlaybackMeasure[] {
  let previousPitch: number | null = null;
  let previousCandidateIndex = -1;
  const usedCandidateIndexes = new Set<number>();
  const variationSeed = Number.parseInt(preset.id.slice(1), 10) || 0;

  return preset.bars.slice(0, 4).map((chords, index) => {
    const candidates = getCandidates(preset.roles[index], meter, chords);
    const harmonyRanked = rankRecommendedCandidates(
      candidates,
      chords,
      previousPitch,
      index,
      4,
      previousCandidateIndex,
      usedCandidateIndexes
    );
    const rhythmRanked = prioritizeCandidatesForRhythm(harmonyRanked, accompanimentStyleId);
    const unused = rhythmRanked.filter((candidate) => {
      const candidateIndex = candidates.indexOf(candidate);
      return candidateIndex !== previousCandidateIndex && !usedCandidateIndexes.has(candidateIndex);
    });
    const pool = unused.length > 0 ? unused : rhythmRanked;
    const choiceCount = Math.min(3, pool.length);
    const candidate = pool[(variationSeed + index) % choiceCount];
    previousCandidateIndex = candidates.indexOf(candidate);
    usedCandidateIndexes.add(previousCandidateIndex);
    previousPitch = recommendedEndingPitch(candidate);
    return {
      notes: candidate.notes,
      harmony: preset.roles[index],
      chords,
      effects: [],
      measureIndex: index
    };
  });
}

export default function HarmonyPresetChooser({
  preset,
  meter,
  bpm,
  accompanimentStyleId,
  disabled,
  playing,
  onPlayingChange,
  onSelect
}: HarmonyPresetChooserProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("추천 음악으로 네 마디의 느낌을 먼저 들어 보세요.");
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const ownsPlaybackRef = useRef(false);

  function clearPreviewTimer() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function finishPreview(message: string) {
    clearPreviewTimer();
    ownsPlaybackRef.current = false;
    onPlayingChange(false);
    setLoading(false);
    setStatus(message);
  }

  async function stopPreview(message = "미리듣기를 멈췄어요.") {
    requestRef.current += 1;
    await stopPlayback();
    finishPreview(message);
  }

  async function togglePreview() {
    if (playing || loading) {
      await stopPreview();
      return;
    }

    const request = ++requestRef.current;
    setLoading(true);
    setStatus("네 마디 음악을 준비하고 있어요…");
    try {
      const measures = buildHarmonyPreviewMeasures(preset, meter, accompanimentStyleId);
      const duration = await playComposition(measures, "acoustic_grand_piano", bpm, {
        styleId: accompanimentStyleId,
        instrumentIds: ["acoustic_grand_piano"],
        beatInstrumentIds: [],
        beatVolume: 100,
        meter
      });
      if (request !== requestRef.current) return;
      if (duration === null) {
        finishPreview("소리를 준비하지 못했어요. 다시 눌러 보세요.");
        return;
      }
      ownsPlaybackRef.current = true;
      setLoading(false);
      onPlayingChange(true);
      setStatus("추천 가락과 반주를 함께 듣고 있어요.");
      timerRef.current = window.setTimeout(
        () => finishPreview("다른 이야기도 골라서 비교해 보세요."),
        duration * 1000
      );
    } catch {
      if (request === requestRef.current) {
        finishPreview("소리를 준비하지 못했어요. 다시 눌러 보세요.");
      }
    }
  }

  async function selectPreset(id: string) {
    if (ownsPlaybackRef.current || loading) {
      await stopPreview("새 화음 이야기를 골랐어요.");
    }
    onSelect(id);
  }

  useEffect(() => () => {
    requestRef.current += 1;
    clearPreviewTimer();
    if (ownsPlaybackRef.current) void stopPlayback();
  }, []);

  return (
    <section className="preset-chooser setup-with-guide" aria-labelledby="preset-heading">
      <div className="compact-heading">
        <span className="number-badge">2</span>
        <div>
          <h2 id="preset-heading">화음 이야기를 골라요</h2>
          <p>마디를 만들기 전에 네 마디 음악으로 느낌을 확인할 수 있어요.</p>
        </div>
      </div>
      <div className="preset-picker">
        <label>
          <select data-testid="harmony-preset-select" aria-label="화음 이야기 선택" value={preset.id}
            onChange={(event) => void selectPreset(event.target.value)}>
            {HARMONY_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>{item.id.slice(1)} · {item.childName}</option>
            ))}
          </select>
        </label>
        <div className="preset-summary">
          <div className="preset-summary-copy">
            <span>{preset.category} · {preset.difficulty}</span>
            <p>{preset.description}</p>
          </div>
          <div className="preset-preview-actions">
            <button className={`preset-preview-button${playing ? " playing" : ""}`}
              type="button" data-testid="harmony-preview-button"
              disabled={disabled && !playing} aria-pressed={playing}
              onClick={() => void togglePreview()}>
              <PlayIcon playing={playing} />
              {loading ? "음악 준비 중…" : playing ? "미리듣기 멈추기" : "추천 음악 4마디 미리듣기"}
            </button>
            <p className="preset-preview-status" aria-live="polite">{status}</p>
          </div>
        </div>
      </div>
      <img className="workspace-guide setup-guide-boy" src="/illustrations/guide-boy-v1.webp"
        alt="" aria-hidden="true" draggable="false" />
    </section>
  );
}
