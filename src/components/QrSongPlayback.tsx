import { useEffect, useMemo, useRef, useState } from "react";
import { FileMusic, Music2, X } from "lucide-react";
import {
  compositionIntroSeconds,
  playComposition,
  stopPlayback,
  type PlaybackMeasure
} from "../audio/player";
import { findHarmonyPreset } from "../music/harmonyPresets";
import { findAccompanimentStyle } from "../music/accompaniment";
import { findInstrument } from "../music/instruments";
import { normalizeBeatPattern } from "../music/beatPattern";
import { normalizeBeatVolume } from "../music/beatInstruments";
import type { SharedComposition } from "../music/share";
import PlayIcon from "./PlayIcon";
import { activeQrLyrics, buildQrLyricLines } from "./qrSongLyrics";
import "./QrSongPlayback.css";

type PlaybackPhase = "idle" | "preparing" | "intro" | "playing" | "ready" | "error";

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
  const [activeMeasureIndex, setActiveMeasureIndex] = useState<number | null>(null);
  const [activeLyricId, setActiveLyricId] = useState<string | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const introTimerRef = useRef<number | null>(null);
  const lyricTimerRef = useRef<number | null>(null);
  const lyricLineRefs = useRef(new Map<number, HTMLParagraphElement>());
  const activeComposition = composition ?? storedComposition;
  const playable = useMemo<PlaybackMeasure[]>(() => {
    if (!activeComposition) return [];
    const preset = findHarmonyPreset(activeComposition.presetId);
    return activeComposition.measures.map((measure, index) => ({
      notes: measure.notes,
      harmony: preset.roles[index % preset.roles.length],
      chords: measure.chords,
      effects: measure.effects,
      measureIndex: index
    }));
  }, [activeComposition]);
  const lyricLines = useMemo(() => activeComposition
    ? buildQrLyricLines(activeComposition, activeComposition.bpm ?? 96) : [], [activeComposition]);

  useEffect(() => {
    if (composition) {
      setStoredComposition(composition);
      setLoadingSong(false);
      return;
    }
    if (!songId) {
      setLoadingSong(false);
      return;
    }
    let active = true;
    setLoadingSong(true);
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
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    if (lyricTimerRef.current !== null) window.clearInterval(lyricTimerRef.current);
    void stopPlayback();
  }, []);

  useEffect(() => {
    if (activeMeasureIndex === null) return;
    lyricLineRefs.current.get(activeMeasureIndex)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [activeMeasureIndex]);

  function stopLyricTracking() {
    if (lyricTimerRef.current !== null) window.clearInterval(lyricTimerRef.current);
    lyricTimerRef.current = null;
    setActiveMeasureIndex(null);
    setActiveLyricId(null);
  }

  function startLyricTracking(introSeconds: number) {
    stopLyricTracking();
    const startedAt = performance.now() + (introSeconds + .08) * 1000;
    const update = () => {
      const active = activeQrLyrics(lyricLines, (performance.now() - startedAt) / 1000);
      setActiveMeasureIndex(active.measureIndex);
      setActiveLyricId(active.tokenId);
    };
    update();
    lyricTimerRef.current = window.setInterval(update, 50);
  }

  async function togglePlayback() {
    if (!activeComposition || phase === "preparing") return;
    if (phase === "intro" || phase === "playing") {
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
      finishTimerRef.current = null;
      introTimerRef.current = null;
      stopLyricTracking();
      await stopPlayback();
      setPhase("ready");
      return;
    }
    setPhase("preparing");
    setError("");
    try {
      const styleId = findAccompanimentStyle(activeComposition.accompanimentStyleId ?? "arpeggio").id;
      const instrumentIds = (activeComposition.accompanimentInstrumentIds ?? ["acoustic_grand_piano"])
        .map((id) => findInstrument(id).id);
      const introSeconds = compositionIntroSeconds(playable, activeComposition.bpm ?? 96);
      const duration = await playComposition(
        playable,
        findInstrument(activeComposition.instrumentId).id,
        activeComposition.bpm ?? 96,
        {
          styleId,
          instrumentIds,
          beatPattern: normalizeBeatPattern(activeComposition.beatPattern ?? [], activeComposition.meter),
          beatVolume: normalizeBeatVolume(activeComposition.beatVolume),
          meter: activeComposition.meter
        },
        { includeIntro: true }
      );
      if (duration === null) throw new Error("audio-busy");
      setPhase(introSeconds > 0 ? "intro" : "playing");
      startLyricTracking(introSeconds);
      if (introSeconds > 0) {
        introTimerRef.current = window.setTimeout(() => {
          introTimerRef.current = null;
          setPhase("playing");
        }, (introSeconds + .08) * 1000);
      }
      finishTimerRef.current = window.setTimeout(() => {
        finishTimerRef.current = null;
        if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
        introTimerRef.current = null;
        stopLyricTracking();
        setPhase("ready");
      }, duration * 1000);
    } catch (caught) {
      console.error(caught);
      stopLyricTracking();
      setPhase("error");
      setError("노래를 연주하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    }
  }

  if (loadingSong) {
    return (
      <main className="qr-playback-page">
        <section className="qr-playback-card" role="status" aria-live="polite">
          <QrPageCloseButton />
          <img className="qr-playback-art" src="/illustrations/qr-song-playback-v1.png" alt="" />
          <h1>노래를 불러오고 있어요</h1>
          <p className="qr-playback-creator">잠시만 기다려 주세요.</p>
        </section>
      </main>
    );
  }

  if (!activeComposition) {
    return (
      <main className="qr-playback-page">
        <section className="qr-playback-card is-error">
          <QrPageCloseButton />
          <FileMusic size={42} aria-hidden="true" />
          <h1>노래 링크를 확인해 주세요</h1>
          <p>악보의 QR 코드를 다시 스캔하면 노래를 열 수 있어요.</p>
        </section>
      </main>
    );
  }

  const preparing = phase === "preparing";
  return (
    <main className="qr-playback-page">
      <section className="qr-playback-card" aria-label="QR 악보 노래 재생">
        <QrPageCloseButton />
        <span className="qr-playback-kicker"><Music2 size={17} /> 마음멜로디 악보</span>
        <img className="qr-playback-art" src="/illustrations/qr-song-playback-v1.png" alt="" />
        <h1>{activeComposition.title || "나의 노래"}</h1>
        <p className="qr-playback-creator">{activeComposition.creator || "어린이 작곡가"} 작곡</p>
        <div className="qr-playback-summary">
          <span>{activeComposition.songLength}마디</span>
          <span>{activeComposition.meter.beats}/{activeComposition.meter.beatUnit}박자</span>
          <span>{activeComposition.bpm ?? 96} BPM</span>
        </div>

        {lyricLines.length > 0 ? (
          <section className="qr-playback-lyrics" aria-label="노래 가사">
            <div className="qr-playback-lyrics-heading">
              <strong>가사를 따라 불러요</strong>
              <span>{phase === "intro" ? "전주" : activeMeasureIndex === null
                ? "준비" : `${activeMeasureIndex + 1}마디`}</span>
            </div>
            <div className="qr-playback-lyric-lines">
              {lyricLines.map((line) => {
                const active = line.measureIndex === activeMeasureIndex;
                const past = activeMeasureIndex !== null && line.measureIndex < activeMeasureIndex;
                return (
                  <p key={line.measureIndex} className={active ? "is-active" : past ? "is-past" : undefined}
                    ref={(element) => {
                      if (element) lyricLineRefs.current.set(line.measureIndex, element);
                      else lyricLineRefs.current.delete(line.measureIndex);
                    }}>
                    <span className="qr-playback-measure-number">{line.measureIndex + 1}마디</span>
                    <span className="qr-playback-lyric-text">
                      {line.tokens.map((token) => (
                        <span key={token.id} className={token.id === activeLyricId ? "is-active" : undefined}>
                          {token.text}
                        </span>
                      ))}
                    </span>
                  </p>
                );
              })}
            </div>
          </section>
        ) : (
          <p className="qr-playback-no-lyrics">이 노래에는 아직 가사가 없어요.</p>
        )}

        <button type="button" className="qr-playback-start" disabled={preparing}
          data-testid="qr-play-song" onClick={() => void togglePlayback()}>
          <PlayIcon playing={phase === "intro" || phase === "playing"} />
          {preparing ? "연주 준비 중..." : phase === "intro" || phase === "playing"
            ? "연주 멈추기" : "노래 연주하기"}
        </button>

        <p className="qr-playback-guide" role="status" aria-live="polite">
          {preparing ? "악기를 준비하고 있어요." : phase === "intro"
            ? "4마디 전주를 들으며 노래를 준비해요." : phase === "playing"
            ? "가락과 반주를 함께 연주하고 있어요." : "버튼을 누르면 바로 연주해요."}
        </p>
        {error && <p className="qr-playback-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
