import { useEffect, useMemo, useRef, useState } from "react";
import { FileMusic, Music2, Square, X } from "lucide-react";
import { playComposition, stopPlayback, type PlaybackMeasure } from "../audio/player";
import { findHarmonyPreset } from "../music/harmonyPresets";
import { findAccompanimentStyle } from "../music/accompaniment";
import { findInstrument } from "../music/instruments";
import { toNumber } from "../music/rational";
import { pitchName } from "../music/score";
import type { NoteEvent } from "../music/types";
import type { SharedComposition } from "../music/share";
import PlayIcon from "./PlayIcon";
import "./QrSongPlayback.css";

type PlaybackPhase = "idle" | "loading" | "playing" | "error";

type PlaybackSegment = Readonly<{
  measureIndex: number;
  start: number;
  end: number;
}>;

type PlaybackNoteSegment = Readonly<{
  measureIndex: number;
  noteId: string;
  start: number;
  end: number;
}>;

function applyLegacyLyric(notes: readonly NoteEvent[], lyric: string | undefined): readonly NoteEvent[] {
  if (!lyric || notes.some((note) => note.lyric)) return notes;
  const syllables = Array.from(lyric.replace(/\s+/g, ""));
  let lyricIndex = 0;
  return notes.map((note) => note.pitch === null ? note : { ...note, lyric: syllables[lyricIndex++] ?? "" });
}

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
  const [playingMeasureIndex, setPlayingMeasureIndex] = useState<number | null>(null);
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);

  const playbackStartedAt = useRef<number>(0);
  const playbackDuration = useRef<number>(0);
  const playbackSegments = useRef<readonly PlaybackSegment[]>([]);
  const playbackNoteSegments = useRef<readonly PlaybackNoteSegment[]>([]);
  const playbackTicker = useRef<number | null>(null);
  const completionTimer = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

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

  const parsedMeasures = useMemo(() => {
    if (!activeComposition) return [];
    return activeComposition.measures.map((measure, index) => {
      const rawNotes = measure.notes ?? [];
      const notesWithLyric = applyLegacyLyric(rawNotes, activeComposition.lyrics?.[index]);
      const enrichedNotes = notesWithLyric.map((note) => {
        const isRest = note.pitch === null;
        const text = note.lyric?.trim();
        return {
          id: note.id,
          isRest,
          text: text || (isRest ? "·" : pitchName(note.pitch)),
          isPitchFallback: !text && !isRest
        };
      });
      return {
        measureIndex: index,
        notes: enrichedNotes
      };
    });
  }, [activeComposition]);

  function clearPlaybackTicker() {
    if (playbackTicker.current !== null) window.clearInterval(playbackTicker.current);
    playbackTicker.current = null;
  }

  function updatePlaybackPosition() {
    const elapsed = Math.max(0, performance.now() - playbackStartedAt.current) / 1000;
    const segment = playbackSegments.current.find((item) => elapsed >= item.start && elapsed < item.end);
    const noteSegment = playbackNoteSegments.current.find((item) => elapsed >= item.start && elapsed < item.end);
    setPlayingMeasureIndex(segment?.measureIndex ?? null);
    setPlayingNoteId(noteSegment?.noteId ?? null);
    if (elapsed >= playbackDuration.current) {
      clearPlaybackTicker();
      setPhase("idle");
      setPlayingMeasureIndex(null);
      setPlayingNoteId(null);
    }
  }

  function startPlaybackTicker() {
    clearPlaybackTicker();
    updatePlaybackPosition();
    playbackTicker.current = window.setInterval(updatePlaybackPosition, 40);
  }

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
    clearPlaybackTicker();
    if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
    void stopPlayback();
  }, []);

  useEffect(() => {
    if (playingMeasureIndex === null) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-measure-index="${playingMeasureIndex}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [playingMeasureIndex]);

  async function togglePlayback() {
    if (!activeComposition || phase === "loading") return;
    if (phase === "playing") {
      clearPlaybackTicker();
      if (completionTimer.current !== null) window.clearTimeout(completionTimer.current);
      await stopPlayback();
      setPhase("idle");
      setPlayingMeasureIndex(null);
      setPlayingNoteId(null);
      return;
    }
    setPhase("loading");
    setError("");
    try {
      const bpm = activeComposition.bpm ?? 96;
      const duration = await playComposition(playable, findInstrument(activeComposition.instrumentId).id,
        bpm, {
          styleId: findAccompanimentStyle(activeComposition.accompanimentStyleId ?? "arpeggio").id,
          instrumentIds: (activeComposition.accompanimentInstrumentIds ?? ["acoustic_grand_piano"])
            .map((id) => findInstrument(id).id),
          beatPattern: activeComposition.beatPattern,
          beatVolume: activeComposition.beatVolume,
          meter: activeComposition.meter
        });
      if (duration === null) throw new Error("audio-busy");

      const secondsPerBeat = 60 / bpm;
      let offsetSeconds = 0.08;
      const segments: PlaybackSegment[] = [];
      const noteSegments: PlaybackNoteSegment[] = [];

      playable.forEach((measure, measureIndex) => {
        const start = offsetSeconds;
        let noteOffset = start;
        measure.notes.forEach((note) => {
          const noteDuration = toNumber(note.duration) * secondsPerBeat;
          const noteEnd = noteOffset + noteDuration;
          noteSegments.push({ measureIndex, noteId: note.id, start: noteOffset, end: noteEnd });
          noteOffset = noteEnd;
        });
        const measureDuration = measure.notes.reduce((total, n) => total + toNumber(n.duration), 0) * secondsPerBeat;
        offsetSeconds += measureDuration;
        segments.push({ measureIndex, start, end: offsetSeconds });
      });

      playbackSegments.current = segments;
      playbackNoteSegments.current = noteSegments;
      playbackStartedAt.current = performance.now();
      playbackDuration.current = duration;

      setPhase("playing");
      startPlaybackTicker();
      completionTimer.current = window.setTimeout(() => {
        clearPlaybackTicker();
        setPhase("idle");
        setPlayingMeasureIndex(null);
        setPlayingNoteId(null);
      }, duration * 1000 + 150);
    } catch (caught) {
      console.error(caught);
      clearPlaybackTicker();
      setPhase("error");
      setPlayingMeasureIndex(null);
      setPlayingNoteId(null);
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

        <div className="qr-playback-lyrics-box" aria-label="실시간 가사 및 연주 위치">
          <div className="qr-playback-lyrics-header">
            <span className="qr-lyrics-title">가사 및 연주 위치</span>
            {phase === "playing" && playingMeasureIndex !== null ? (
              <span className="qr-lyrics-badge playing" role="status">
                <span className="qr-pulse-dot" aria-hidden="true" />
                {playingMeasureIndex + 1} / {activeComposition.songLength}마디 연주 중
              </span>
            ) : (
              <span className="qr-lyrics-badge">전체 {activeComposition.songLength}마디</span>
            )}
          </div>
          <div className="qr-lyrics-scroll" ref={scrollContainerRef}>
            {parsedMeasures.map((measure) => {
              const isMeasurePlaying = phase === "playing" && playingMeasureIndex === measure.measureIndex;
              return (
                <div
                  key={measure.measureIndex}
                  data-measure-index={measure.measureIndex}
                  data-testid={`qr-measure-${measure.measureIndex}`}
                  className={`qr-lyric-card${isMeasurePlaying ? " playing" : ""}`}
                >
                  <div className="qr-lyric-card-header">
                    <strong>{measure.measureIndex + 1}마디</strong>
                    {isMeasurePlaying && <span className="qr-lyric-playing-label">연주 중 ♪</span>}
                  </div>
                  <div className="qr-lyric-tokens">
                    {measure.notes.map((note) => {
                      const isNotePlaying = isMeasurePlaying && playingNoteId === note.id;
                      return (
                        <span
                          key={note.id}
                          data-note-id={note.id}
                          className={`qr-lyric-token${isNotePlaying ? " active" : ""}${note.isRest ? " is-rest" : ""}${note.isPitchFallback ? " is-pitch" : ""}`}
                        >
                          {note.text}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
