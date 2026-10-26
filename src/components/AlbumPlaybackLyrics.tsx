import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { PublishedSong } from "../firebase/communityAlbums";
import {
  buildPublishedSongLyrics,
  findPublishedSongLyricPosition
} from "../music/publishedSongLyrics";
import {
  EMPTY_PUBLISHED_SONG_PLAYBACK_STORE,
  type PublishedSongPlaybackStore
} from "../music/publishedSongPlaybackState";
import "./AlbumPlaybackLyrics.css";

type Props = Readonly<{
  song: PublishedSong;
  store?: PublishedSongPlaybackStore;
  compact?: boolean;
}>;

type LyricPart = Readonly<{ text: string; segmentIndex: number | null }>;

function lyricParts(text: string, segments: readonly Readonly<{ text: string }>[]): readonly LyricPart[] {
  const parts: LyricPart[] = [];
  let cursor = 0;
  for (const [segmentIndex, segment] of segments.entries()) {
    const position = text.indexOf(segment.text, cursor);
    if (!segment.text || position < 0) return [{ text, segmentIndex: null }];
    if (position > cursor) parts.push({ text: text.slice(cursor, position), segmentIndex: null });
    parts.push({ text: segment.text, segmentIndex });
    cursor = position + segment.text.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), segmentIndex: null });
  return parts;
}

function clock(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export default function AlbumPlaybackLyrics({ song, store, compact = false }: Props) {
  const playbackStore = store ?? EMPTY_PUBLISHED_SONG_PLAYBACK_STORE;
  const snapshot = useSyncExternalStore(playbackStore.subscribe, playbackStore.getSnapshot, playbackStore.getSnapshot);
  const playback = snapshot?.songId === song.id ? snapshot : null;
  const timeline = useMemo(() => buildPublishedSongLyrics(song.draft), [song.draft]);
  const parts = useMemo(() => timeline.lines.map((line) => lyricParts(line.text, line.segments)), [timeline]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const phase = playback?.phase ?? "idle";
  const duration = playback && playback.durationSeconds > 0 ? playback.durationSeconds : timeline.durationSeconds;
  const elapsed = playback ? Math.max(0, Math.min(playback.elapsedSeconds, duration)) : 0;
  const position = phase === "playing" ? findPublishedSongLyricPosition(timeline, elapsed) : null;
  const activeMeasureIndex = position?.measureIndex ?? null;
  const activeLine = activeMeasureIndex === null ? null : timeline.lines[activeMeasureIndex];
  const progress = duration > 0 ? Math.min(100, elapsed / duration * 100) : 0;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || activeMeasureIndex === null) return;
    const row = viewport.querySelector<HTMLElement>(`[data-measure-index="${activeMeasureIndex}"]`);
    if (!row) return;
    const viewportBounds = viewport.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    if (rowBounds.top < viewportBounds.top || rowBounds.bottom > viewportBounds.bottom) {
      viewport.scrollTop += rowBounds.top - viewportBounds.top - (viewport.clientHeight - rowBounds.height) / 2;
    }
  }, [activeMeasureIndex, song.id]);

  let status = "재생하면 현재 가사를 따라 보여드려요";
  if (phase === "preparing") status = "음악을 준비하고 있어요";
  else if (phase === "playing" && elapsed >= timeline.durationSeconds) status = "연주를 마무리하고 있어요";
  else if (activeMeasureIndex !== null) {
    status = `${activeMeasureIndex + 1}마디 재생 중`;
    if (!activeLine?.text.trim()) status += " · 가사 없는 마디";
    else if (position?.activeSegmentIndex === null) status += " · 가사 쉬는 구간";
  }

  return (
    <section className={`album-playback-lyrics${compact ? " is-compact" : ""}`}
      aria-label={compact ? "악보와 함께 보는 가사" : "노래 가사"} aria-live="off"
      data-testid="community-lyrics" data-phase={phase} data-elapsed-seconds={elapsed}>
      <header className="album-lyrics-heading">
        <div><strong>가사</strong><span className={`album-lyrics-status is-${phase}`}>{status}</span></div>
        <span className="album-lyrics-clock" aria-label="재생 시간">{clock(elapsed)} / {clock(duration)}</span>
      </header>
      <div className="album-lyrics-progress" role="progressbar" aria-label="노래 재생 진행률"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      {!timeline.hasLyrics && <p className="album-lyrics-empty">이 노래에는 입력된 가사가 없어요. 재생되는 마디를 확인할 수 있어요.</p>}
      <div ref={viewportRef} className="album-lyrics-viewport" tabIndex={0} aria-label="마디별 전체 가사">
        <ol className="album-lyrics-lines">
          {timeline.lines.map((line, lineIndex) => {
            const active = line.measureIndex === activeMeasureIndex;
            return (
              <li key={line.measureIndex} className={`album-lyrics-line${active ? " is-current" : ""}`}
                data-measure-index={line.measureIndex} aria-current={active ? "true" : undefined}>
                <span className="album-lyrics-measure">{line.measureIndex + 1}<span>마디</span></span>
                <span className={`album-lyrics-text${line.text.trim() ? "" : " is-empty"}`}>
                  {line.text.trim() ? parts[lineIndex].map((part, partIndex) => {
                    const segment = part.segmentIndex === null ? null : line.segments[part.segmentIndex];
                    const current = active && part.segmentIndex !== null && part.segmentIndex === position?.activeSegmentIndex;
                    return <span key={partIndex} className={current ? "album-lyric-syllable is-current" : "album-lyric-syllable"}
                      data-note-id={segment?.noteId} aria-current={current ? "true" : undefined}>{part.text}</span>;
                  }) : "가사 없는 마디"}
                </span>
                {active && <span className="album-lyrics-playing-mark" aria-hidden="true"><i /><i /><i /></span>}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
