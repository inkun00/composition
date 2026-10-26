import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedDraft } from "../music/draft";
import { useDraftRevision } from "./useDraftRevision";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useDraftRevision>;
const initial = { version: 1, updatedAt: 0, title: "그림 노래", projectId: "project",
  meter: { beats: 4, beatUnit: 4 }, musicVideoScenes: [] } as unknown as SavedDraft;

function Harness({ draft, updatedAt }: { draft: SavedDraft; updatedAt: number }) {
  current = useDraftRevision(draft, updatedAt);
  return null;
}

function render(draft: SavedDraft, updatedAt = 111) {
  act(() => root.render(<StrictMode><Harness draft={draft} updatedAt={updatedAt} /></StrictMode>));
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("곡과 그림의 복구 revision", () => {
  it("StrictMode 복구·계정 ID 결합·Firestore 필드 순서 변경은 편집 시간이 아니다", () => {
    render(initial);
    expect(current.currentDraft.updatedAt).toBe(111);
    const fingerprint = current.fingerprint;
    render({ ...initial, meter: { beatUnit: 4, beats: 4 }, cloudScoreId: "cloud", cloudOwnerId: "owner" });
    expect(current.currentDraft.updatedAt).toBe(111);
    expect(current.fingerprint).toBe(fingerprint);
  });

  it("기기 시간이 과거이거나 같은 밀리초라도 새 그림 revision은 항상 증가한다", () => {
    render(initial, 5000);
    render({ ...initial, title: "첫 편집" }, 5000);
    expect(current.currentDraft.updatedAt).toBe(5001);
    render({ ...initial, title: "다음 편집" }, 5000);
    expect(current.currentDraft.updatedAt).toBe(5002);
  });

  it("같은 프로젝트의 저장본을 열 때 원래 시간을 채택하고 이후 편집부터 증가한다", () => {
    render(initial);
    const loaded = { ...initial, updatedAt: 7000, title: "복구된 그림" };
    current.adopt(loaded);
    render(loaded);
    expect(current.currentDraft.updatedAt).toBe(7000);
    render({ ...loaded, title: "복구 후 편집" });
    expect(current.currentDraft.updatedAt).toBe(7001);
  });
});
