import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressToEncodedURIComponent, compressToUTF16 } from "lz-string";
import { encodeCloudDraft } from "../firebase/cloudDraft";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { DRAFT_BACKUP_STORAGE_KEY, DRAFT_COMPRESSED_PREFIX, DRAFT_RECOVERY_STORAGE_KEY,
  DRAFT_STORAGE_KEY, type SavedDraft } from "./draft";
import { createLostDrawingRecovery, extractLostDrawingCandidates, lostDrawingSceneFingerprint } from "./lostDrawingRecovery";
import { createLostDrawingInbox, LOST_DRAWING_INBOX_KEY, type LostDrawingInbox,
  type LostDrawingInboxEntry } from "./lostDrawingRecoveryInbox";

const scene: MusicVideoScene = { id: "hand", background: "#ffffff", motion: "bounce", endLyric: null,
  endMeasureIndex: 7, elements: [{ id: "brush", tool: "brush", color: "#123456", width: 4,
    points: [[10, 20, .5], [30, 40, .5]], motion: "move-right", motionGroupId: "hands" }] };

function draft(updatedAt = 20): SavedDraft {
  return { version: 1, updatedAt, projectId: "earth", sourceHash: "", title: "지구를 지켜요", creator: "작곡가",
    originalCreator: "", presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8,
    instrumentId: "piano", lyrics: Array(8).fill("안녕"), showArrangement: true,
    measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null })),
    musicVideoScenes: [scene] };
}

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: Storage = { get length() { return values.size; }, getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); },
    key: (index) => [...values.keys()][index] ?? null, clear: () => values.clear() };
  return { values, storage };
}

function memoryInbox() {
  const records = new Map<string, LostDrawingInboxEntry>();
  const inbox: LostDrawingInbox = {
    read: async () => [...records.values()],
    preserve: async (entries) => {
      for (const entry of entries) {
        const previous = records.get(entry.candidate.id);
        records.set(entry.candidate.id, { ...entry, candidate: { ...entry.candidate, preserved: true },
          originals: [...previous?.originals ?? [], ...entry.originals], resolution: entry.resolution ?? previous?.resolution });
      }
      return true;
    },
    resolve: async (id, resolution) => {
      const entry = records.get(id);
      if (!entry) return false;
      records.set(id, { ...entry, resolution });
      return true;
    }
  };
  return { inbox, records };
}

describe("남아 있는 원본에서 그림만 안전하게 추출", () => {
  it("완전한 프로젝트·압축 localStorage·cloud JSON의 실제 그림과 그룹 모션을 보존한다", () => {
    const encoded = encodeCloudDraft(draft());
    for (const record of [draft(), JSON.stringify(draft()), DRAFT_COMPRESSED_PREFIX + compressToUTF16(JSON.stringify(draft())), encoded]) {
      const [candidate] = extractLostDrawingCandidates(record, "test", "backup");
      expect(candidate.scenes).toEqual([scene]);
      expect(candidate.draft).toEqual(draft());
      expect(candidate.partial).toBe(false);
    }
  });

  it("악보 필드가 손상돼도 정상 장면만 찾고 악보·점·모션 정보를 만들어내지 않는다", () => {
    const broken = { ...draft(), songLength: -1, musicVideoScenes: [scene, { ...scene, id: "broken", motion: "unknown" }] };
    const [candidate] = extractLostDrawingCandidates(broken, "recovery", "damaged");
    expect(candidate.scenes).toEqual([scene]);
    expect(candidate.draft).toBeUndefined();
    expect(candidate.partial).toBe(true);
    expect(broken.musicVideoScenes).toHaveLength(2);
    const { musicVideoScenes: _scenes, ...music } = draft();
    const compressed = { ...music, instrumentId: "unrecognized",
      musicVideoScenesLz: compressToEncodedURIComponent(JSON.stringify([scene])) };
    const [cloud] = extractLostDrawingCandidates(compressed, "cloud:owner:score", "cloud");
    expect(cloud.scenes).toEqual([scene]);
    expect(cloud.draft).toBeUndefined();
  });

  it("전체 JSON이 잘렸어도 완전히 남아 있는 scene 객체만 복구한다", () => {
    const raw = `{"title":"old","musicVideoScenes":[${JSON.stringify(scene)},{"id":"incomplete","elements":[`;
    const [candidate] = extractLostDrawingCandidates(raw, "broken", "damaged");
    expect(candidate.scenes).toEqual([scene]);
    expect(candidate.partial).toBe(true);
    expect(candidate.projectId).toBeUndefined();
    expect(extractLostDrawingCandidates('{"musicVideoScenes":[{"id":"not-complete"', "x", "damaged")).toEqual([]);
  });

  it("문자열 속 가짜 장면이나 빈 도화지를 복구 데이터로 오인하지 않는다", () => {
    const quoted = JSON.stringify(`"musicVideoScenes":[${JSON.stringify(scene)}]`);
    expect(extractLostDrawingCandidates(`{"message":${quoted},broken`, "x", "damaged")).toEqual([]);
    expect(extractLostDrawingCandidates({ musicVideoScenes: [{ ...scene, elements: [] }] }, "x", "legacy")).toEqual([]);
  });

  it("24장 제한을 넘는 원본도 유효한 장면을 버리지 않고 별도 후보로 나눈다", () => {
    const scenes = Array.from({ length: 25 }, (_, index) => ({ ...scene, id: `scene-${index}` }));
    const candidates = extractLostDrawingCandidates({ musicVideoScenes: scenes }, "legacy", "legacy");
    expect(candidates.map((candidate) => candidate.scenes.length)).toEqual([24, 1]);
    expect(candidates.flatMap((candidate) => candidate.scenes)).toEqual(scenes);
    expect(candidates.every((candidate) => candidate.partial)).toBe(true);
  });

  it("같은 그림은 시각·프로젝트 ID·속성 순서에 관계없이 같은 후보이며 cloud 계정은 구분한다", () => {
    const first = extractLostDrawingCandidates(draft(), "primary", "primary")[0];
    const moved = { ...draft(99), projectId: "migrated", musicVideoScenes: [Object.fromEntries(Object.entries(scene).reverse())] };
    expect(extractLostDrawingCandidates(moved, "archive", "archive")[0].id).toBe(first.id);
    expect(first.id).toBe(lostDrawingSceneFingerprint([scene]));
    expect(extractLostDrawingCandidates(draft(), "cloud:alice:score", "cloud")[0].id)
      .not.toBe(extractLostDrawingCandidates(draft(), "cloud:bob:score", "cloud")[0].id);
    const rebound = { ...scene, id: "new-scene", motion: "still" as const, endMeasureIndex: 2,
      elements: scene.elements.map((element) => ({ ...element, id: "new-element", motion: "bounce" as const, motionGroupId: "new-group" })) };
    expect(lostDrawingSceneFingerprint([rebound])).toBe(first.id);
    expect(lostDrawingSceneFingerprint([{ ...scene, background: "#000000" }])).not.toBe(first.id);
  });

  it("서로 충돌할 수 있는 여러 scene 저장 필드가 있으면 임의로 하나를 복구하지 않는다", () => {
    expect(extractLostDrawingCandidates({ ...draft(), musicVideoScenesJson: JSON.stringify([scene]) }, "bad", "damaged"))
      .toEqual([]);
  });
});

describe("활성 작품과 독립적인 복구 inbox", () => {
  it("시작 시 primary·backup·recovery를 먼저 캡처하며 이후 migration이 원본을 덮어써도 보관한다", async () => {
    const { storage, values } = memoryStorage();
    const raw = JSON.stringify(draft());
    storage.setItem(DRAFT_STORAGE_KEY, raw);
    storage.setItem(DRAFT_BACKUP_STORAGE_KEY, raw);
    storage.setItem(DRAFT_RECOVERY_STORAGE_KEY, raw);
    storage.setItem("maeum-melody:legacy-scene:v0", JSON.stringify({ format: "maeum-melody-scene", scene }));
    storage.setItem("maeum-melody-practice-v1", raw);
    storage.setItem("firebase:authUser:secret", raw);
    storage.setItem("unrelated-draft", raw);
    const before = new Map(values);
    const { inbox, records } = memoryInbox();
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const recovery = createLostDrawingRecovery({ storage: () => storage, inbox, readArchives: async () => { await waiting; return []; } });
    const pending = recovery.scanLostDrawingRecovery();
    storage.setItem(DRAFT_BACKUP_STORAGE_KEY, "migration-overwrite");
    release!();
    const candidates = await pending;
    expect(candidates).toHaveLength(1);
    const originals = [...records.values()].flatMap((entry) => entry.originals);
    expect(originals.map((entry) => entry.source)).toEqual([
      `localStorage:${DRAFT_STORAGE_KEY}`, `localStorage:${DRAFT_BACKUP_STORAGE_KEY}`,
      `localStorage:${DRAFT_RECOVERY_STORAGE_KEY}`, "localStorage:maeum-melody:legacy-scene:v0"]);
    expect(originals.find((entry) => entry.source.endsWith(":backup"))?.raw).toBe(raw);
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe(before.get(DRAFT_STORAGE_KEY));
    expect(storage.getItem("firebase:authUser:secret")).toBe(raw);
  });

  it("거부된 archive 원본도 조사하고 dismiss는 원본을 지우지 않으며 재시작 팝업을 막는다", async () => {
    const { storage } = memoryStorage();
    const { inbox, records } = memoryInbox();
    const archives = [{ value: { id: "earth", draft: { ...draft(), meter: null } },
      source: "indexedDB:maeum-melody-projects/projects/earth", sourceKind: "archive" as const, currentPointer: true }];
    const recovery = createLostDrawingRecovery({ storage: () => storage, inbox, readArchives: async () => archives });
    const [candidate] = await recovery.scanLostDrawingRecovery();
    expect(candidate).toMatchObject({ partial: true, sourceKind: "archive", currentPointer: true });
    expect(await recovery.dismissLostDrawingRecovery(candidate.id)).toBe(true);
    expect(await recovery.scanLostDrawingRecovery()).toEqual([]);
    expect((await recovery.listLostDrawingRecovery(true))).toHaveLength(1);
    expect(records.get(candidate.id)?.originals.length).toBeGreaterThan(0);
    expect(await recovery.resolveLostDrawingRecovery(candidate.id, "restored")).toBe(true);
    expect(records.get(candidate.id)?.resolution).toBe("restored");
  });

  it("inbox 저장 실패를 성공으로 표시하지 않고 현재 원본을 바꾸지 않는다", async () => {
    const { storage } = memoryStorage();
    const raw = JSON.stringify(draft());
    storage.setItem(DRAFT_BACKUP_STORAGE_KEY, raw);
    const inbox = { ...memoryInbox().inbox, preserve: async () => false };
    const recovery = createLostDrawingRecovery({ storage: () => storage, inbox, readArchives: async () => [] });
    const result = await recovery.scanLostDrawingRecoveryRecords();
    expect(result.preserved).toBe(false);
    expect(result.candidates[0].preserved).toBe(false);
    expect(storage.getItem(DRAFT_BACKUP_STORAGE_KEY)).toBe(raw);
  });
});

describe("별도 inbox의 브라우저 저장 fallback", () => {
  beforeEach(() => { localStorage.clear(); vi.stubGlobal("indexedDB", undefined); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("IDB를 사용할 수 없어도 압축해 별도 보존하고 dismissed 상태를 다시 읽는다", async () => {
    const inbox = createLostDrawingInbox();
    const [candidate] = extractLostDrawingCandidates(draft(), "backup", "backup");
    expect(await inbox.preserve([{ candidate, originals: [{ source: "backup", raw: JSON.stringify(draft()) }] }])).toBe(true);
    expect(localStorage.getItem(LOST_DRAWING_INBOX_KEY)).toBeTruthy();
    expect(await inbox.resolve(candidate.id, "dismissed")).toBe(true);
    const restarted = createLostDrawingInbox();
    expect((await restarted.read())[0]).toMatchObject({ resolution: "dismissed", candidate: { preserved: true } });
    expect((await restarted.read())[0].originals[0].raw).toBe(JSON.stringify(draft()));
  });

  it("두 저장소가 막히면 메모리에 있는 후보를 영구 보관했다고 표시하지 않는다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    const inbox = createLostDrawingInbox();
    const [candidate] = extractLostDrawingCandidates(draft(), "backup", "backup");
    expect(await inbox.preserve([{ candidate, originals: [{ source: "backup", raw: JSON.stringify(draft()) }] }])).toBe(false);
    expect((await inbox.read())[0].candidate.preserved).toBe(false);
  });

  it("복구 직전 최신 currentDraft를 별도 fallback에 보관하여 primary 교체 뒤에도 다시 찾는다", async () => {
    const latestScene = { ...scene, elements: [...scene.elements,
      { id: "latest-stroke", tool: "line" as const, color: "#ff0000", width: 5,
        points: [[100, 100, .5], [200, 150, .5]] as const }] };
    const currentDraft = { ...draft(30), musicVideoScenes: [latestScene] };
    const raw = JSON.stringify(currentDraft);
    localStorage.setItem(DRAFT_STORAGE_KEY, raw);
    const recovery = createLostDrawingRecovery({ storage: () => localStorage,
      inbox: createLostDrawingInbox(), readArchives: async () => [] });
    const source = `recovery-current:${currentDraft.projectId}`;
    const result = await recovery.scanLostDrawingRecoveryRecords([
      { value: currentDraft, source, sourceKind: "archive", currentPointer: false }
    ]);
    expect(result.preserved).toBe(true);
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...draft(40), projectId: "restored-copy", musicVideoScenes: [] }));
    const restartedInbox = createLostDrawingInbox();
    const retained = (await restartedInbox.read()).find((entry) => entry.candidate.id === lostDrawingSceneFingerprint([latestScene]));
    expect(retained?.candidate.scenes).toEqual([latestScene]);
    expect(retained?.candidate.draft).toEqual(currentDraft);
    expect(retained?.candidate.preserved).toBe(true);
    expect(retained?.originals.find((original) => original.source === source)?.raw).toBe(raw);
    const restarted = createLostDrawingRecovery({ storage: () => localStorage,
      inbox: restartedInbox, readArchives: async () => [] });
    expect((await restarted.listLostDrawingRecovery()).find((candidate) => candidate.id === retained?.candidate.id)?.scenes)
      .toEqual([latestScene]);
  });

  it("최신 currentDraft의 독립 보관이 quota로 거절되면 primary 성공과 관계없이 preserved=false다", async () => {
    const currentDraft = { ...draft(30), title: "방금 추가한 그림" };
    const raw = JSON.stringify(currentDraft);
    localStorage.setItem(DRAFT_STORAGE_KEY, raw);
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === LOST_DRAWING_INBOX_KEY || key === DRAFT_BACKUP_STORAGE_KEY) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      originalSetItem.call(this, key, value);
    });
    const recovery = createLostDrawingRecovery({ storage: () => localStorage,
      inbox: createLostDrawingInbox(), readArchives: async () => [] });
    const result = await recovery.scanLostDrawingRecoveryRecords([
      { value: currentDraft, source: `recovery-current:${currentDraft.projectId}`, sourceKind: "archive", currentPointer: false }
    ]);
    expect(result.preserved).toBe(false);
    expect(result.candidates.find((candidate) => candidate.id === lostDrawingSceneFingerprint(currentDraft.musicVideoScenes ?? []))?.preserved)
      .toBe(false);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(LOST_DRAWING_INBOX_KEY)).toBeNull();
    expect(await createLostDrawingInbox().read()).toEqual([]);
  });

  it("이미 화면에 있는 그림은 represented로 보관하여 재시작 때 미복구 알림을 반복하지 않는다", async () => {
    const raw = JSON.stringify(draft());
    localStorage.setItem(DRAFT_STORAGE_KEY, raw);
    const inbox = createLostDrawingInbox();
    const recovery = createLostDrawingRecovery({ storage: () => localStorage, inbox, readArchives: async () => [] });
    const [candidate] = await recovery.scanLostDrawingRecovery();
    expect(await recovery.resolveLostDrawingRecovery(candidate.id, "represented")).toBe(true);
    expect(await recovery.scanLostDrawingRecovery()).toEqual([]);
    expect(await recovery.listLostDrawingRecovery(true)).toHaveLength(1);
    const [retained] = await createLostDrawingInbox().read();
    expect(retained.resolution).toBe("represented");
    expect(retained.originals.some((original) => original.raw === raw)).toBe(true);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(raw);
  });

  it.each([true, false])("자동 represented 저장은 명시적인 restored 선택을 덮어쓰지 않는다: 먼저 복구 %s", async (restoreFirst) => {
    const inbox = createLostDrawingInbox();
    const [candidate] = extractLostDrawingCandidates(draft(), "backup", "backup");
    const original = { candidate, originals: [{ source: "backup", raw: JSON.stringify(draft()) }] };
    await inbox.preserve([original]);
    if (restoreFirst) {
      await inbox.resolve(candidate.id, "restored");
      await inbox.preserve([{ ...original, resolution: "represented" }]);
    } else {
      await inbox.preserve([{ ...original, resolution: "represented" }]);
      await inbox.resolve(candidate.id, "restored");
    }
    expect((await createLostDrawingInbox().read())[0].resolution).toBe("restored");
    await inbox.resolve(candidate.id, "dismissed");
    await inbox.preserve([{ ...original, resolution: "represented" }]);
    expect((await createLostDrawingInbox().read())[0].resolution).toBe("dismissed");
  });
});
