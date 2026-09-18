import { useEffect, useMemo, useRef, useState } from "react";
import { FileMusic, Music2, Square, X } from "lucide-react";
import { playComposition, stopPlayback, type PlaybackMeasure } from "../audio/player";
import { findHarmonyPreset } from "../music/harmonyPresets";
import { findAccompanimentStyle } from "../music/accompaniment";
import { findInstrument } from "../music/instruments";
import type { SharedComposition } from "../music/share";
import PlayIcon from "./PlayIcon";
import "./QrSongPlayback.css";

type PlaybackPhase = "idle" | "loading" | "playing" | "error";

function QrPageCloseButton() {
  return (
    <button type="button" className="qr-playback-close" aria-label="QR 노래 연주 창 닫기"
      onClick={() => {
        window.close();
        window.setTimeout(() => {
          if (!window.closed) window.location.assign(window.location.pathname);
        }, 100);
      }}>
      <X size={18} aria-hidden="true" /> 닫기
    </button>
  );
}

export default function QrSongPlayback({ composition, songId = "" }: Readonly<{
  composition: SharedComposition | null;
  songId?: string;
}>) {
  const [storedComposition, setStoredComposition] = useState<SharedComposition | null>(composition);
  const [loadingSong, setLoadingSong] = useState(!composition && Boolean(songId));
  const [phase, setPhase] = useState<PlaybackPhase>("idle");
  const [error, setError] = useState("");
  const completionTimer = useRef<number | null>(null);
  const activeComposition = composition ?? storedComposition;
  const playable = useMemo<PlaybackMeasure[]>(() => {
    if (!activeComposition) return [];
    const preset = findHarmonyPreset(activeComposition.presetId);
    return activeComposition.measures.map((measure, index) => ({
      notes: measure.notes,
      harmony: preset.roles[index % preset.roles.length],
      chords: preset.bars[index % preset.bars.length],
      effects: measure.effects,
      measureIndex: index
    }));
  }, [activeComposition]);

  useEffect(() => {
    if (composition || !songId) {
      setLoadingSong(false);
      return;
    }
    let active = true;
    void import("../firebase/qrSongs").then(({ loadQrSong }) => loadQrSong(songId)).then((loaded) => {
      if (active) setStoredComposition(loaded);
    }).catch((caught) => {
      console.error(caught);
      if (active) setStoredComposition(null);
    }).finally(() => {
      if (active) setLoadingSong(false);
    });
    return () => { active = false; };
  }, [composition, songId]);

  useEffect(() => () => {
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    void stopPlayback();
  }, []);

  async function togglePlayback() {
    if (!activeComposition || phase === "loading") return;
    if (phase === "playing") {
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
      await stopPlayback();
      setPhase("idle");
      return;
    }
    setPhase("loading");
    setError("");
    try {
      const duration = await playComposition(playable, findInstrument(activeComposition.instrumentId).id,
        activeComposition.bpm ?? 96, {
          styleId: findAccompanimentStyle(activeComposition.accompanimentStyleId ?? "arpeggio").id,
          instrumentIds: (activeComposition.accompanimentInstrumentIds ?? ["acoustic_grand_piano"])
            .map((id) => findInstrument(id).id),
          beatPattern: activeComposition.beatPattern,
          beatVolume: activeComposition.beatVolume,
          meter: activeComposition.meter
        });
      if (duration === null) throw new Error("audio-busy");
      setPhase("playing");
      completionTimer.current = window.setTimeout(() => setPhase("idle"), duration + 150);
    } catch (caught) {
      console.error(caught);
      setPhase("error");
      setError("노래를 재생하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    }
  }

  if (loadingSong) return (
    <main className="qr-playback-page"><section className="qr-playback-card" role="status" aria-live="polite">
      <QrPageCloseButton /><div className="qr-playback-disc" aria-hidden="true"><FileMusic size={42} /></div>
      <h1>노래를 불러오고 있어요</h1><p className="qr-playback-creator">잠시만 기다려 주세요.</p>
    </section></main>
  );

  if (!activeComposition) return (
    <main className="qr-playback-page"><section className="qr-playback-card is-error">
      <QrPageCloseButton /><FileMusic size={42} aria-hidden="true" /><h1>노래 링크를 확인해 주세요</h1>
      <p>악보의 QR 코드를 다시 스캔하면 노래를 열 수 있어요.</p>
    </section></main>
  );

  return (
    <main className="qr-playback-page">
      <section className="qr-playback-card" aria-label="QR 악보 노래 재생">
        <QrPageCloseButton />
        <span className="qr-playback-kicker"><Music2 size={17} /> 마음멜로디 악보</span>
        <div className="qr-playback-disc" aria-hidden="true"><FileMusic size={42} /></div>
        <h1>{activeComposition.title || "나의 노래"}</h1>
        <p className="qr-playback-creator">{activeComposition.creator || "어린이 작곡가"} 작곡</p>
        <div className="qr-playback-summary">
          <span>{activeComposition.songLength}마디</span>
          <span>{activeComposition.meter.beats}/{activeComposition.meter.beatUnit}박자</span>
          <span>{activeComposition.bpm ?? 96} BPM</span>
        </div>
        <button type="button" className="qr-playback-start" disabled={phase === "loading"}
          data-testid="qr-create-play" onClick={() => void togglePlayback()}>
          {phase === "playing" ? <Square size={18} fill="currentColor" /> : <PlayIcon />}
          {phase === "loading" ? "노래 준비 중..." : phase === "playing" ? "재생 멈추기" : "노래 재생"}
        </button>
        {error && <p className="qr-playback-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
