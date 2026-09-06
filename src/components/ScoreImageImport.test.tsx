// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedDraft } from "../music/draft";
import ScoreImageImport from "./ScoreImageImport";

vi.mock("./ScoreMeasure", () => ({ default: () => <div data-testid="mock-score-measure" /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:score-preview") });
Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });

const baseDraft: SavedDraft = {
  version: 1,
  updatedAt: 1,
  sourceHash: "",
  title: "새 노래",
  creator: "작곡가",
  originalCreator: "작곡가",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 8,
  instrumentId: "piano",
  lyrics: Array(8).fill(""),
  measures: Array.from({ length: 8 }, () => ({ candidateId: null, candidateName: null, notes: null })),
  showArrangement: false
};

const shortMusicXml = `<?xml version="1.0"?>
  <score-partwise version="4.0">
    <work><work-title>사진 속 노래</work-title></work>
    <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><type>half</type></note>
    </measure></part>
  </score-partwise>`;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function button(testId: string): HTMLButtonElement {
  const result = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!result) throw new Error(`${testId} 버튼을 찾지 못했습니다.`);
  return result;
}

async function waitForTestId<T extends HTMLElement>(testId: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = document.querySelector<T>(`[data-testid="${testId}"]`);
    if (result) return result;
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });
  }
  throw new Error(`${testId} 요소를 기다렸지만 나타나지 않았습니다.`);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

describe("악보 이미지·MusicXML 가져오기", () => {
  it("박자가 모자란 MusicXML을 검수하고 쉼표로 채운 뒤 프로젝트로 적용한다", async () => {
    const onImport = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<ScoreImageImport baseDraft={baseDraft} onImport={onImport} />));
    act(() => button("score-import-open").click());

    const input = document.querySelector<HTMLInputElement>('[data-testid="score-import-file"]');
    const file = new File([shortMusicXml], "song.musicxml", { type: "application/xml" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    act(() => input?.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => {
      button("score-import-recognize").click();
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });

    expect(button("score-import-apply").disabled).toBe(true);
    act(() => button("score-import-fill-rest").click());
    expect(button("score-import-apply").disabled).toBe(false);
    act(() => button("score-import-apply").click());

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0][0]).toMatchObject({
      title: "사진 속 노래",
      meter: { beats: 4, beatUnit: 4 },
      songLength: 8
    });
    expect(onImport.mock.calls[0][0].measures[0].notes).toHaveLength(2);
  });

  it("이미지는 외부 API로 보내지 않고 로컬 homr 준비 창을 연다", async () => {
    const onImport = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      available: false,
      runner: null,
      platform: "win32",
      detail: "homr 실행환경을 한 번 준비해야 해요."
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<ScoreImageImport baseDraft={baseDraft} onImport={onImport} />));
    act(() => button("score-import-open").click());

    const input = document.querySelector<HTMLInputElement>('[data-testid="score-import-file"]');
    const file = new File([new Uint8Array([1, 2, 3])], "score.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    act(() => input?.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });

    expect(document.querySelector('[data-testid="score-import-local-guide"]')).not.toBeNull();
    expect(document.body.textContent).toContain("사진을 불러왔어요");
    expect(document.querySelector('[data-testid="homr-setup-dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("악보 사진 읽기");
    expect(document.body.textContent).toContain("지금 준비하기");
    const closeButton = document.querySelector<HTMLButtonElement>('[data-testid="homr-setup-close"]');
    act(() => closeButton?.click());
    expect(document.querySelector('[data-testid="homr-setup-dialog"]')).toBeNull();
    expect(document.body.textContent).toContain("악보 읽기 준비 보기");
    expect(onImport).not.toHaveBeenCalled();
  });

  it("homr가 만든 MusicXML을 기존 검수 화면으로 바로 연결한다", async () => {
    const onImport = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/homr/status")) {
        return new Response(JSON.stringify({
          available: true,
          runner: "uvx",
          platform: "win32",
          detail: "준비됐어요."
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      expect(init?.method).toBe("POST");
      const bytes = new TextEncoder().encode(shortMusicXml);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer
      } as Response;
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<ScoreImageImport baseDraft={baseDraft} onImport={onImport} />));
    act(() => button("score-import-open").click());

    const input = document.querySelector<HTMLInputElement>('[data-testid="score-import-file"]');
    const file = new File([new Uint8Array([1, 2, 3])], "score.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    act(() => input?.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });

    const start = await waitForTestId<HTMLButtonElement>("homr-start");
    act(() => {
      start.click();
    });
    await waitForTestId("score-import-review-ready");

    expect(button("score-import-fill-rest")).toBeTruthy();
    expect(document.body.textContent).toContain("사진 속 노래");
    expect(document.querySelector('[data-testid="score-import-review-ready"]')).not.toBeNull();
    expect(document.body.textContent).toContain("악보 인식이 끝났어요");
    expect(onImport).not.toHaveBeenCalled();
  });

  it("homr가 처리하는 동안 이미지 대신 경과 시간을 분명하게 표시한다", async () => {
    const onImport = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/homr/status")) {
        return new Response(JSON.stringify({
          available: true,
          runner: "uvx",
          platform: "win32",
          detail: "준비됐어요."
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Promise<Response>(() => undefined);
    }));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<ScoreImageImport baseDraft={baseDraft} onImport={onImport} />));
    act(() => button("score-import-open").click());

    const input = document.querySelector<HTMLInputElement>('[data-testid="score-import-file"]');
    const file = new File([new Uint8Array([1, 2, 3])], "score.png", { type: "image/png" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    act(() => input?.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });

    const start = document.querySelector<HTMLButtonElement>('[data-testid="homr-start"]');
    await act(async () => {
      start?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    });

    const progress = document.querySelector('[data-testid="score-import-recognition-progress"]');
    expect(progress).not.toBeNull();
    expect(progress?.textContent).toContain("악보 읽는 중");
    expect(progress?.textContent).toContain("완료되면 자동으로 마디별 검수 화면");
    expect(document.body.textContent).toContain("보통 30초~2분 걸려요");
  });
});
