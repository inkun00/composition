// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { PublishedSong } from "../firebase/communityAlbums";
import type { SavedDraft } from "../music/draft";
import CommunityPlaybackDialog, {
  publishedLyricRows,
  publishedPlaybackMeasureIndex
} from "./CommunityPlaybackDialog";
import { publishedPlaybackPosition } from "./communityPlaybackTiming";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function lyricSong(): PublishedSong {
  const draft: SavedDraft = {
    version: 1,
    updatedAt: 1,
    sourceHash: "",
    title: "우리의 노래",
    description: "",
    creator: "민지",
    originalCreator: "민지",
    presetId: "H001",
    meter: { beats: 4, beatUnit: 4 },
    songLength: 8,
    instrumentId: "piano",
    accompanimentStyleId: "arpeggio",
    accompanimentInstrumentIds: ["piano"],
    bpm: 96,
    lyrics: ["예전 가사", "함께 걸어가", "", "", "", "", "", ""],
    measures: [
      {
        candidateId: null,
        candidateName: null,
        notes: [
          { id: "n1", pitch: 60, duration: { numerator: 1, denominator: 1 }, lyric: "우" },
          { id: "n2", pitch: 62, duration: { numerator: 1, denominator: 1 }, lyric: "리" }
        ]
      },
      {
        candidateId: null,
        candidateName: null,
        notes: [
          { id: "n3", pitch: 64, duration: { numerator: 1, denominator: 1 } }
        ]
      },
      ...Array.from({ length: 6 }, () => ({
        candidateId: null,
        candidateName: null,
        notes: null
      }))
    ],
    showArrangement: true
  };
  return {
    id: "song-lyrics",
    albumId: "album-1",
    ownerId: "user-1",
    ownerName: "민지",
    sourceScoreId: "score-1",
    title: "우리의 노래",
    creator: "민지",
    access: "audio",
    publishedAt: 1,
    updatedAt: 1,
    draft
  };
}

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

describe("모두의 앨범 재생 가사 창", () => {
  it("음표 가사를 우선하고 네 마디씩 한 줄로 묶는다", () => {
    expect(publishedLyricRows(lyricSong())).toEqual([
      {
        startMeasure: 1,
        endMeasure: 4,
        text: "우리 함께 걸어가",
        measures: [
          { measure: 1, text: "우리" },
          { measure: 2, text: "함께 걸어가" }
        ]
      }
    ]);
  });

  it("BPM과 박자표를 기준으로 현재 재생 마디를 계산한다", () => {
    const song = lyricSong();
    const startedAt = 10_000;
    const quarterNoteMs = 625;

    expect(publishedPlaybackMeasureIndex(song, startedAt, startedAt - 1)).toBeNull();
    expect(publishedPlaybackMeasureIndex(song, startedAt, startedAt)).toBe(0);
    expect(publishedPlaybackMeasureIndex(song, startedAt, startedAt + quarterNoteMs * 3)).toBe(2);
    expect(publishedPlaybackMeasureIndex(song, startedAt, startedAt + quarterNoteMs * 27)).toBeNull();
  });

  it("현재 연주 중인 음표의 가사 위치를 찾는다", () => {
    const song = lyricSong();
    const startedAt = 10_000;

    expect(publishedPlaybackPosition(song, startedAt, startedAt + 100)?.noteId).toBe("n1");
    expect(publishedPlaybackPosition(song, startedAt, startedAt + 700)?.noteId).toBe("n2");
  });

  it("재생 팝업에 제목과 네 마디 단위 가사를 보여준다", () => {
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const song = lyricSong();
    act(() => root.render(
      <CommunityPlaybackDialog
        song={song}
        loading={false}
        startedAt={Date.now()}
        error=""
        onClose={() => undefined}
      />
    ));

    expect(container.querySelector('[aria-label="우리의 노래 가사와 재생"]')).not.toBeNull();
    expect(container.textContent).toContain("우리");
    expect(container.textContent).toContain("함께 걸어가");
    expect(container.textContent).toContain("1~4마디");
    expect(container.querySelectorAll(".community-playback-lyric-list li")).toHaveLength(1);
    expect(container.querySelectorAll(".community-playback-lyric-measure")).toHaveLength(2);
    expect(container.querySelector(".community-playback-lyric-measure.is-active")?.textContent).toBe("우리");
    expect(container.querySelector(".community-playback-lyric-measure.is-active")?.getAttribute("aria-current")).toBe("true");
    expect(container.textContent).toContain("노래가 재생되고 있어요.");

    act(() => root.render(
      <CommunityPlaybackDialog
        song={song}
        loading={false}
        startedAt={Date.now() - 1_300}
        error=""
        onClose={() => undefined}
      />
    ));
    expect(container.querySelector(".community-playback-lyric-measure.is-active")?.textContent).toBe("함께 걸어가");

    act(() => root.unmount());
  });
});
