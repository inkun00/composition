// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudScore } from "../firebase/scores";
import { draftFingerprint, type SavedDraft } from "../music/draft";
import * as draftModule from "../music/draft";
import { useCloudProjectAutosave } from "./useCloudProjectAutosave";

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));
vi.mock("../firebase/scores", () => ({ saveCloudScore: saveMock }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Options = Parameters<typeof useCloudProjectAutosave>[0];
let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useCloudProjectAutosave>;
let options: Options;
let online: ReturnType<typeof vi.spyOn>;

function draft(revision = 1, binding = true): SavedDraft {
  return {
    version: 1, updatedAt: revision * 1000, projectId: "project-one",
    ...(binding ? { cloudScoreId: "saved-score", cloudOwnerId: "user-a" } : {}),
    sourceHash: "", title: "그림을 지켜요", creator: "새봄", originalCreator: "새봄",
    presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano",
    lyrics: Array(8).fill("별"), showArrangement: true,
    measures: Array.from({ length: 8 }, (_, index) => ({ candidateId: "custom", candidateName: "가락",
      notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "별" }] })),
    musicVideoScenes: [{ id: "scene-one", background: "#ffffff", motion: "float", endLyric: null, endMeasureIndex: 7,
      elements: Array.from({ length: revision }, (_, index) => ({ id: `stroke-${index}`, tool: "brush", color: "#123456",
        width: 8, points: [[10, 20, .5], [30 + index, 40, .75]] })) }]
  };
}

function score(saved: SavedDraft, id = saved.cloudScoreId ?? saved.projectId!): CloudScore {
  return { id, title: saved.title, creator: saved.creator, songLength: saved.songLength,
    updatedAt: saved.updatedAt, draft: saved };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (failure: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function Harness({ value }: Readonly<{ value: Options }>) {
  current = useCloudProjectAutosave(value);
  return null;
}

async function render(patch: Partial<Options> = {}) {
  options = { ...options, ...patch };
  await act(async () => { root.render(<Harness value={options} />); });
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

async function event(type: "online" | "pagehide") {
  await act(async () => { window.dispatchEvent(new Event(type)); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T03:00:00.000Z"));
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  saveMock.mockReset();
  saveMock.mockImplementation(async (_uid: string, saved: SavedDraft, id: string) => score(saved, id));
  options = { draft: draft(), uid: "user-a", enabled: true, scores: [], listStatus: "ready", onSaved: vi.fn() };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("뮤직비디오 그림의 프로젝트 자동 저장", () => {
  it("로그아웃하거나 저장이 비활성화되면 그림 전체를 직렬화하지 않는다", async () => {
    const fingerprint = vi.spyOn(draftModule, "draftFingerprint");
    await render({ uid: null });
    await render({ draft: draft(2) });
    await event("pagehide");
    await event("online");
    await render({ uid: "user-a", enabled: false, draft: draft(3) });
    await event("pagehide");
    expect(fingerprint).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("상태 표시와 부모 렌더·종료 저장이 같은 그림의 fingerprint를 반복 계산하지 않는다", async () => {
    const fingerprint = vi.spyOn(draftModule, "draftFingerprint");
    await render();
    await render({ onSaved: vi.fn() });
    await advance(700);
    await event("pagehide");
    expect(fingerprint).toHaveBeenCalledOnce();
    expect(saveMock).toHaveBeenCalledOnce();
    const changed = draft(2);
    await render({ draft: changed });
    await event("pagehide");
    expect(fingerprint).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][1]).toEqual(changed);
  });

  it("부모에서 계산한 fingerprint는 해당 그림에 연결해 최신 그림까지 중복 계산 없이 저장한다", async () => {
    const previous = draft();
    const changed = draft(2);
    const previousFingerprint = draftFingerprint(previous);
    const changedFingerprint = draftFingerprint(changed);
    const fingerprint = vi.spyOn(draftModule, "draftFingerprint");
    await render({ draft: previous, fingerprint: previousFingerprint });
    await advance(700);
    await render({ draft: changed, fingerprint: changedFingerprint });
    await event("pagehide");
    expect(fingerprint).not.toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][1]).toEqual(changed);
    expect(options.onSaved).toHaveBeenLastCalledWith(score(changed), changedFingerprint, "project-one", "user-a");
  });

  it("그림을 수정하면 수동 버튼 없이 기존 프로젝트에 저장하고 편집 시간을 유지한다", async () => {
    const previous = draft();
    await render({ draft: previous, scores: [score(previous)] });
    await advance(700);
    expect(saveMock).not.toHaveBeenCalled();
    const changed = draft(2);
    await render({ draft: changed });
    await advance(699);
    expect(saveMock).not.toHaveBeenCalled();
    await advance(1);
    expect(saveMock).toHaveBeenCalledOnce();
    expect(saveMock).toHaveBeenCalledWith("user-a", changed, "saved-score");
    expect(options.onSaved).toHaveBeenLastCalledWith(score(changed), draftFingerprint(changed), "project-one", "user-a");
    expect(current.status).toContain("자동 저장됨");
    expect(current.error).toBe("");
  });

  it("처음 그린 그림에도 안정적인 프로젝트 ID를 사용하고 재시작 후 같은 문서를 이어 쓴다", async () => {
    await render({ draft: draft(1, false) });
    await advance(700);
    expect(saveMock.mock.calls[0][2]).toBe("project-one");
    const stored = saveMock.mock.calls[0][1] as SavedDraft;
    expect(stored).toMatchObject({ cloudScoreId: "project-one", cloudOwnerId: "user-a" });
    act(() => root.unmount());
    root = createRoot(container);
    await render({ draft: stored, scores: [score(stored)] });
    await advance(700);
    expect(saveMock).toHaveBeenCalledOnce();
    await render({ draft: { ...draft(2), cloudScoreId: stored.cloudScoreId } });
    await advance(700);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][2]).toBe("project-one");
  });

  it("서버 그림이 이미 같을 때 계정 연결과 목록 콜백이 다시 렌더해도 확인을 반복하지 않는다", async () => {
    const saved = score(draft());
    const acknowledged = vi.fn((result: CloudScore, _fingerprint: string, _projectId: string, uid: string) => {
      // App acknowledges a save by updating both identity and the score list.
      options = { ...options, draft: { ...options.draft, cloudOwnerId: uid, cloudScoreId: result.id }, scores: [result] };
      root.render(<Harness value={options} />);
    });
    await render({ scores: [saved], onSaved: acknowledged });
    await advance(700);
    expect(acknowledged).toHaveBeenCalledOnce();
    await advance(10_000);
    expect(acknowledged).toHaveBeenCalledOnce();
    expect(saveMock).not.toHaveBeenCalled();
    expect(current.status).toContain("자동 저장됨");
  });

  it("로그아웃·조회 중·빈 신규 프로젝트에서는 자동 문서를 만들지 않는다", async () => {
    await render({ uid: null });
    await advance(2000);
    await render({ uid: "user-a", listStatus: "loading" });
    await advance(2000);
    await render({ listStatus: "ready", draft: { ...draft(1, false), musicVideoScenes: [] } });
    await advance(2000);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("오프라인 동안 그림 변경을 유지하다 연결되면 최신 그림을 자동 저장한다", async () => {
    online.mockReturnValue(false);
    await render();
    await advance(30_000);
    const latest = draft(3);
    await render({ draft: latest });
    expect(saveMock).not.toHaveBeenCalled();
    expect(current.status).toContain("연결되면");
    online.mockReturnValue(true);
    await event("online");
    expect(saveMock).toHaveBeenCalledOnce();
    expect(saveMock.mock.calls[0]).toEqual(["user-a", latest, "saved-score"]);
    await advance(700);
    expect(saveMock).toHaveBeenCalledOnce();
  });

  it("저장 중 그린 여러 변경은 병렬로 쓰지 않고 마지막 그림으로 한 번 더 저장한다", async () => {
    const first = deferred<CloudScore>();
    saveMock.mockImplementationOnce(() => first.promise);
    await render();
    await advance(700);
    expect(current.busy).toBe(true);
    await render({ draft: draft(2) });
    await advance(700);
    const latest = draft(3);
    await render({ draft: latest });
    await advance(700);
    expect(saveMock).toHaveBeenCalledOnce();
    await act(async () => { first.resolve(score(draft())); });
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1]).toEqual(["user-a", latest, "saved-score"]);
    expect(options.onSaved).toHaveBeenLastCalledWith(score(latest), draftFingerprint(latest), "project-one", "user-a");
    expect(current.busy).toBe(false);
  });

  it("다른 계정으로 바뀌면 이전 저장 결과가 새 계정의 프로젝트를 연결하지 않는다", async () => {
    const pending = deferred<CloudScore>();
    saveMock.mockImplementationOnce(() => pending.promise);
    await render();
    await advance(700);
    await render({ draft: draft(2) });
    await advance(700);
    await render({ uid: "user-b" });
    await act(async () => { pending.resolve(score(draft())); });
    await advance(2000);
    expect(saveMock).toHaveBeenCalledOnce();
    expect(options.onSaved).not.toHaveBeenCalled();
    expect(current.status).toContain("저장한 계정");
  });

  it("프로젝트 전환 전 대기하던 자동 저장이 새 프로젝트의 지연 시간을 건너뛰지 않는다", async () => {
    const pending = deferred<CloudScore>();
    saveMock.mockImplementationOnce(() => pending.promise);
    await render();
    await advance(700);
    await render({ draft: draft(2) });
    await advance(700);
    const next = { ...draft(3), projectId: "project-two", cloudScoreId: "score-two" };
    await render({ draft: next });
    await act(async () => { pending.resolve(score(draft())); });
    expect(options.onSaved).not.toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledOnce();
    await advance(700);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1]).toEqual(["user-a", next, "score-two"]);
    expect(options.onSaved).toHaveBeenLastCalledWith(score(next), draftFingerprint(next), "project-two", "user-a");
  });

  it("지우기로 일시 중지한 프로젝트는 예약 저장이나 탭 숨김으로 다시 만들지 않는다", async () => {
    await render();
    await advance(300);
    act(() => current.pause());
    await advance(30_000);
    await event("pagehide");
    await event("online");
    await advance(1000);
    expect(saveMock).not.toHaveBeenCalled();
    await act(async () => { await current.save(); });
    expect(saveMock).toHaveBeenCalledOnce();
  });

  it("일시 중지 전에 대기 중이던 저장도 삭제 후 실행하지 않는다", async () => {
    const pending = deferred<CloudScore>();
    saveMock.mockImplementationOnce(() => pending.promise);
    await render();
    await advance(700);
    await render({ draft: draft(2) });
    await advance(700);
    act(() => current.pause());
    await act(async () => { pending.resolve(score(draft())); });
    await advance(30_000);
    expect(saveMock).toHaveBeenCalledOnce();
    expect(options.onSaved).not.toHaveBeenCalled();
  });

  it("다른 기기의 최신 프로젝트를 덮지 않고 로컬 그림을 복구 사본에 저장한다", async () => {
    const local = draft(1);
    const remote = score(draft(3));
    await render({ draft: local, scores: [remote] });
    await advance(700);
    expect(saveMock).toHaveBeenCalledOnce();
    const recoveryId = saveMock.mock.calls[0][2] as string;
    expect(recoveryId).not.toBe("saved-score");
    expect(saveMock.mock.calls[0][1]).toMatchObject({ musicVideoScenes: local.musicVideoScenes,
      projectId: recoveryId, cloudScoreId: recoveryId, updatedAt: local.updatedAt });
    expect(current.status).toContain("복구 사본");
    await advance(10_000);
    expect(saveMock).toHaveBeenCalledOnce();
    expect(vi.mocked(options.onSaved).mock.calls.every(([saved]) => saved.id === recoveryId)).toBe(true);
    let deduplicated: CloudScore | null = null;
    await act(async () => { deduplicated = await current.save(); });
    expect(deduplicated).toMatchObject({ id: recoveryId, draft: { musicVideoScenes: local.musicVideoScenes } });
    const latestLocal = { ...draft(2), updatedAt: local.updatedAt + 1 };
    await render({ draft: latestLocal });
    await advance(700);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][2]).toBe(recoveryId);
  });

  it("새 악보로 저장한 사본마다 원본과 다른 프로젝트 보관 ID를 부여한다", async () => {
    const original = draft();
    await render({ draft: original, scores: [score(original)] });
    let firstCopy: CloudScore | null = null;
    let secondCopy: CloudScore | null = null;
    await act(async () => { firstCopy = await current.save(true); });
    await act(async () => { secondCopy = await current.save(true); });
    expect(saveMock).toHaveBeenCalledTimes(2);
    const copies = [firstCopy!, secondCopy!];
    for (const copy of copies) {
      expect(copy.id).not.toBe(original.projectId);
      expect(copy.id).not.toBe(original.cloudScoreId);
      expect(copy.draft).toMatchObject({ projectId: copy.id, cloudScoreId: copy.id, cloudOwnerId: "user-a",
        musicVideoScenes: original.musicVideoScenes, updatedAt: original.updatedAt });
    }
    expect(copies[0].id).not.toBe(copies[1].id);
    expect(options.draft).toBe(original);
    expect(options.onSaved).toHaveBeenLastCalledWith(copies[1], draftFingerprint(original), "project-one", "user-a");
  });

  it("복구 사본으로 전환하면 원본에서 기다리던 작업을 취소하고 새 ID로 최신 그림을 이어 저장한다", async () => {
    const pending = deferred<CloudScore>();
    saveMock.mockImplementationOnce(() => pending.promise);
    const originalRemote = score(draft(3));
    const acknowledged = vi.fn((result: CloudScore, _fingerprint: string, requestedProjectId: string, uid: string) => {
      if (options.draft.projectId !== requestedProjectId) return;
      options = { ...options, draft: { ...options.draft, projectId: result.draft.projectId,
        cloudOwnerId: uid, cloudScoreId: result.id }, scores: [result, ...options.scores.filter((item) => item.id !== result.id)] };
      root.render(<Harness value={options} />);
    });
    await render({ scores: [originalRemote], onSaved: acknowledged });
    await advance(700);
    const recoveryId = saveMock.mock.calls[0][2] as string;
    const firstSnapshot = saveMock.mock.calls[0][1] as SavedDraft;
    expect(firstSnapshot.projectId).toBe(recoveryId);
    expect(recoveryId).not.toBe(originalRemote.draft.projectId);
    await render({ draft: draft(2) });
    await advance(700);
    await act(async () => { pending.resolve(score(firstSnapshot, recoveryId)); });
    expect(options.draft.projectId).toBe(recoveryId);
    expect(saveMock).toHaveBeenCalledOnce();
    await advance(699);
    expect(saveMock).toHaveBeenCalledOnce();
    await advance(1);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][2]).toBe(recoveryId);
    expect(saveMock.mock.calls[1][1]).toMatchObject({ projectId: recoveryId, cloudScoreId: recoveryId,
      musicVideoScenes: draft(2).musicVideoScenes, updatedAt: draft(2).updatedAt });
    expect(options.scores.find((item) => item.id === originalRemote.id)).toBe(originalRemote);
  });

  it("저장 확인 뒤 목록 갱신이 늦어도 수동 저장 결과로 예전 그림을 반환하지 않는다", async () => {
    const previous = draft(1);
    const latest = draft(2);
    await render({ draft: latest, scores: [score(previous)] });
    await advance(700);
    let deduplicated: CloudScore | null = null;
    await act(async () => { deduplicated = await current.save(); });
    expect(saveMock).toHaveBeenCalledOnce();
    expect(deduplicated).toEqual(score(latest));
    expect(options.onSaved).toHaveBeenLastCalledWith(score(latest), draftFingerprint(latest), "project-one", "user-a");
  });

  it("네트워크 저장 오류 후에는 재시도 간격을 두고 같은 문서로 최신 그림을 보낸다", async () => {
    saveMock.mockRejectedValueOnce({ code: "unavailable" });
    await render();
    await advance(700);
    expect(current.error).toContain("인터넷");
    expect(current.status).toContain("복구본");
    expect(saveMock).toHaveBeenCalledOnce();
    const latest = draft(2);
    await render({ draft: latest });
    await advance(14_999);
    expect(saveMock).toHaveBeenCalledOnce();
    await advance(1);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1]).toEqual(["user-a", latest, "saved-score"]);
    expect(current.error).toBe("");
    expect(current.status).toContain("자동 저장됨");
  });

  it("오류가 있어도 다시 연결되면 지연을 기다리지 않고 재시도한다", async () => {
    saveMock.mockRejectedValueOnce({ code: "unavailable" });
    await render();
    await advance(700);
    await event("online");
    expect(saveMock).toHaveBeenCalledTimes(2);
    await advance(15_000);
    expect(saveMock).toHaveBeenCalledTimes(2);
  });

  it("화면을 닫으면 지연 중인 최신 그림을 저장하고 언마운트 뒤에는 상태를 연결하지 않는다", async () => {
    const pending = deferred<CloudScore>();
    saveMock.mockImplementationOnce(() => pending.promise);
    await render();
    await advance(200);
    await event("pagehide");
    expect(saveMock).toHaveBeenCalledOnce();
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => { pending.resolve(score(draft())); });
    expect(options.onSaved).not.toHaveBeenCalled();
  });
});
