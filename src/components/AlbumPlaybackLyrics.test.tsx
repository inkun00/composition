// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedSong } from "../firebase/communityAlbums";
import type { SavedDraft } from "../music/draft";
import { createPublishedSongPlaybackStore } from "../music/publishedSongPlaybackState";
import AlbumPlaybackLyrics from "./AlbumPlaybackLyrics";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const draft: SavedDraft = {
  version: 1, updatedAt: 1, sourceHash: "", title: "햇살 노래", creator: "작곡가", originalCreator: "작곡가",
  presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano", bpm: 60,
  lyrics: Array.from({ length: 8 }, () => ""), showArrangement: true,
  measures: Array.from({ length: 8 }, (_, index) => ({
    candidateId: `measure-${index}`, candidateName: "가락",
    notes: index === 0 ? [
      { id: "sun", pitch: 60, duration: { numerator: 1, denominator: 1 }, lyric: "햇" },
      { id: "shine", pitch: 62, duration: { numerator: 1, denominator: 1 }, lyric: "살 " },
      { id: "rest", pitch: null, duration: { numerator: 1, denominator: 1 } },
      { id: "song", pitch: 64, duration: { numerator: 1, denominator: 1 }, lyric: "아" }
    ] : [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: index === 1 ? "안녕" : "" }]
  }))
};
const song: PublishedSong = {
  id: "song-1", albumId: "album", ownerId: "owner", ownerName: "작곡가", sourceScoreId: "score",
  title: "햇살 노래", creator: "작곡가", access: "audio", publishedAt: 1, updatedAt: 1, draft
};

let container: HTMLDivElement;
let root: Root;
let store: ReturnType<typeof createPublishedSongPlaybackStore>;

function mount(currentSong = song, compact = false) {
  act(() => root.render(<AlbumPlaybackLyrics song={currentSong} store={store} compact={compact} />));
}

function update(elapsedSeconds: number, phase: "preparing" | "playing" = "playing", songId = song.id) {
  act(() => store.publish({ songId, phase, elapsedSeconds, durationSeconds: phase === "preparing" ? 0 : 32 }));
}

function activeNote(): string | null | undefined {
  return container.querySelector('[data-note-id][aria-current="true"]')?.getAttribute("data-note-id");
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  store = createPublishedSongPlaybackStore();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("앨범 재생 가사", () => {
  it("재생 전에 전체 가사를 보여주고 띄어쓰기를 유지한다", () => {
    mount();
    expect(container.querySelectorAll(".album-lyrics-line")).toHaveLength(8);
    expect(container.querySelector(".album-lyrics-text")?.textContent).toBe("햇살 아");
    expect(container.textContent).toContain("안녕");
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    expect(container.querySelector('[aria-label="재생 시간"]')?.textContent).toBe("0:00 / 0:32");
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("0");
  });

  it("준비 중에는 음절을 강조하지 않고 예상 전체 시간을 유지한다", () => {
    mount();
    update(0, "preparing");
    expect(container.textContent).toContain("음악을 준비하고 있어요");
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    expect(container.querySelector('[aria-label="재생 시간"]')?.textContent).toBe("0:00 / 0:32");
  });

  it("시간에 맞춰 마디와 음절을 이동시키며 쉼표에서는 음절 강조를 해제한다", () => {
    mount();
    update(0);
    expect(activeNote()).toBe("sun");
    update(1);
    expect(activeNote()).toBe("shine");
    update(2);
    expect(activeNote()).toBeUndefined();
    expect(container.querySelector('[data-measure-index="0"]')?.getAttribute("aria-current")).toBe("true");
    expect(container.textContent).toContain("가사 쉬는 구간");
    update(4);
    expect(activeNote()).toBe("note-1");
    expect(container.querySelector('[data-measure-index="1"]')?.getAttribute("aria-current")).toBe("true");
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("13");
  });

  it("가사 없는 마디와 반주곡에서도 현재 재생 마디와 시간을 보여준다", () => {
    const instrumental = { ...song, draft: { ...draft, measures: draft.measures.map((measure) => ({
      ...measure, notes: measure.notes?.map((note) => ({ ...note, lyric: "" })) ?? null
    })) } };
    mount(instrumental);
    update(8);
    expect(container.textContent).toContain("이 노래에는 입력된 가사가 없어요");
    expect(container.textContent).toContain("3마디 재생 중 · 가사 없는 마디");
    expect(container.querySelector('[data-measure-index="2"]')?.getAttribute("aria-current")).toBe("true");
    expect(activeNote()).toBeUndefined();
    expect(container.querySelector('[aria-label="재생 시간"]')?.textContent).toBe("0:08 / 0:32");
  });

  it("중단하면 강조와 시간을 초기화하고 다시 재생하면 처음 음절부터 표시한다", () => {
    mount();
    update(4);
    act(() => store.publish(null));
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    expect(container.querySelector('[data-testid="community-lyrics"]')?.getAttribute("data-phase")).toBe("idle");
    expect(container.querySelector('[aria-label="재생 시간"]')?.textContent).toBe("0:00 / 0:32");
    update(0);
    expect(activeNote()).toBe("sun");
  });

  it("다른 노래의 재생 상태를 표시하지 않고 여운 구간은 마무리 중으로 안내한다", () => {
    mount();
    update(4, "playing", "another-song");
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    expect(container.querySelector('[data-testid="community-lyrics"]')?.getAttribute("data-phase")).toBe("idle");
    update(32);
    expect(container.textContent).toContain("연주를 마무리하고 있어요");
    expect(container.querySelector('[aria-current="true"]')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
  });

  it("현재 마디가 바뀌면 가사 영역 안에서만 스크롤한다", () => {
    mount();
    const viewport = container.querySelector<HTMLDivElement>(".album-lyrics-viewport")!;
    const row = container.querySelector<HTMLLIElement>('[data-measure-index="1"]')!;
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 100, height: 100 } as DOMRect);
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({ top: 120, bottom: 164, height: 44 } as DOMRect);
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 100 });
    const pageScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    update(4);
    expect(viewport.scrollTop).toBe(92);
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it("부모 화면을 다시 그리지 않고 가사 패널만 구독한다", () => {
    const parentRender = vi.fn();
    function Parent() {
      parentRender();
      return <AlbumPlaybackLyrics song={song} store={store} compact />;
    }
    act(() => root.render(<Parent />));
    update(0);
    update(1);
    expect(parentRender).toHaveBeenCalledTimes(1);
    expect(activeNote()).toBe("shine");
    expect(container.querySelector(".is-compact")).not.toBeNull();
    expect(container.querySelector('[aria-live="off"]')).not.toBeNull();
  });
});
