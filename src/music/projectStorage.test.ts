import { describe, expect, it, vi } from "vitest";
import {
  DRAFT_BACKUP_STORAGE_KEY, DRAFT_COMPRESSED_PREFIX, DRAFT_RECOVERY_STORAGE_KEY,
  DRAFT_STORAGE_KEY, draftFingerprint, readDraft, writeDraft, type SavedDraft
} from "./draft";
import { createBrowserProjectStore } from "./projectStorage";
import type { ProjectSnapshotStore } from "./projectSnapshots";

function draft(id = "first", updatedAt = 1): SavedDraft {
  return {
    version: 1, updatedAt, projectId: id, sourceHash: "#song=test", title: "그림 노래",
    creator: "작곡가", originalCreator: "", presetId: "H001", meter: { beats: 4, beatUnit: 4 },
    songLength: 8, instrumentId: "acoustic_grand_piano", lyrics: Array(8).fill("안녕"),
    measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null })),
    musicVideoScenes: [{ id: "drawing", endLyric: null, endMeasureIndex: 7, background: "#ffffff", motion: "float",
      elements: [{ id: "stroke", tool: "brush", color: "#123456", width: 4, points: [[10, 30, .5]] }] }],
    showArrangement: false
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(), getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); }
  };
  return { values, storage };
}

function archives() {
  const projects = new Map<string, SavedDraft>();
  let current: string | null = null;
  const snapshots: ProjectSnapshotStore = {
    readCurrent: async () => current ? projects.get(current) ?? null : null,
    readProject: async (id) => projects.get(id) ?? null,
    listProjects: async () => [...projects.values()],
    save: async (value, makeCurrent) => {
      projects.set(value.projectId!, structuredClone(value));
      if (makeCurrent) current = value.projectId!;
      return true;
    },
    clearCurrent: async () => { current = null; }
  };
  return { snapshots, projects, current: () => current };
}

describe("그림 프로젝트 브라우저 저장 복구", () => {
  it("일반 JSON을 계속 지원하고 용량 제한에서는 압축하여 그림을 보존한다", () => {
    const { storage, values } = memoryStorage();
    const large = { ...draft(), description: "노래".repeat(250) };
    const quotaStorage = { ...storage, setItem(key: string, value: string) {
      if (value.length > 650) throw new DOMException("quota", "QuotaExceededError");
      storage.setItem(key, value);
    } };
    expect(writeDraft(quotaStorage, large)).toBe(true);
    expect(values.get(DRAFT_STORAGE_KEY)?.startsWith(DRAFT_COMPRESSED_PREFIX)).toBe(true);
    expect(readDraft(storage)).toEqual(large);
  });

  it("현재 데이터가 손상되거나 schema가 다르면 직전 정상 그림으로 복구한다", () => {
    const { storage } = memoryStorage();
    writeDraft(storage, draft());
    writeDraft(storage, draft("first", 2));
    storage.setItem(DRAFT_STORAGE_KEY, "{broken");
    expect(readDraft(storage)).toEqual(draft());
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...draft(), songLength: -1 }));
    expect(readDraft(storage)).toEqual(draft());
  });

  it("읽을 수 없는 원본은 별도 보관한 뒤 교체하고 보관 실패 시 덮어쓰지 않는다", () => {
    const { storage } = memoryStorage();
    storage.setItem(DRAFT_STORAGE_KEY, "unknown-version-raw");
    expect(writeDraft(storage, draft())).toBe(true);
    expect(storage.getItem(DRAFT_RECOVERY_STORAGE_KEY)).toBe("unknown-version-raw");
    storage.setItem(DRAFT_STORAGE_KEY, "only-copy");
    const blocked = { getItem: storage.getItem, setItem(key: string, value: string) {
      if (key === DRAFT_RECOVERY_STORAGE_KEY) throw new Error("quota");
      storage.setItem(key, value);
    } };
    expect(writeDraft(blocked, draft())).toBe(false);
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe("only-copy");
  });

  it("로컬 용량이 가득 차도 독립된 프로젝트 보관소에서 그림을 복원한다", async () => {
    const { snapshots } = archives();
    const blocked = { ...memoryStorage().storage, setItem: () => { throw new Error("quota"); } };
    const store = createBrowserProjectStore({ storage: () => blocked, snapshots });
    expect(store.checkpointBrowserProject(draft())).toBe(false);
    expect(await store.saveBrowserProjectDraft(draft())).toBe(true);
    const restarted = createBrowserProjectStore({ storage: () => blocked, snapshots });
    expect(await restarted.readBrowserProjectDraft()).toEqual(draft());
  });

  it("작품 전환 때 localStorage가 거부해도 성공한 새 IDB 작품으로 재시작한다", async () => {
    const { storage } = memoryStorage();
    const archive = archives();
    let full = false;
    const quotaStorage = { ...storage, setItem(key: string, value: string) {
      if (full) throw new Error("quota");
      storage.setItem(key, value);
    } };
    const store = createBrowserProjectStore({ storage: () => quotaStorage, snapshots: archive.snapshots });
    await store.saveBrowserProjectDraft(draft("older-project", 100));
    full = true;
    expect(await store.saveBrowserProjectDraft(draft("new-current", 10))).toBe(true);
    const restarted = createBrowserProjectStore({ storage: () => quotaStorage, snapshots: archive.snapshots });
    expect((await restarted.readBrowserProjectDraft())?.projectId).toBe("new-current");
    expect((await restarted.readBrowserProject("older-project"))?.updatedAt).toBe(100);
  });

  it("프로젝트 복원은 오래된 primary보다 최신 IDB 그림을 선택한다", async () => {
    const { storage } = memoryStorage();
    const archive = archives();
    await archive.snapshots.save(draft("first", 2), true);
    writeDraft(storage, draft("first", 1));
    const store = createBrowserProjectStore({ storage: () => storage, snapshots: archive.snapshots });
    expect((await store.readBrowserProject("first"))?.updatedAt).toBe(2);
  });

  it("동기 체크포인트가 먼저 저장되며 여러 그림을 순서대로 저장한다", async () => {
    const { storage } = memoryStorage();
    const archive = archives();
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    let writes = 0;
    const snapshots = { ...archive.snapshots, async save(value: SavedDraft, current: boolean) {
      writes += 1;
      if (writes === 1) await waiting;
      return archive.snapshots.save(value, current);
    } };
    const store = createBrowserProjectStore({ storage: () => storage, snapshots });
    const first = store.saveBrowserProjectDraft(draft("first", 1));
    const second = store.saveBrowserProjectDraft(draft("first", 2));
    expect(readDraft(storage)?.updatedAt).toBe(2);
    release!();
    await Promise.all([first, second]);
    expect((await snapshots.readProject("first"))?.updatedAt).toBe(2);
  });

  it("새 작품으로 전환해도 이전 작품을 독립적으로 보존하고 clear는 보관본을 지우지 않는다", async () => {
    const { storage } = memoryStorage();
    const archive = archives();
    const store = createBrowserProjectStore({ storage: () => storage, snapshots: archive.snapshots });
    const first = store.saveBrowserProjectDraft(draft("first", 20));
    const second = store.saveBrowserProjectDraft(draft("second", 10));
    await Promise.all([first, second]);
    expect((await store.readBrowserProjectDraft())?.projectId).toBe("second");
    expect((await store.readBrowserProject("first"))?.updatedAt).toBe(20);
    await store.clearBrowserCurrentProject();
    expect(await store.readBrowserProjectDraft()).toBeNull();
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(DRAFT_BACKUP_STORAGE_KEY)).toBeNull();
    expect((await store.readBrowserProject("first"))?.projectId).toBe("first");
    expect((await store.readBrowserProject("second"))?.projectId).toBe("second");
    expect((await store.listBrowserProjects()).map((value) => value.projectId)).toEqual(["first", "second"]);
  });

  it("이전 비동기 저장이 새 작품 시작 뒤 완료돼도 current가 되살아나지 않는다", async () => {
    const archive = archives();
    const store = createBrowserProjectStore({ storage: () => memoryStorage().storage, snapshots: archive.snapshots });
    const pending = store.saveBrowserProjectDraft(draft());
    const cleared = store.clearBrowserCurrentProject();
    await Promise.all([pending, cleared]);
    expect(archive.current()).toBeNull();
    expect(archive.projects.get("first")).toEqual(draft());
  });

  it("두 저장소가 모두 실패하면 성공으로 보고하지 않는다", async () => {
    const snapshots = { ...archives().snapshots, save: async () => false };
    const store = createBrowserProjectStore({ storage: () => null, snapshots });
    expect(await store.saveBrowserProjectDraft(draft())).toBe(false);
  });

  it("같은 그림의 체크포인트·대기 저장·종료 flush는 정상 저장을 반복하지 않는다", async () => {
    const { storage } = memoryStorage();
    const primaryWrites = vi.spyOn(storage, "setItem");
    const archive = archives();
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => { finish = resolve; });
    const save = vi.fn(async (value: SavedDraft, current: boolean) => {
      await waiting;
      return archive.snapshots.save(value, current);
    });
    const store = createBrowserProjectStore({ storage: () => storage, snapshots: { ...archive.snapshots, save } });
    const value = draft();
    expect(store.checkpointBrowserProject(value)).toBe(true);
    const first = store.saveBrowserProjectDraft(value);
    const flush = store.saveBrowserProjectDraft(value);
    await Promise.resolve();
    expect(save).toHaveBeenCalledOnce();
    finish();
    expect(await first).toBe(true);
    expect(await flush).toBe(true);
    expect(store.checkpointBrowserProject(value)).toBe(true);
    expect(await store.saveBrowserProjectDraft(value)).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(primaryWrites.mock.calls.filter(([key]) => key === DRAFT_STORAGE_KEY)).toHaveLength(1);
    const changed = draft("first", 2);
    expect(await store.saveBrowserProjectDraft(changed)).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(readDraft(storage)).toEqual(changed);
    expect(archive.projects.get("first")).toEqual(changed);
  });

  it("같은 그림도 실패한 보관소는 재시도하고 지워진 로컬 체크포인트를 복원한다", async () => {
    const { storage } = memoryStorage();
    const archive = archives();
    const save = vi.fn(archive.snapshots.save).mockResolvedValueOnce(false);
    const store = createBrowserProjectStore({ storage: () => storage, snapshots: { ...archive.snapshots, save } });
    const value = draft();
    expect(await store.saveBrowserProjectDraft(value)).toBe(true);
    expect(archive.projects.size).toBe(0);
    expect(await store.saveBrowserProjectDraft(value)).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    storage.removeItem(DRAFT_STORAGE_KEY);
    expect(store.checkpointBrowserProject(value)).toBe(true);
    expect(readDraft(storage)).toEqual(value);
    expect(await store.saveBrowserProjectDraft(value)).toBe(true);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("두 저장소가 거부한 같은 그림도 다음 flush에서 최신 복구본으로 저장한다", async () => {
    const { storage } = memoryStorage();
    const archive = archives();
    const save = vi.fn(archive.snapshots.save).mockResolvedValueOnce(false);
    let available = false;
    const store = createBrowserProjectStore({ storage: () => available ? storage : null,
      snapshots: { ...archive.snapshots, save } });
    const value = draft();
    expect(await store.saveBrowserProjectDraft(value)).toBe(false);
    available = true;
    expect(store.checkpointBrowserProject(value)).toBe(true);
    expect(await store.saveBrowserProjectDraft(value)).toBe(true);
    expect(readDraft(storage)).toEqual(value);
    expect(archive.projects.get("first")).toEqual(value);
  });

  it("identity metadata는 내용 변경이나 음악 변경으로 판단하지 않는다", () => {
    const value = draft();
    expect(draftFingerprint({ ...value, projectId: "other", cloudScoreId: "score", cloudOwnerId: "owner", updatedAt: 20 }))
      .toBe(draftFingerprint(value));
    expect(draftFingerprint({ ...value, title: "다른 곡" })).not.toBe(draftFingerprint(value));
    expect(readDraft({ getItem: () => JSON.stringify({ ...value, projectId: "x".repeat(161) }) })).toBeNull();
  });

  it("Firestore가 필드 순서를 바꿔도 같은 음악·그림의 fingerprint는 일치한다", () => {
    const value = draft();
    const reordered = Object.fromEntries(Object.entries(value).reverse()) as SavedDraft;
    const sameContent = { ...reordered, meter: { beatUnit: 4 as const, beats: 4 as const },
      musicVideoScenes: value.musicVideoScenes?.map((scene) => ({ ...scene,
        elements: scene.elements.map((element) => Object.fromEntries(Object.entries(element).reverse())) })) } as SavedDraft;
    expect(draftFingerprint(sameContent)).toBe(draftFingerprint(value));
    expect(draftFingerprint({ ...value, lyrics: ["다른", ...value.lyrics.slice(1)] })).not.toBe(draftFingerprint(value));
  });
});
