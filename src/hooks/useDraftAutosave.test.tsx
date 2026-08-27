// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY, type SavedDraft } from "../music/draft";
import { useDraftAutosave } from "./useDraftAutosave";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseDraft: SavedDraft = {
  version: 1,
  updatedAt: 1,
  sourceHash: "",
  title: "처음 제목",
  creator: "새봄",
  originalCreator: "새봄",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 8,
  instrumentId: "piano",
  bpm: 96,
  lyrics: Array(8).fill(""),
  measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null })),
  showArrangement: false
};

let container: HTMLDivElement;
let root: Root;
let stored = new Map<string, string>();
let latestControls: ReturnType<typeof useDraftAutosave> | null;
const statuses: string[] = [];
const storage = {
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); }
};

function Harness({ draft }: Readonly<{ draft: SavedDraft }>) {
  latestControls = useDraftAutosave({ draft, storage, onStatus: (status) => statuses.push(status) });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  stored = new Map();
  statuses.length = 0;
  latestControls = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("프로젝트 자동저장", () => {
  it("편집 직후 페이지를 닫아도 가장 최신 상태를 즉시 저장한다", () => {
    act(() => root.render(<Harness draft={baseDraft} />));
    act(() => root.render(<Harness draft={{ ...baseDraft, title: "방금 고친 제목" }} />));
    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));

    expect(JSON.parse(stored.get(DRAFT_STORAGE_KEY) ?? "{}").title).toBe("방금 고친 제목");
    expect(statuses.at(-1)).toBe("저장됨 ✓");
  });

  it("계속 편집 중일 때는 마지막 변경 후 한 번 저장한다", () => {
    act(() => root.render(<Harness draft={baseDraft} />));
    act(() => root.render(<Harness draft={{ ...baseDraft, title: "두 번째 제목" }} />));
    expect(stored.has(DRAFT_STORAGE_KEY)).toBe(false);

    act(() => vi.advanceTimersByTime(800));
    expect(JSON.parse(stored.get(DRAFT_STORAGE_KEY) ?? "{}").title).toBe("두 번째 제목");
  });

  it("새 프로젝트를 시작할 때는 종료 저장으로 이전 곡을 되살리지 않는다", () => {
    act(() => root.render(<Harness draft={baseDraft} />));
    act(() => latestControls?.saveNow());
    expect(stored.has(DRAFT_STORAGE_KEY)).toBe(true);

    act(() => latestControls?.discardDraft());
    act(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    expect(stored.has(DRAFT_STORAGE_KEY)).toBe(false);
  });
});
