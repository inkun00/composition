// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudScore, CloudScoreListItem } from "../firebase/scores";
import { DRAFT_STORAGE_KEY, type SavedDraft } from "../music/draft";
import { extractLostDrawingCandidates, type LostDrawingRecoveryCandidate,
  type LostDrawingSourceKind } from "../music/lostDrawingRecoveryModel";
import { useLostDrawingRecovery } from "./useLostDrawingRecovery";
import { LOST_DRAWING_PROMPT_SHOWN_KEY } from "../music/lostDrawingRecoveryPrompt";

const mocks = vi.hoisted(() => ({ add: vi.fn(), list: vi.fn(), resolve: vi.fn(), scan: vi.fn() }));
vi.mock("../music/lostDrawingRecovery", async () => {
  const model = await import("../music/lostDrawingRecoveryModel");
  return { extractLostDrawingCandidates: model.extractLostDrawingCandidates,
    addLostDrawingRecoveryCandidates: mocks.add, listLostDrawingRecovery: mocks.list,
    resolveLostDrawingRecovery: mocks.resolve, scanLostDrawingRecoveryRecords: mocks.scan };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Options = Parameters<typeof useLostDrawingRecovery>[0];
let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useLostDrawingRecovery>;
let options: Options;

function draft(strokes = 0, owner?: string): SavedDraft {
  return { version: 1, updatedAt: 1000 + strokes, projectId: "project-one", sourceHash: "", title: "남아 있는 그림",
    creator: "새봄", originalCreator: "", presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8,
    instrumentId: "piano", showArrangement: true, lyrics: Array(8).fill(""),
    ...(owner ? { cloudOwnerId: owner, cloudScoreId: `score-${owner}` } : {}),
    measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null })),
    musicVideoScenes: strokes ? [{ id: "scene-one", background: "#ffffff", motion: "bounce", endLyric: null,
      endMeasureIndex: 7, elements: Array.from({ length: strokes }, (_, index) => ({ id: `stroke-${index}`,
        tool: "brush", color: "#123456", width: 8, points: [[10, 20, .5], [30 + index, 40, .75]] })) }] : [] };
}

function candidate(strokes = 1, sourceKind: LostDrawingSourceKind = "backup", owner = "user-a") {
  return extractLostDrawingCandidates({ value: draft(strokes, sourceKind === "cloud" ? owner : undefined), sourceKind,
    source: sourceKind === "cloud" ? `cloud:${owner}:score-${owner}` : `localStorage:maeum-melody:draft:v1:${sourceKind}` })[0];
}

function cloud(owner: string, strokes = 1): CloudScore {
  const saved = draft(strokes, owner);
  return { id: `score-${owner}`, title: saved.title, creator: saved.creator, songLength: saved.songLength,
    updatedAt: saved.updatedAt, draft: saved };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (failure: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function Harness({ value }: Readonly<{ value: Options }>) {
  current = useLostDrawingRecovery(value);
  return null;
}

async function render(patch: Partial<Options> = {}) {
  options = { ...options, ...patch };
  await act(async () => { root.render(<Harness value={options} />); });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.add.mockReset();
  mocks.list.mockReset();
  mocks.resolve.mockReset();
  mocks.scan.mockReset();
  mocks.add.mockImplementation(async (found: readonly LostDrawingRecoveryCandidate[]) => [...found]);
  mocks.list.mockResolvedValue([]);
  mocks.resolve.mockResolvedValue(true);
  mocks.scan.mockResolvedValue({ candidates: [], preserved: true });
  options = { current: draft(), initialCandidates: [], allowAutomatic: true, enabled: true, uid: null,
    scores: [], onRestore: vi.fn().mockResolvedValue(undefined), onPreserved: vi.fn() };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("남아 있는 뮤직비디오 그림 복구 선택", () => {
  it("처음 한 번 표시한 뒤 닫으면 새로 시작해 같은 기록이나 새 기록이 있어도 자동으로 열지 않는다", async () => {
    const first = candidate();
    await render({ initialCandidates: [first] });
    expect(current.open).toBe(true);
    expect(localStorage.getItem(LOST_DRAWING_PROMPT_SHOWN_KEY)).toBe("1");
    act(() => current.close());
    expect(current.open).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
    for (const records of [[first], [first, candidate(2)]]) {
      act(() => root.unmount());
      root = createRoot(container);
      await render({ initialCandidates: records });
      expect(current.open).toBe(false);
      expect(current.candidates).toEqual(records);
    }
    expect(options.onRestore).not.toHaveBeenCalled();
  });

  it("표시 기록이 있어도 사용자가 직접 검색하면 보관된 그림을 다시 선택할 수 있다", async () => {
    const found = candidate();
    localStorage.setItem(LOST_DRAWING_PROMPT_SHOWN_KEY, "1");
    await render({ initialCandidates: [found] });
    expect(current.open).toBe(false);
    mocks.list.mockResolvedValue([found]);
    await act(async () => { await current.scan(); });
    expect(current.open).toBe(true);
    expect(current.candidates).toEqual([found]);
    act(() => current.close());
    expect(current.open).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("닫은 뒤 다른 클라우드 기록이 발견되어도 자동 팝업을 다시 띄우지 않는다", async () => {
    await render({ initialCandidates: [candidate()] });
    act(() => current.close());
    await render({ uid: "user-a", scores: [cloud("user-a", 2)] });
    expect(current.candidates).toEqual([candidate(2, "cloud")]);
    expect(current.open).toBe(false);
  });

  it("아직 화면에 표시하지 못한 경우에는 한 번 표시 기회를 소비하지 않는다", async () => {
    await render({ initialCandidates: [candidate()], enabled: false });
    expect(current.open).toBe(false);
    expect(localStorage.getItem(LOST_DRAWING_PROMPT_SHOWN_KEY)).toBeNull();
    await render({ enabled: true, allowAutomatic: false });
    expect(current.open).toBe(false);
    expect(localStorage.getItem(LOST_DRAWING_PROMPT_SHOWN_KEY)).toBeNull();
    await render({ allowAutomatic: true });
    expect(current.open).toBe(true);
    expect(localStorage.getItem(LOST_DRAWING_PROMPT_SHOWN_KEY)).toBe("1");
  });

  it("수동으로 먼저 확인한 뒤에도 다음 시작에서 자동으로 다시 띄우지 않는다", async () => {
    await render();
    await act(async () => { await current.scan(); });
    expect(current.open).toBe(true);
    act(() => current.close());
    act(() => root.unmount());
    root = createRoot(container);
    await render({ initialCandidates: [candidate()] });
    expect(current.open).toBe(false);
  });

  it("영구 저장 공간이 막혀도 세션에 표시 여부를 보관하고 복구 원본은 변경하지 않는다", async () => {
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (this === localStorage && key === LOST_DRAWING_PROMPT_SHOWN_KEY) throw new DOMException("quota", "QuotaExceededError");
      return write.call(this, key, value);
    });
    await render({ initialCandidates: [candidate()] });
    expect(current.open).toBe(true);
    expect(sessionStorage.getItem(LOST_DRAWING_PROMPT_SHOWN_KEY)).toBe("1");
    act(() => current.close());
    act(() => root.unmount());
    root = createRoot(container);
    await render({ initialCandidates: [candidate(2)] });
    expect(current.open).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(options.onRestore).not.toHaveBeenCalled();
  });

  it("이미 있는 그림과 그 일부인 이전 저장본은 걸러 내고 누락된 그림만 자동으로 제안한다", async () => {
    const representedSubset = candidate(1);
    const represented = candidate(2);
    const missing = candidate(3);
    await render({ current: draft(2), initialCandidates: [representedSubset, represented] });
    expect(current.open).toBe(false);
    expect(current.candidates).toEqual([]);
    act(() => root.unmount());
    root = createRoot(container);
    await render({ initialCandidates: [representedSubset, represented, missing] });
    expect(current.open).toBe(true);
    expect(current.candidates).toEqual([missing]);
  });

  it("다른 프로젝트의 일반 보관본은 자동으로 열지 않고 수동 검색에서 선택할 수 있다", async () => {
    const archived = { ...candidate(1, "archive"), projectId: "another-project",
      draft: { ...draft(1), projectId: "another-project" } };
    await render({ initialCandidates: [archived] });
    expect(current.open).toBe(false);
    mocks.list.mockResolvedValue([archived]);
    await act(async () => { await current.scan(); });
    expect(current.open).toBe(true);
    expect(current.candidates).toEqual([archived]);
    expect(mocks.list).toHaveBeenLastCalledWith(true);
  });

  it("이미 현재 작품에 있는 그림은 처리 표시하여 새 곡을 시작해도 사라진 그림으로 다시 제안하지 않는다", async () => {
    const represented = candidate();
    await render({ current: draft(1), initialCandidates: [represented] });
    expect(mocks.resolve).toHaveBeenCalledWith(represented.id, "represented");
    expect(current.open).toBe(false);
    await render({ current: { ...draft(), projectId: "intentional-new-project" } });
    expect(current.open).toBe(false);
    expect(current.candidates).toEqual([]);
    expect(options.onRestore).not.toHaveBeenCalled();
  });

  it("사용자가 복구하기 전에는 원본 저장소와 현재 그림을 바꾸지 않는다", async () => {
    const found = candidate();
    const raw = JSON.stringify(draft(1));
    localStorage.setItem(DRAFT_STORAGE_KEY, raw);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const deletes = vi.spyOn(Storage.prototype, "removeItem");
    const original = options.current;
    await render({ initialCandidates: [found] });
    expect(current.open).toBe(true);
    expect(options.current).toBe(original);
    expect(options.onRestore).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(raw);
    expect(writes.mock.calls).toEqual([[LOST_DRAWING_PROMPT_SHOWN_KEY, "1"]]);
    expect(deletes).not.toHaveBeenCalled();
  });

  it("복구하지 않기 선택의 저장에 실패하면 팝업과 원본 후보를 유지한다", async () => {
    const found = candidate();
    const raw = JSON.stringify(draft(1));
    localStorage.setItem(DRAFT_STORAGE_KEY, raw);
    mocks.resolve.mockResolvedValue(false);
    await render({ initialCandidates: [found] });
    await act(async () => { await current.dismiss(); });
    expect(mocks.resolve).toHaveBeenCalledWith(found.id, "dismissed");
    expect(current.open).toBe(true);
    expect(current.candidates).toEqual([found]);
    expect(current.error).toBeTruthy();
    expect(current.working).toBe(false);
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(raw);
    expect(options.onRestore).not.toHaveBeenCalled();
  });

  it("복구하지 않기 선택이 저장되면 닫고 다음 시작의 미해결 목록에 없으면 다시 열지 않는다", async () => {
    const found = candidate();
    await render({ initialCandidates: [found] });
    await act(async () => { await current.dismiss(); });
    expect(current.open).toBe(false);
    expect(current.candidates).toEqual([]);
    expect(current.error).toBe("");
    act(() => root.unmount());
    root = createRoot(container);
    await render({ initialCandidates: [] });
    expect(current.open).toBe(false);
    expect(options.onRestore).not.toHaveBeenCalled();
  });

  it("처리한 후보까지 수동으로 찾아본 뒤 닫으면 자동 제안으로 다시 열리지 않는다", async () => {
    const found = candidate();
    mocks.list.mockResolvedValue([found]);
    await render();
    await act(async () => { await current.scan(); });
    expect(mocks.list).toHaveBeenCalledWith(true);
    expect(current.open).toBe(true);
    act(() => current.close());
    await render({ current: { ...options.current, title: "현재 제목만 수정" } });
    expect(current.open).toBe(false);
    expect(current.candidates).toEqual([found]);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("검색이 원본 보관을 확인했을 때만 상위 저장을 재개하도록 알린다", async () => {
    await render();
    mocks.scan.mockResolvedValueOnce({ candidates: [], preserved: false });
    await act(async () => { await current.scan(); });
    expect(options.onPreserved).not.toHaveBeenCalled();
    mocks.scan.mockResolvedValueOnce({ candidates: [], preserved: true });
    await act(async () => { await current.scan(); });
    expect(options.onPreserved).toHaveBeenCalledOnce();
  });

  it("로그인한 계정의 클라우드 후보만 표시하고 다른 계정 후보를 복구하지 않는다", async () => {
    const accountA = candidate(1, "cloud", "user-a");
    const accountB = candidate(2, "cloud", "user-b");
    await render({ uid: "user-a", initialCandidates: [accountA, accountB] });
    expect(current.candidates).toEqual([accountA]);
    await act(async () => { await current.restore(accountB); });
    expect(options.onRestore).not.toHaveBeenCalled();
    expect(current.error).toContain("계정");
    await render({ uid: "user-b" });
    expect(current.candidates).toEqual([accountB]);
    await render({ uid: null });
    expect(current.candidates).toEqual([]);
  });

  it("클라우드 보관이 대기 중 계정이 바뀌어도 이전 계정의 완료 결과를 새 목록에 넣지 않는다", async () => {
    const first = deferred<LostDrawingRecoveryCandidate[]>();
    mocks.add.mockImplementationOnce(() => first.promise);
    await render({ uid: "user-a", scores: [cloud("user-a")] });
    expect(mocks.add).toHaveBeenCalledOnce();
    await render({ uid: "user-b", scores: [cloud("user-b", 2)] });
    const accountB = current.candidates;
    expect(accountB).toHaveLength(1);
    expect(accountB[0].source).toBe("cloud:user-b:score-user-b");
    await act(async () => { first.resolve([candidate(1, "cloud", "user-a")]); });
    expect(current.candidates).toEqual(accountB);
  });

  it("계정 전환 직후 남아 있는 다른 계정 악보를 새 계정 출처로 보관하지 않는다", async () => {
    await render({ uid: "user-b", scores: [cloud("user-a")] });
    expect(mocks.add).not.toHaveBeenCalled();
    expect(current.candidates).toEqual([]);
  });

  it("소유자 필드가 없던 예전 악보도 목록 조회 계정이 다르면 새 계정의 후보로 넣지 않는다", async () => {
    const legacy = cloud("user-a");
    const { cloudOwnerId: _owner, ...ownerless } = legacy.draft;
    await render({ uid: "user-b", scoresUid: "user-a", scores: [{ ...legacy, draft: ownerless }] });
    expect(mocks.add).not.toHaveBeenCalled();
    expect(current.candidates).toEqual([]);
    await render({ uid: "user-a", scoresUid: "user-a" });
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(current.candidates[0].source).toBe("cloud:user-a:score-user-a");
  });

  it("사용 불가 클라우드 악보에 남은 그림도 계정 출처를 붙여 제안한다", async () => {
    const unavailable: CloudScoreListItem = { id: "old-score", title: "이전 그림", creator: "새봄", songLength: 8,
      updatedAt: 1000, draft: null, unavailableReason: "설정 손상", recoveryProjectId: "project-one",
      recoveryScenes: draft(1).musicVideoScenes };
    await render({ uid: "user-a", scores: [unavailable] });
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(current.candidates).toHaveLength(1);
    expect(current.candidates[0]).toMatchObject({ source: "cloud:user-a:old-score", partial: true,
      scenes: unavailable.recoveryScenes });
    expect(current.candidates[0].draft).toBeUndefined();
  });

  it("복구 저장 콜백이 성공한 다음 처리 표시를 남기고 팝업을 닫는다", async () => {
    const found = candidate();
    const restored = deferred<void>();
    const order: string[] = [];
    options = { ...options, onRestore: vi.fn(() => restored.promise.then(() => { order.push("restored"); })) };
    mocks.resolve.mockImplementation(async () => { order.push("acknowledged"); return true; });
    await render({ initialCandidates: [found] });
    let pending!: Promise<void>;
    await act(async () => { pending = current.restore(found); });
    expect(current.working).toBe(true);
    expect(options.onRestore).toHaveBeenCalledWith(found);
    expect(mocks.resolve).not.toHaveBeenCalled();
    await act(async () => { restored.resolve(); await pending; });
    expect(order).toEqual(["restored", "acknowledged"]);
    expect(mocks.resolve).toHaveBeenCalledWith(found.id, "restored");
    expect(current.candidates).toEqual([]);
    expect(current.open).toBe(false);
    expect(current.working).toBe(false);
  });

  it("복구 저장이 실패하면 처리 표시를 남기지 않고 원본 후보를 다시 선택할 수 있다", async () => {
    const found = candidate();
    options = { ...options, onRestore: vi.fn().mockRejectedValue(new Error("복구 사본을 저장하지 못했어요")) };
    await render({ initialCandidates: [found] });
    await act(async () => { await current.restore(found); });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(current.open).toBe(true);
    expect(current.candidates).toEqual([found]);
    expect(current.error).toContain("저장하지 못했");
    expect(current.working).toBe(false);
  });

  it("복구 완료 표시가 영구 저장되지 않으면 후보와 원본 기록을 제거하지 않는다", async () => {
    const found = candidate();
    const raw = JSON.stringify(draft(1));
    localStorage.setItem(DRAFT_STORAGE_KEY, raw);
    mocks.resolve.mockResolvedValue(false);
    await render({ initialCandidates: [found] });
    await act(async () => { await current.restore(found); });
    expect(options.onRestore).toHaveBeenCalledOnce();
    expect(current.open).toBe(true);
    expect(current.candidates).toEqual([found]);
    expect(current.error).toBeTruthy();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(raw);
  });

  it("복구 후 처리 표시만 실패했을 때 다시 누르면 사본을 중복 생성하지 않고 표시만 재시도한다", async () => {
    const found = candidate();
    mocks.resolve.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await render({ initialCandidates: [found] });
    await act(async () => { await current.restore(found); });
    expect(current.open).toBe(true);
    expect(current.error).toBeTruthy();
    await act(async () => { await current.restore(found); });
    expect(options.onRestore).toHaveBeenCalledOnce();
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    expect(mocks.resolve).toHaveBeenLastCalledWith(found.id, "restored");
    expect(current.open).toBe(false);
    expect(current.candidates).toEqual([]);
  });

  it("빠르게 복구 버튼을 두 번 눌러도 저장 콜백은 한 번만 실행한다", async () => {
    const found = candidate();
    const restored = deferred<void>();
    options = { ...options, onRestore: vi.fn(() => restored.promise) };
    await render({ initialCandidates: [found] });
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => { first = current.restore(found); second = current.restore(found); });
    expect(options.onRestore).toHaveBeenCalledOnce();
    await act(async () => { restored.resolve(); await Promise.all([first, second]); });
    expect(mocks.resolve).toHaveBeenCalledOnce();
  });
});
