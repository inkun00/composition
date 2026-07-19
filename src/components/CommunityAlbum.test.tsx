// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../firebase/client";
import type { CommunityAlbum as Album, PublishedSong } from "../firebase/communityAlbums";
import type { CloudScore } from "../firebase/scores";
import type { SavedDraft } from "../music/draft";
import CommunityAlbum from "./CommunityAlbum";
import PublishScoreDialog from "./PublishScoreDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const firebaseMocks = vi.hoisted(() => ({
  listCommunityAlbums: vi.fn(),
  createCommunityAlbum: vi.fn(),
  listPublishedSongs: vi.fn(),
  publishScoreToAlbum: vi.fn(),
  updatePublishedSongAccess: vi.fn(),
  removePublishedSong: vi.fn(),
  deleteCommunityAlbum: vi.fn()
}));

vi.mock("../firebase/communityAlbums", () => firebaseMocks);

const album: Album = {
  id: "album-1",
  name: "우리 반 노래",
  ownerId: "user-1",
  ownerName: "민준",
  createdAt: 1,
  updatedAt: 1
};

const draft: SavedDraft = {
  version: 1,
  updatedAt: 1,
  sourceHash: "",
  title: "햇살 노래",
  description: "",
  creator: "민준",
  originalCreator: "민준",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 8,
  instrumentId: "piano",
  accompanimentStyleId: "arpeggio",
  accompanimentInstrumentIds: ["piano"],
  bpm: 96,
  lyrics: Array.from({ length: 8 }, () => ""),
  measures: Array.from({ length: 8 }, (_, index) => ({
    candidateId: `candidate-${index}`,
    candidateName: "가락",
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 1, denominator: 1 } }]
  })),
  showArrangement: true
};

const song: PublishedSong = {
  id: "song-1",
  albumId: album.id,
  ownerId: "user-2",
  ownerName: "서연",
  sourceScoreId: "score-1",
  title: draft.title,
  creator: draft.creator,
  access: "audio",
  publishedAt: 1,
  updatedAt: 1,
  draft
};

const score: CloudScore = {
  id: "score-1",
  title: draft.title,
  creator: draft.creator,
  songLength: 8,
  updatedAt: 1,
  draft
};

const user = { uid: "user-1", email: "student@example.com", displayName: "민준" } as User;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(node: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

async function flush() {
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...(container?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    .find((button) => button.textContent?.trim() === name);
}

function buttonContaining(name: string): HTMLButtonElement | undefined {
  return [...(container?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    .find((button) => button.textContent?.includes(name));
}

beforeEach(() => {
  Object.values(firebaseMocks).forEach((mock) => mock.mockReset());
  firebaseMocks.listCommunityAlbums.mockResolvedValue([album]);
  firebaseMocks.listPublishedSongs.mockResolvedValue([song]);
  firebaseMocks.createCommunityAlbum.mockResolvedValue(album);
  firebaseMocks.publishScoreToAlbum.mockResolvedValue(undefined);
  firebaseMocks.deleteCommunityAlbum.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.restoreAllMocks();
  root = null;
  container = null;
});

describe("모두의 앨범", () => {
  it("앨범 폴더를 열고 공개 범위에 맞는 음악 버튼을 보여준다", async () => {
    const onPlay = vi.fn().mockResolvedValue(true);
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={onPlay} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => buttonContaining(album.name)?.click());
    await flush();
    await act(async () => buttonContaining(song.title)?.click());

    expect(buttonNamed("재생하기")?.disabled).toBe(false);
    expect(buttonNamed("악보 보기")?.disabled).toBe(true);
    expect(buttonNamed("프로젝트 보기")?.disabled).toBe(true);
    await act(async () => buttonNamed("재생하기")?.click());
    expect(onPlay).toHaveBeenCalledWith(song);
  });

  it("앨범 만들기 창에서 입력한 이름으로 앨범을 생성한다", async () => {
    firebaseMocks.listCommunityAlbums.mockResolvedValue([]);
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => buttonNamed("앨범 만들기")?.click());
    const input = container?.querySelector<HTMLInputElement>('input[placeholder="예: 우리 반 여름 노래"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, album.name);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(firebaseMocks.createCommunityAlbum).toHaveBeenCalledWith(user.uid, user.displayName, album.name);
    expect(container?.textContent).toContain(album.name);
  });

  it("앨범 소유자가 앨범과 내부 음악을 삭제할 수 있다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    const deleteButton = container?.querySelector<HTMLButtonElement>(`[aria-label="${album.name} 앨범 삭제"]`);
    await act(async () => deleteButton?.click());
    await flush();

    expect(firebaseMocks.deleteCommunityAlbum).toHaveBeenCalledWith(album.id);
    expect(container?.querySelector(`[aria-label="${album.name} 앨범 삭제"]`)).toBeNull();
  });

  it("관리자 계정에도 다른 사용자의 앨범 삭제 버튼을 보여준다", async () => {
    const admin = { uid: "admin-1", email: "inkun00@hanmail.net", displayName: "관리자" } as User;
    mount(<CommunityAlbum configured user={admin} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    expect(container?.querySelector(`[aria-label="${album.name} 앨범 삭제"]`)).not.toBeNull();
  });
});

describe("악보 앨범 공개", () => {
  it("앨범과 프로젝트 공개 범위를 선택해 저장한다", async () => {
    const onPublished = vi.fn();
    mount(<PublishScoreDialog user={user} score={score} onClose={() => undefined} onPublished={onPublished} />);
    await flush();

    await act(async () => buttonContaining(album.name)?.click());
    await act(async () => buttonContaining("프로젝트 공개")?.click());
    await act(async () => buttonNamed("이 범위로 공개하기")?.click());
    await flush();

    expect(firebaseMocks.publishScoreToAlbum).toHaveBeenCalledWith(user.uid, user.displayName, album.id, score, "project");
    expect(onPublished).toHaveBeenCalledWith(album, "project");
  });
});
