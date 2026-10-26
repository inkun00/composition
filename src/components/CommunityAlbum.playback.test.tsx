// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityAlbum as Album, PublishedSong } from "../firebase/communityAlbums";
import type { SavedDraft } from "../music/draft";
import { createPublishedSongPlaybackStore, type PublishedSongPlaybackStore } from "../music/publishedSongPlaybackState";
import CommunityAlbum from "./CommunityAlbum";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const firebaseMocks = vi.hoisted(() => ({
  listCommunityAlbums: vi.fn(),
  listPublishedSongs: vi.fn()
}));
vi.mock("../firebase/communityAlbums", () => firebaseMocks);
vi.mock("./PdfScoreSheet", () => ({ default: () => <div>악보 미리보기</div> }));

const album: Album = {
  id: "album-1", name: "우리 반 노래", ownerId: "owner", ownerName: "작곡가",
  locked: false, createdAt: 1, updatedAt: 1
};
const draft: SavedDraft = {
  version: 1, updatedAt: 1, sourceHash: "", title: "첫 번째 노래", description: "",
  creator: "작곡가", originalCreator: "작곡가", presetId: "H001",
  meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano",
  accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"], bpm: 96,
  lyrics: Array.from({ length: 8 }, () => ""),
  measures: Array.from({ length: 8 }, (_, index) => ({
    candidateId: `candidate-${index}`, candidateName: "가락",
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 1, denominator: 1 } }]
  })),
  showArrangement: true
};
const firstSong: PublishedSong = {
  id: "song-1", albumId: album.id, ownerId: "owner", ownerName: "작곡가", sourceScoreId: "score-1",
  title: "첫 번째 노래", creator: "작곡가", access: "project", publishedAt: 1, updatedAt: 1, draft
};
const secondSong: PublishedSong = { ...firstSong, id: "song-2", title: "두 번째 노래" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let root: Root | null;
let container: HTMLDivElement;
let onStop: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;
let onOpenProject: ReturnType<typeof vi.fn>;

function button(name: string, scope: ParentNode = container): HTMLButtonElement {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.getAttribute("aria-label") === name || item.textContent?.trim() === name);
  if (!result) throw new Error(`Missing button: ${name}`);
  return result;
}

async function click(name: string, scope: ParentNode = container) {
  await act(async () => button(name, scope).click());
}

async function flush() {
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
}

async function mount(onPlay: (song: PublishedSong) => Promise<boolean>, playbackStore?: PublishedSongPlaybackStore) {
  root = createRoot(container);
  await act(async () => root!.render(<CommunityAlbum configured user={null} onClose={onClose}
    onRequestLogin={() => undefined} onPlay={onPlay} onStop={onStop} playbackStore={playbackStore}
    onOpenProject={onOpenProject} />));
  await flush();
  await click("우리 반 노래작곡가의 앨범");
  await flush();
  const songButton = container.querySelector<HTMLButtonElement>(".community-song");
  await act(async () => songButton!.click());
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = null;
  onStop = vi.fn();
  onClose = vi.fn();
  onOpenProject = vi.fn();
  firebaseMocks.listCommunityAlbums.mockResolvedValue([album]);
  firebaseMocks.listPublishedSongs.mockResolvedValue([firstSong, secondSong]);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

describe("모두의 앨범 재생 중단", () => {
  it("음원을 준비하는 동안에도 같은 버튼으로 즉시 중단할 수 있다", async () => {
    const playback = deferred<boolean>();
    const onPlay = vi.fn(() => playback.promise);
    await mount(onPlay);
    await click("재생하기");
    expect(button("재생 중단").disabled).toBe(false);
    expect(button("재생 중단").querySelector('[data-app-artwork="rectangle"]')).not.toBeNull();
    await click("재생 중단");
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(button("재생하기").disabled).toBe(false);
    await act(async () => playback.resolve(true));
    expect(container.textContent).not.toContain("다른 음악이 끝난 뒤");
  });

  it("자연 종료 후 재생 버튼을 되돌리고 별도의 정지를 요청하지 않는다", async () => {
    const playback = deferred<boolean>();
    await mount(() => playback.promise);
    await click("재생하기");
    await act(async () => playback.resolve(true));
    expect(button("재생하기").getAttribute("aria-pressed")).toBe("false");
    expect(onStop).not.toHaveBeenCalled();
    await click("음악 메뉴 닫기");
    expect(onStop).not.toHaveBeenCalled();
  });

  it("다른 음악 때문에 시작하지 못하면 재생 버튼과 안내를 표시한다", async () => {
    await mount(vi.fn().mockResolvedValue(false));
    await click("재생하기");
    expect(button("재생하기").disabled).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("다른 음악이 끝난 뒤");
  });

  it("재생 오류를 처리하여 재시도할 수 있게 안내한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await mount(vi.fn().mockRejectedValue(new Error("audio failed")));
    await click("재생하기");
    expect(button("재생하기").disabled).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("음악을 재생하지 못했어요");
  });

  it.each(["resolve", "reject"] as const)("중단한 이전 재생의 늦은 %s가 새 재생을 지우지 않는다", async (settlement) => {
    const oldPlayback = deferred<boolean>();
    const newPlayback = deferred<boolean>();
    const onPlay = vi.fn().mockReturnValueOnce(oldPlayback.promise).mockReturnValueOnce(newPlayback.promise);
    await mount(onPlay);
    await click("재생하기");
    await click("재생 중단");
    await click("재생하기");
    await act(async () => {
      if (settlement === "resolve") oldPlayback.resolve(false);
      else oldPlayback.reject(new Error("stale audio failure"));
    });
    expect(button("재생 중단").disabled).toBe(false);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(onStop).toHaveBeenCalledTimes(1);
    await act(async () => newPlayback.resolve(true));
  });

  it.each(["닫기 버튼", "배경", "Escape"] as const)("음악 메뉴를 %s으로 닫으면 재생을 중단한다", async (method) => {
    const playback = deferred<boolean>();
    await mount(() => playback.promise);
    await click("재생하기");
    if (method === "닫기 버튼") await click("음악 메뉴 닫기");
    else if (method === "배경") {
      const overlay = container.querySelector('[aria-label="첫 번째 노래 음악 메뉴"]');
      await act(async () => overlay!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    } else {
      await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    }
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-label="첫 번째 노래 음악 메뉴"]')).toBeNull();
    await act(async () => playback.resolve(false));
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("앨범 창을 닫고 언마운트해도 같은 재생을 두 번 중단하지 않는다", async () => {
    await mount(() => deferred<boolean>().promise);
    await click("재생하기");
    await click("모두의 앨범 닫기");
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root!.unmount());
    root = null;
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("외부에서 앨범을 언마운트해도 이 앨범에서 시작한 재생을 중단한다", async () => {
    await mount(() => deferred<boolean>().promise);
    await click("재생하기");
    act(() => root!.unmount());
    root = null;
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("앨범에서 재생을 시작하지 않았다면 닫아도 다른 음악을 중단하지 않는다", async () => {
    await mount(vi.fn().mockResolvedValue(true));
    await click("모두의 앨범 닫기");
    act(() => root!.unmount());
    root = null;
    expect(onStop).not.toHaveBeenCalled();
  });

  it("다른 노래로 바꾸면 이전 곡을 중단하고 이전 종료 알림을 무시한다", async () => {
    const oldPlayback = deferred<boolean>();
    const newPlayback = deferred<boolean>();
    const onPlay = vi.fn().mockReturnValueOnce(oldPlayback.promise).mockReturnValueOnce(newPlayback.promise);
    await mount(onPlay);
    await click("재생하기");
    const songButtons = container.querySelectorAll<HTMLButtonElement>(".community-song");
    await act(async () => songButtons[1].click());
    expect(onStop).toHaveBeenCalledTimes(1);
    await click("재생하기");
    expect(onPlay).toHaveBeenLastCalledWith(secondSong);
    await act(async () => oldPlayback.resolve(false));
    expect(button("재생 중단").disabled).toBe(false);
    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(async () => newPlayback.resolve(true));
  });

  it("악보를 보는 동안 음악을 유지하며 악보 헤더에서도 중단할 수 있다", async () => {
    await mount(() => deferred<boolean>().promise);
    await click("재생하기");
    await click("악보 보기");
    const score = container.querySelector('[aria-label="첫 번째 노래 악보"]')!;
    expect(onStop).not.toHaveBeenCalled();
    await click("재생 중단", score);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(score.querySelector(".album-score-stop")).toBeNull();
    await click("악보 닫기");
    expect(button("재생하기").disabled).toBe(false);
  });

  it("악보만 닫을 때는 음악을 계속 재생한다", async () => {
    await mount(() => deferred<boolean>().promise);
    await click("재생하기");
    await click("악보 보기");
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onStop).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="첫 번째 노래 악보"]')).toBeNull();
    expect(button("재생 중단").disabled).toBe(false);
  });

  it("공개 프로젝트를 열면 앨범 재생을 먼저 중단한다", async () => {
    await mount(() => deferred<boolean>().promise);
    await click("재생하기");
    await click("프로젝트 보기");
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onOpenProject).toHaveBeenCalledWith(firstSong);
  });

  it("음악만 공개한 곡도 전체 가사와 현재 음절을 보여주며 중단하면 강조를 지운다", async () => {
    const lyricsSong = { ...firstSong, access: "audio" as const, draft: {
      ...draft, lyrics: ["나", "의", "노", "래", "함", "께", "불", "러"]
    } };
    firebaseMocks.listPublishedSongs.mockResolvedValue([lyricsSong]);
    const store = createPublishedSongPlaybackStore();
    onStop = vi.fn(() => store.publish(null));
    await mount(async () => {
      store.publish({ songId: firstSong.id, phase: "playing", elapsedSeconds: 0.1, durationSeconds: 5 });
      return deferred<boolean>().promise;
    }, store);
    const panel = container.querySelector('[aria-label="노래 가사"]')!;
    expect(panel.querySelectorAll(".album-lyrics-line")).toHaveLength(8);
    expect(panel.querySelector(".album-lyrics-text")?.textContent).toBe("나");
    expect(button("악보 보기").disabled).toBe(true);
    await click("재생하기");
    expect(panel.querySelector('[data-note-id="note-0"]')?.getAttribute("aria-current")).toBe("true");
    await click("재생 중단");
    expect(panel.querySelector('[aria-current="true"]')).toBeNull();
    expect(panel.getAttribute("data-phase")).toBe("idle");
  });

  it("악보 화면과 음악 메뉴가 같은 재생 위치의 가사를 함께 표시한다", async () => {
    firebaseMocks.listPublishedSongs.mockResolvedValue([{ ...firstSong, draft: {
      ...draft, lyrics: ["나", "의", "노", "래", "함", "께", "불", "러"]
    } }]);
    const store = createPublishedSongPlaybackStore();
    await mount(() => deferred<boolean>().promise, store);
    await click("재생하기");
    await click("악보 보기");
    act(() => store.publish({ songId: firstSong.id, phase: "playing", elapsedSeconds: 1.3, durationSeconds: 5 }));
    const panels = [...container.querySelectorAll('[data-testid="community-lyrics"]')];
    expect(panels).toHaveLength(2);
    for (const panel of panels) {
      expect(panel.querySelector('[data-note-id="note-2"]')?.getAttribute("aria-current")).toBe("true");
      expect(panel.textContent).toContain("3마디 재생 중");
    }
    const scorePanel = container.querySelector('[aria-label="악보와 함께 보는 가사"]');
    expect(scorePanel?.classList.contains("is-compact")).toBe(true);
  });
});
