import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedDraft } from "../music/draft";
import { useBrowserProjectAutosave } from "./useBrowserProjectAutosave";

const { checkpoint, save } = vi.hoisted(() => ({ checkpoint: vi.fn(), save: vi.fn() }));
vi.mock("../music/projectStorage", () => ({ checkpointBrowserProject: checkpoint, saveBrowserProjectDraft: save }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let current: ReturnType<typeof useBrowserProjectAutosave>;
const oldDraft = { title: "앞 그림" } as SavedDraft;
const latestDraft = { title: "마지막 그림" } as SavedDraft;

function Harness({ draft, enabled = true }: { draft: SavedDraft; enabled?: boolean }) {
  current = useBrowserProjectAutosave(draft, enabled);
  return <output>{current.status}</output>;
}

beforeEach(() => {
  checkpoint.mockReset().mockReturnValue(true);
  save.mockReset().mockResolvedValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("모든 그림 변경의 즉시 브라우저 자동 저장", () => {
  it("첫 프레임에 동기로 체크포인트하고 마지막 그림으로 pagehide·숨김·종료를 처리한다", async () => {
    act(() => root.render(<Harness draft={oldDraft} />));
    expect(checkpoint).toHaveBeenLastCalledWith(oldDraft);
    await act(async () => root.render(<Harness draft={latestDraft} />));
    expect(checkpoint).toHaveBeenLastCalledWith(latestDraft);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(save).toHaveBeenLastCalledWith(latestDraft);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(checkpoint).toHaveBeenLastCalledWith(latestDraft);
    await act(async () => window.dispatchEvent(new Event("beforeunload")));
    expect(save).toHaveBeenLastCalledWith(latestDraft);
    expect(current.status).toContain("자동 저장됨");
  });

  it("저장 실패를 알리고 느린 이전 저장이 최신 실패 표시를 성공으로 바꾸지 않는다", async () => {
    let finishOld: ((result: boolean) => void) | undefined;
    save.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishOld = resolve; }));
    save.mockResolvedValue(false);
    await act(async () => root.render(<Harness draft={oldDraft} />));
    await act(async () => root.render(<Harness draft={latestDraft} />));
    expect(current.status).toContain("자동 저장 실패");
    await act(async () => finishOld!(true));
    expect(current.status).toContain("자동 저장 실패");
    expect(await current.flush()).toBe(false);
  });

  it("초기 복구 중에는 빈 draft를 저장하지 않으며 수동 flush도 비활성화한다", async () => {
    await act(async () => root.render(<Harness draft={oldDraft} enabled={false} />));
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(checkpoint).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(await current.flush()).toBe(false);
    await act(async () => root.render(<Harness draft={latestDraft} enabled />));
    expect(save).toHaveBeenLastCalledWith(latestDraft);
  });
});
