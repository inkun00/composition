import { useEffect, useMemo, useRef, useState } from "react";
import { FileMusic, Music2, X } from "lucide-react";
import { exportBackingCompositionMp3Offline, type PlaybackMeasure } from "../audio/player";
import { findHarmonyPreset } from "../music/harmonyPresets";
import { findAccompanimentStyle } from "../music/accompaniment";
import { findInstrument } from "../music/instruments";
import { normalizeBeatPattern } from "../music/beatPattern";
import { normalizeBeatVolume } from "../music/beatInstruments";
import type { SharedComposition } from "../music/share";
import PlayIcon from "./PlayIcon";
import "./QrSongPlayback.css";

type PlaybackPhase = "idle" | "generating" | "playing" | "ready" | "error";

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
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef("");
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
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
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    try {
      playbackSourceRef.current?.stop();
    } catch {
      // 이미 끝난 재생 소스는 다시 멈출 필요가 없어요.
    }
    void playbackContextRef.current?.close();
  }, []);

  async function createAndPlay() {
    if (!activeComposition || phase === "generating") return;
    if (audioUrlRef.current && audioRef.current) {
      setPhase("playing");
      await audioRef.current.play();
      return;
    }
    const AudioContextClass = window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const unlockedContext = AudioContextClass ? new AudioContextClass() : null;
    playbackContextRef.current = unlockedContext;
    if (unlockedContext?.state === "suspended") await unlockedContext.resume();
    setPhase("generating");
    setProgress(1);
    setError("");
    try {
      const styleId = findAccompanimentStyle(activeComposition.accompanimentStyleId ?? "arpeggio").id;
      const instrumentIds = (activeComposition.accompanimentInstrumentIds ?? ["acoustic_grand_piano"])
        .map((id) => findInstrument(id).id);
      const blob = await exportBackingCompositionMp3Offline(
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
        { includeMelody: true, onProgress: setProgress }
      );
      if (!blob) throw new Error("audio-busy");
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = audioRef.current;
      if (!audio) throw new Error("audio-unavailable");
      audio.src = url;
      setProgress(100);
      setPhase("playing");
      try {
        await audio.play();
        if (unlockedContext && unlockedContext.state !== "closed") await unlockedContext.close();
        playbackContextRef.current = null;
      } catch (autoplayError) {
        if (!unlockedContext) throw autoplayError;
        const decoded = await unlockedContext.decodeAudioData(await blob.arrayBuffer());
        const source = unlockedContext.createBufferSource();
        source.buffer = decoded;
        source.connect(unlockedContext.destination);
        source.addEventListener("ended", () => setPhase("ready"), { once: true });
        playbackSourceRef.current = source;
        source.start();
      }
    } catch (caught) {
      console.error(caught);
      setPhase("error");
      setError("음악을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    }
  }

  if (loadingSong) {
    return (
      <main className="qr-playback-page">
        <section className="qr-playback-card" role="status" aria-live="polite">
          <QrPageCloseButton />
          <div className="qr-playback-disc" aria-hidden="true"><FileMusic size={42} /></div>
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

  const generating = phase === "generating";
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

        <button type="button" className="qr-playback-start" disabled={generating}
          data-testid="qr-create-play" onClick={() => void createAndPlay()}>
          <PlayIcon playing={phase === "playing"} />
          {generating ? "음악 생성 중..." : phase === "playing" ? "재생 중" : "노래 재생"}
        </button>

        {(generating || progress === 100) && (
          <div className="qr-playback-progress" role="status" aria-live="polite">
            <div><strong>{generating ? "음악 생성 중" : "음악 생성 완료"}</strong><span>{progress}%</span></div>
            <progress max="100" value={progress} aria-label="음악 생성 진행률" />
            <small>{generating ? "가락과 반주를 하나의 MP3로 만들고 있어요." : "100% 완료되어 노래를 재생합니다."}</small>
          </div>
        )}

        <audio ref={audioRef} className={progress === 100 ? "qr-playback-audio is-ready" : "qr-playback-audio"}
          controls onPlay={() => setPhase("playing")} onPause={() => setPhase("ready")}
          onEnded={() => setPhase("ready")} />
        {error && <p className="qr-playback-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
