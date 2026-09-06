import { useEffect, useState } from "react";
import { FileMusic, X } from "lucide-react";
import type { PublishedSong } from "../firebase/communityAlbums";
import { publishedPlaybackMeasureIndex } from "./communityPlaybackTiming";
import "./CommunityPlaybackDialog.css";

export { publishedPlaybackMeasureIndex } from "./communityPlaybackTiming";

type CommunityPlaybackDialogProps = Readonly<{
  song: PublishedSong;
  loading: boolean;
  startedAt: number | null;
  error: string;
  onClose: () => void;
}>;

export type PublishedLyricMeasure = Readonly<{
  measure: number;
  text: string;
}>;

export type PublishedLyricRow = Readonly<{
  startMeasure: number;
  endMeasure: number;
  text: string;
  measures: readonly PublishedLyricMeasure[];
}>;

function publishedMeasureLyric(song: PublishedSong, index: number) {
  const measure = song.draft.measures[index];
  if (!measure) return "";
  const noteLyrics = measure.notes
    ?.filter((note) => note.pitch !== null)
    .map((note) => note.lyric?.trim() ?? "")
    .join("")
    .trim();
  return noteLyrics || song.draft.lyrics[index]?.trim() || "";
}

export function publishedLyricRows(song: PublishedSong): PublishedLyricRow[] {
  return Array.from({ length: Math.ceil(song.draft.measures.length / 4) }, (_, rowIndex) => {
    const startIndex = rowIndex * 4;
    const endIndex = Math.min(startIndex + 4, song.draft.measures.length);
    const measures = song.draft.measures
      .slice(startIndex, endIndex)
      .map((_, index) => ({
        measure: startIndex + index + 1,
        text: publishedMeasureLyric(song, startIndex + index)
      }))
      .filter((measure) => measure.text);
    return {
      startMeasure: startIndex + 1,
      endMeasure: endIndex,
      text: measures.map((measure) => measure.text).join(" "),
      measures
    };
  }).filter((row) => row.measures.length > 0);
}

export default function CommunityPlaybackDialog({
  song,
  loading,
  startedAt,
  error,
  onClose
}: CommunityPlaybackDialogProps) {
  const lyrics = publishedLyricRows(song);
  const [activeMeasureIndex, setActiveMeasureIndex] = useState<number | null>(() =>
    publishedPlaybackMeasureIndex(song, startedAt)
  );

  useEffect(() => {
    const updateActiveMeasure = () => {
      setActiveMeasureIndex(publishedPlaybackMeasureIndex(song, startedAt));
    };
    updateActiveMeasure();
    if (startedAt === null || error) return;
    const timer = window.setInterval(updateActiveMeasure, 100);
    return () => window.clearInterval(timer);
  }, [error, song, startedAt]);

  return (
    <div
      className="album-subdialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${song.title} 가사와 재생`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="album-subdialog community-playback-dialog">
        <header className="album-subdialog-header">
          <div>
            <FileMusic size={20} />
            <span>
              <strong>{song.title || "제목 없는 노래"}</strong>
              <small>{song.creator || song.ownerName} 작곡 · {song.draft.songLength}마디</small>
            </span>
          </div>
          <button type="button" aria-label="재생 가사 창 닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div className="community-playback-body">
          <div className={`community-playback-status${loading ? " is-loading" : ""}`} role="status">
            <span className="community-playback-status-dot" aria-hidden="true" />
            {loading ? "노래를 준비하고 있어요…" : error ? "노래를 재생하지 못했어요." : "노래가 재생되고 있어요."}
          </div>

          <section className="community-playback-lyrics" aria-labelledby="community-playback-lyrics-heading">
            <h3 id="community-playback-lyrics-heading">가사</h3>
            {lyrics.length > 0 ? (
              <ol className="community-playback-lyric-list">
                {lyrics.map((line) => (
                  <li key={line.startMeasure}>
                    <small>{line.startMeasure}~{line.endMeasure}마디</small>
                    <span className="community-playback-lyric-measures">
                      {line.measures.map((measure) => {
                        const isActive = activeMeasureIndex === measure.measure - 1;
                        return (
                          <span
                            className={`community-playback-lyric-measure${isActive ? " is-active" : ""}`}
                            aria-current={isActive ? "true" : undefined}
                            title={`${measure.measure}마디`}
                            key={measure.measure}
                          >
                            {measure.text}
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="community-playback-empty">아직 적힌 가사가 없어요.</p>
            )}
          </section>

          {error && <p className="community-playback-error">{error}</p>}
        </div>
      </section>
    </div>
  );
}
