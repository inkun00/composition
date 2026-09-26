// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomrSetupDialog from "./HomrSetupDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(hosted: boolean, onReady = vi.fn()) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<HomrSetupDialog open hosted={hosted} onClose={vi.fn()} onReady={onReady} />));
  return onReady;
}

function setDevice(userAgent: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: userAgent });
}

async function waitFor(testId: string): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (element) return element;
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });
  }
  throw new Error(`${testId} 요소를 기다렸지만 찾지 못했습니다.`);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  Reflect.deleteProperty(window.navigator, "userAgent");
  vi.unstubAllGlobals();
  root = null;
  container = null;
});

describe("악보 사진 읽기 준비 안내", () => {
  it("배포판 Windows에서 도우미 다운로드와 연결 확인을 안내한다", async () => {
    setDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    let connected = false;
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (!connected) throw new Error("local helper missing");
      return new Response(JSON.stringify({ available: true, runner: "uvx", platform: "win32", detail: "ready" }), {
        status: 200
      });
    }));
    const onReady = render(true);

    const download = await waitFor("homr-helper-download") as HTMLAnchorElement;
    expect(download.getAttribute("href")).toBe("/start-score-reader.cmd");
    expect(document.body.textContent).toContain("받은 파일 열기");
    expect(document.querySelector<HTMLAnchorElement>('a[href="https://nodejs.org/ko/download"]')).not.toBeNull();

    connected = true;
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-testid="homr-retry"]')?.click(); });
    const start = await waitFor("homr-start");
    act(() => start.click());
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("도우미가 연결되면 읽기 도구를 버튼 하나로 준비한다", async () => {
    setDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    let installed = false;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") installed = true;
      return new Response(JSON.stringify({ available: installed, runner: installed ? "uvx" : null,
        platform: "win32", detail: "ready" }), { status: 200 });
    }));
    render(true);
    const install = await waitFor("homr-install");
    await act(async () => { install.click(); });
    expect(document.querySelector('[data-testid="homr-start"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="homr-helper-download"]')).toBeNull();
  });

  it("Python이 없으면 설치 링크와 다시 준비하기 버튼을 보여 준다", async () => {
    setDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ code: "PYTHON_NOT_FOUND", message: "Python 설치가 필요해요." }), {
          status: 412, headers: { "Content-Type": "application/json" }
        })
        : new Response(JSON.stringify({ available: false, runner: null, platform: "win32", detail: "missing" }), {
          status: 200
        })));
    render(true);
    const install = await waitFor("homr-install");
    await act(async () => { install.click(); });
    expect(document.querySelector<HTMLAnchorElement>('a[href="https://www.python.org/downloads/"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="homr-retry"]')?.textContent).toContain("다시 준비하기");
  });

  it("휴대폰에는 실행할 수 없는 도우미 파일을 권하지 않는다", async () => {
    setDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("local helper missing"); }));
    render(true);
    await waitFor("homr-device-unsupported");
    expect(document.querySelector('[data-testid="homr-helper-download"]')).toBeNull();
    expect(document.body.textContent).toContain("Windows 컴퓨터");
  });
});
