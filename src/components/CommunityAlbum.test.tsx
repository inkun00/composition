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
  renameCommunityAlbum: vi.fn(),
  setCommunityAlbumPassword: vi.fn(),
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
  locked: false,
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

async function fillInput(selector: string, value: string) {
  const input = container?.querySelector<HTMLInputElement>(selector);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  Object.values(firebaseMocks).forEach((mock) => mock.mockReset());
  firebaseMocks.listCommunityAlbums.mockResolvedValue([album]);
  firebaseMocks.listPublishedSongs.mockResolvedValue([song]);
  firebaseMocks.createCommunityAlbum.mockResolvedValue(album);
  firebaseMocks.renameCommunityAlbum.mockImplementation(async (_albumId: string, name: string) => name);
  firebaseMocks.setCommunityAlbumPassword.mockResolvedValue({ locked: true, passwordSalt: "a".repeat(32) });
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

  it("앨범 이름과 인증코드를 입력해야 앨범을 생성한다", async () => {
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
    expect(container?.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
    const codeInput = container?.querySelector<HTMLInputElement>('input[placeholder="인증코드를 입력해 주세요"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(codeInput, "maeum");
      codeInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(firebaseMocks.createCommunityAlbum).toHaveBeenCalledWith(user.uid, user.displayName, album.name, "maeum", "");
    expect(container?.textContent).toContain(album.name);
  });

  it("인증코드가 틀리면 앨범 생성 오류를 안내한다", async () => {
    firebaseMocks.createCommunityAlbum.mockRejectedValue({ code: "permission-denied" });
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => buttonNamed("앨범 만들기")?.click());
    const nameInput = container?.querySelector<HTMLInputElement>('input[placeholder="예: 우리 반 여름 노래"]');
    const codeInput = container?.querySelector<HTMLInputElement>('input[placeholder="인증코드를 입력해 주세요"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, album.name);
      nameInput?.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(codeInput, "잘못된 코드");
      codeInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(firebaseMocks.createCommunityAlbum).toHaveBeenCalledWith(user.uid, user.displayName, album.name, "잘못된 코드", "");
    expect(container?.querySelector('[role="status"]')?.textContent).toContain("인증코드나 로그인 상태를 확인해 주세요.");
  });

  it("앨범을 만들 때 삭제할 때만 쓸 암호를 함께 설정할 수 있다", async () => {
    firebaseMocks.listCommunityAlbums.mockResolvedValue([]);
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => buttonNamed("앨범 만들기")?.click());
    await fillInput('input[placeholder="예: 우리 반 여름 노래"]', album.name);
    await fillInput('input[placeholder="인증코드를 입력해 주세요"]', "maeum");
    expect(container?.textContent).toContain("암호는 만든 사람이 앨범을 삭제할 때만 사용해요.");
    await fillInput('input[placeholder="삭제할 때 쓸 암호, 4글자 이상"]', "우리반1234");
    await act(async () => container?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(firebaseMocks.createCommunityAlbum).toHaveBeenCalledWith(user.uid, user.displayName, album.name, "maeum", "우리반1234");
  });

  it.each([
    { label: "일반 사용자", visitor: { uid: "user-2", email: "friend@example.com", displayName: "서연" } as User, manages: false },
    { label: "로그인하지 않은 사용자", visitor: null, manages: false },
    { label: "앨범 소유자", visitor: user, manages: true },
    { label: "관리자", visitor: { uid: "admin-1", email: "inkun00@hanmail.net", displayName: "관리자" } as User, manages: true }
  ])("$label도 기존에 암호를 설정한 앨범을 암호 없이 열고 음악을 재생한다", async ({ visitor, manages }) => {
    const lockedAlbum = { ...album, locked: true, passwordSalt: "a".repeat(32) };
    const onPlay = vi.fn().mockResolvedValue(true);
    const onRequestLogin = vi.fn();
    firebaseMocks.listCommunityAlbums.mockResolvedValue([lockedAlbum]);
    mount(<CommunityAlbum configured user={visitor} onClose={() => undefined} onRequestLogin={onRequestLogin}
      onPlay={onPlay} onOpenProject={() => undefined} />);
    await flush();

    if (!manages) {
      expect(container?.querySelector(`[aria-label="${album.name} 앨범 삭제"]`)).toBeNull();
      expect(container?.querySelector(`[aria-label="${album.name} 앨범 이름 수정"]`)).toBeNull();
    }
    expect(container?.querySelector(".album-lock-badge")).toBeNull();
    await act(async () => buttonContaining(album.name)?.click());
    await flush();

    expect(firebaseMocks.listPublishedSongs).toHaveBeenCalledWith(album.id);
    expect(container?.textContent).toContain(song.title);
    expect(container?.querySelector('[aria-label="우리 반 노래 앨범 입장"]')).toBeNull();
    expect(container?.querySelector('input[type="password"]')).toBeNull();
    await act(async () => buttonContaining(song.title)?.click());
    expect(buttonNamed("재생하기")?.disabled).toBe(false);
    await act(async () => buttonNamed("재생하기")?.click());
    expect(onPlay).toHaveBeenCalledWith(song);
    expect(onRequestLogin).not.toHaveBeenCalled();
  });

  it("앨범 소유자는 기존 앨범에 삭제 암호를 설정할 수 있다", async () => {
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => buttonContaining(album.name)?.click());
    await flush();
    await act(async () => buttonNamed("삭제 암호 설정")?.click());
    await fillInput('input[placeholder="4글자 이상 적어 주세요"]', "새암호1234");
    await act(async () => buttonNamed("암호 저장")?.click());
    await flush();

    expect(firebaseMocks.setCommunityAlbumPassword).toHaveBeenCalledWith(album.id, user.uid, "새암호1234");
    expect(buttonNamed("삭제 암호 바꾸기")).toBeDefined();
  });

  it("앨범 소유자는 암호를 해제할 수 있다", async () => {
    const lockedAlbum = { ...album, locked: true, passwordSalt: "a".repeat(32) };
    firebaseMocks.listCommunityAlbums.mockResolvedValue([lockedAlbum]);
    firebaseMocks.setCommunityAlbumPassword.mockResolvedValue({ locked: false, passwordSalt: undefined });
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => buttonContaining(album.name)?.click());
    await flush();
    await act(async () => buttonNamed("삭제 암호 바꾸기")?.click());
    await act(async () => buttonNamed("암호 해제하기")?.click());
    await flush();

    expect(firebaseMocks.setCommunityAlbumPassword).toHaveBeenCalledWith(album.id, user.uid, "");
    expect(buttonNamed("삭제 암호 설정")).toBeDefined();
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

  it("삭제 암호가 있는 앨범은 소유자가 암호를 입력한 뒤 삭제한다", async () => {
    const lockedAlbum = { ...album, locked: true, passwordSalt: "a".repeat(32) };
    firebaseMocks.listCommunityAlbums.mockResolvedValue([lockedAlbum]);
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => container?.querySelector<HTMLButtonElement>(`[aria-label="${album.name} 앨범 삭제"]`)?.click());
    expect(container?.querySelector(`[role="dialog"][aria-label="${album.name} 앨범 삭제"]`)).not.toBeNull();
    expect(firebaseMocks.deleteCommunityAlbum).not.toHaveBeenCalled();
    expect(buttonNamed("앨범 삭제")?.disabled).toBe(true);
    await fillInput('input[placeholder="삭제 암호를 입력해 주세요"]', "우리반1234");
    await act(async () => buttonNamed("앨범 삭제")?.click());
    await flush();

    expect(firebaseMocks.deleteCommunityAlbum).toHaveBeenCalledWith(album.id, {
      userId: user.uid, password: "우리반1234", salt: lockedAlbum.passwordSalt
    });
    expect(container?.querySelector(`[aria-label="${album.name} 앨범 삭제"]`)).toBeNull();
    expect(firebaseMocks.listPublishedSongs).not.toHaveBeenCalled();
  });

  it("삭제 암호가 틀리면 앨범과 삭제 창을 유지하고 다시 입력할 수 있다", async () => {
    firebaseMocks.listCommunityAlbums.mockResolvedValue([{ ...album, locked: true, passwordSalt: "a".repeat(32) }]);
    firebaseMocks.deleteCommunityAlbum.mockRejectedValue({ code: "permission-denied" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => container?.querySelector<HTMLButtonElement>(`[aria-label="${album.name} 앨범 삭제"]`)?.click());
    await fillInput('input[placeholder="삭제 암호를 입력해 주세요"]', "틀린암호");
    await act(async () => buttonNamed("앨범 삭제")?.click());
    await flush();

    expect(container?.querySelector(`[role="dialog"][aria-label="${album.name} 앨범 삭제"] [role="status"]`)?.textContent)
      .toContain("암호가 맞지 않아요");
    expect(container?.querySelector(`button[aria-label="${album.name} 앨범 삭제"]`)).not.toBeNull();
    expect(buttonNamed("앨범 삭제")?.disabled).toBe(false);
    expect(firebaseMocks.deleteCommunityAlbum).toHaveBeenCalledOnce();
  });

  it("삭제 암호 창을 취소하면 앨범을 삭제하지 않는다", async () => {
    firebaseMocks.listCommunityAlbums.mockResolvedValue([{ ...album, locked: true, passwordSalt: "a".repeat(32) }]);
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => container?.querySelector<HTMLButtonElement>(`[aria-label="${album.name} 앨범 삭제"]`)?.click());
    await act(async () => container?.querySelector<HTMLButtonElement>('[aria-label="암호 창 닫기"]')?.click());

    expect(container?.querySelector(`[role="dialog"][aria-label="${album.name} 앨범 삭제"]`)).toBeNull();
    expect(container?.querySelector(`button[aria-label="${album.name} 앨범 삭제"]`)).not.toBeNull();
    expect(firebaseMocks.deleteCommunityAlbum).not.toHaveBeenCalled();
  });

  it("암호를 확인해 삭제하는 동안 중복 제출과 창 닫기를 막는다", async () => {
    let finishDeletion: (() => void) | undefined;
    firebaseMocks.listCommunityAlbums.mockResolvedValue([{ ...album, locked: true, passwordSalt: "a".repeat(32) }]);
    firebaseMocks.deleteCommunityAlbum.mockImplementation(() => new Promise<void>((resolve) => { finishDeletion = resolve; }));
    const onClose = vi.fn();
    mount(<CommunityAlbum configured user={user} onClose={onClose} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => container?.querySelector<HTMLButtonElement>(`[aria-label="${album.name} 앨범 삭제"]`)?.click());
    await fillInput('input[placeholder="삭제 암호를 입력해 주세요"]', "우리반1234");
    await act(async () => buttonNamed("앨범 삭제")?.click());
    await flush();

    const dialog = container?.querySelector(`[role="dialog"][aria-label="${album.name} 앨범 삭제"]`);
    expect(buttonNamed("처리하는 중...")?.disabled).toBe(true);
    expect(container?.querySelector<HTMLButtonElement>('[aria-label="암호 창 닫기"]')?.disabled).toBe(true);
    await act(async () => {
      dialog?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      dialog?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      container?.querySelector<HTMLButtonElement>('[aria-label="암호 창 닫기"]')?.click();
    });

    expect(firebaseMocks.deleteCommunityAlbum).toHaveBeenCalledOnce();
    expect(container?.querySelector(`[role="dialog"][aria-label="${album.name} 앨범 삭제"]`)).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finishDeletion?.());
    await flush();
    expect(container?.querySelector(`[aria-label="${album.name} 앨범 삭제"]`)).toBeNull();
  });

  it("소유자는 삭제 아이콘 아래의 수정 아이콘으로 앨범 이름을 바꿀 수 있다", async () => {
    const lockedAlbum = { ...album, locked: true, passwordSalt: "a".repeat(32) };
    firebaseMocks.listCommunityAlbums.mockResolvedValue([lockedAlbum]);
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    const actions = container?.querySelector(".community-album-card-actions");
    expect([...actions!.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"))).toEqual([
      `${album.name} 앨범 삭제`, `${album.name} 앨범 이름 수정`
    ]);
    await act(async () => actions?.querySelector<HTMLButtonElement>(".community-album-rename")?.click());
    expect(container?.querySelector<HTMLInputElement>('input[placeholder="새 앨범 이름을 적어 주세요"]')?.value).toBe(album.name);
    await fillInput('input[placeholder="새 앨범 이름을 적어 주세요"]', "  새로운 앨범  ");
    await act(async () => buttonNamed("이름 저장")?.click());
    await flush();

    expect(firebaseMocks.renameCommunityAlbum).toHaveBeenCalledWith(album.id, "새로운 앨범");
    expect(container?.querySelector(`[aria-label="새로운 앨범 앨범 이름 수정"]`)).not.toBeNull();
    expect(container?.querySelector(".album-lock-badge")).toBeNull();
    expect(firebaseMocks.listPublishedSongs).not.toHaveBeenCalled();
  });

  it("이름 변경이 거절되면 기존 이름을 유지하고 오류를 보여준다", async () => {
    firebaseMocks.renameCommunityAlbum.mockRejectedValue({ code: "permission-denied" });
    mount(<CommunityAlbum configured user={user} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => container?.querySelector<HTMLButtonElement>(`[aria-label="${album.name} 앨범 이름 수정"]`)?.click());
    await fillInput('input[placeholder="새 앨범 이름을 적어 주세요"]', "바꿀 이름");
    await act(async () => buttonNamed("이름 저장")?.click());
    await flush();

    expect(container?.querySelector('[aria-label="앨범 이름 수정"] [role="status"]')?.textContent)
      .toContain("권한이 없어요");
    expect(container?.querySelector(`[aria-label="${album.name} 앨범 이름 수정"]`)).not.toBeNull();
  });

  it("관리자 계정에도 다른 사용자의 앨범 삭제 버튼을 보여준다", async () => {
    const admin = { uid: "admin-1", email: "inkun00@hanmail.net", displayName: "관리자" } as User;
    mount(<CommunityAlbum configured user={admin} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    expect(container?.querySelector(`[aria-label="${album.name} 앨범 삭제"]`)).not.toBeNull();
    expect(container?.querySelector(`[aria-label="${album.name} 앨범 이름 수정"]`)).not.toBeNull();
  });

  it("관리자는 다른 사람의 잠긴 앨범도 암호 없이 이름만 바꿀 수 있다", async () => {
    const admin = { uid: "admin-1", email: "inkun00@hanmail.net", displayName: "관리자" } as User;
    firebaseMocks.listCommunityAlbums.mockResolvedValue([{ ...album, locked: true, passwordSalt: "a".repeat(32) }]);
    mount(<CommunityAlbum configured user={admin} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    await act(async () => container?.querySelector<HTMLButtonElement>(`[aria-label="${album.name} 앨범 이름 수정"]`)?.click());
    await fillInput('input[placeholder="새 앨범 이름을 적어 주세요"]', "우리 반 합창");
    await act(async () => buttonNamed("이름 저장")?.click());
    await flush();

    expect(firebaseMocks.listPublishedSongs).not.toHaveBeenCalled();
    expect(firebaseMocks.renameCommunityAlbum).toHaveBeenCalledWith(album.id, "우리 반 합창");
  });

  it("일반 구성원에게는 앨범 수정 아이콘이 보이지 않는다", async () => {
    const friend = { uid: "user-2", email: "friend@example.com", displayName: "서연" } as User;
    mount(<CommunityAlbum configured user={friend} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    expect(container?.querySelector(`[aria-label="${album.name} 앨범 삭제"]`)).toBeNull();
    expect(container?.querySelector(`[aria-label="${album.name} 앨범 이름 수정"]`)).toBeNull();
  });

  it("관리자는 잠긴 앨범을 열지 않고 암호 없이 삭제할 수 있다", async () => {
    const admin = { uid: "admin-1", email: "inkun00@hanmail.net", displayName: "관리자" } as User;
    firebaseMocks.listCommunityAlbums.mockResolvedValue([{ ...album, locked: true, passwordSalt: "a".repeat(32) }]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(<CommunityAlbum configured user={admin} onClose={() => undefined} onRequestLogin={() => undefined}
      onPlay={vi.fn().mockResolvedValue(true)} onOpenProject={() => undefined} />);
    await flush();

    const deleteButton = container?.querySelector<HTMLButtonElement>(`[aria-label="${album.name} 앨범 삭제"]`);
    await act(async () => deleteButton?.click());
    await flush();

    expect(firebaseMocks.listPublishedSongs).not.toHaveBeenCalled();
    expect(firebaseMocks.deleteCommunityAlbum).toHaveBeenCalledWith(album.id);
    expect(container?.querySelector(`[aria-label="${album.name} 앨범 삭제"]`)).toBeNull();
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

  it("삭제 암호가 있는 앨범에도 암호 없이 노래를 공개한다", async () => {
    const friend = { uid: "user-2", email: "friend@example.com", displayName: "서연" } as User;
    const lockedAlbum = { ...album, locked: true, passwordSalt: "a".repeat(32) };
    firebaseMocks.listCommunityAlbums.mockResolvedValue([lockedAlbum]);
    mount(<PublishScoreDialog user={friend} score={score} onClose={() => undefined} onPublished={vi.fn()} />);
    await flush();

    await act(async () => buttonContaining(album.name)?.click());
    expect(buttonNamed("이 범위로 공개하기")?.disabled).toBe(false);
    expect(container?.querySelector('input[type="password"]')).toBeNull();
    expect(container?.querySelector(".album-lock-badge")).toBeNull();
    await act(async () => buttonNamed("이 범위로 공개하기")?.click());
    await flush();

    expect(firebaseMocks.publishScoreToAlbum).toHaveBeenCalledWith(friend.uid, friend.displayName, album.id, score, "audio");
  });
});
