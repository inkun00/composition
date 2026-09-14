// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudScoreListItem } from "../firebase/scores";
import { useCloudScoreList } from "./useCloudScoreList";

const { subscribeMock } = vi.hoisted(() => ({ subscribeMock: vi.fn() }));
vi.mock("../firebase/scores", () => ({ subscribeCloudScores: subscribeMock }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = {
  uid: string;
  update: (scores: CloudScoreListItem[], fromCache: boolean) => void;
  fail: (error: Error) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};

let listeners: Listener[];
let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useCloudScoreList>;

function Harness({ uid }: Readonly<{ uid: string | null }>) {
  current = useCloudScoreList(uid);
  return null;
}

beforeEach(() => {
  listeners = [];
  subscribeMock.mockReset();
  subscribeMock.mockImplementation((uid, update, fail) => {
    const unsubscribe = vi.fn();
    listeners.push({ uid, update, fail, unsubscribe });
    return unsubscribe;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(uid: string | null) {
  await act(async () => { root.render(<Harness uid={uid} />); });
}

describe("기기 간 악보 목록 동기화", () => {
  it("다른 기기의 새 저장을 실시간으로 받고 서버 확인 전 빈 캐시를 0개로 확정하지 않는다", async () => {
    await render("user-a");
    expect(listeners[0].uid).toBe("user-a");
    act(() => listeners[0].update([], true));
    expect(current.status).toBe("stale");
    const remoteScore = { id: "remote-score", title: "다른 컴퓨터 노래" } as CloudScoreListItem;
    act(() => listeners[0].update([remoteScore], false));
    expect(current.status).toBe("ready");
    expect(current.scores).toEqual([remoteScore]);
  });

  it("조회 실패 시 저장된 목록을 유지하고 다시 확인할 수 있다", async () => {
    const loggedError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await render("user-a");
    const score = { id: "score-a" } as CloudScoreListItem;
    act(() => listeners[0].update([score], false));
    act(() => listeners[0].fail(new Error("network")));
    expect(current.status).toBe("error");
    expect(current.scores).toEqual([score]);
    act(() => current.retry());
    await act(async () => { await Promise.resolve(); });
    expect(listeners[0].unsubscribe).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(2);
    expect(current.scores).toEqual([score]);
    loggedError.mockRestore();
  });

  it("다른 계정으로 전환하면 이전 계정의 악보를 지운다", async () => {
    await render("user-a");
    act(() => listeners[0].update([{ id: "private-a" } as CloudScoreListItem], false));
    await render("user-b");
    expect(listeners[0].unsubscribe).toHaveBeenCalledOnce();
    expect(listeners[1].uid).toBe("user-b");
    expect(current.scores).toEqual([]);
    expect(current.status).toBe("loading");
  });

  it("연결이 다시 되면 오류가 난 목록을 자동으로 다시 구독한다", async () => {
    const loggedError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await render("user-a");
    act(() => listeners[0].fail(new Error("offline")));
    expect(current.status).toBe("error");
    await act(async () => { window.dispatchEvent(new Event("online")); await Promise.resolve(); });
    expect(listeners[0].unsubscribe).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(2);
    loggedError.mockRestore();
  });
});
