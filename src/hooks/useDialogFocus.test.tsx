import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogFocus } from "./useDialogFocus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function Dialog({ nested = false }: { nested?: boolean }) {
  const ref = useDialogFocus();
  return <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true">
    <button>닫기</button><button disabled>사용 불가</button><button>저장</button>
    {nested && <section role="dialog" aria-modal="true"><button>안쪽 닫기</button><button>안쪽 확인</button></section>}
  </div>;
}

function mount(nested = false) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<Dialog nested={nested} />));
}

function HiddenControlsDialog() {
  const ref = useDialogFocus();
  return <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true">
    <button>닫기</button>
    <details><summary>더 보기</summary><button>접힌 내용</button></details>
    <div style={{ display: "none" }}>
      <section role="dialog" aria-modal="true"><button>숨겨진 다른 창</button></section>
    </div>
  </div>;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.replaceChildren();
  root = null;
  vi.restoreAllMocks();
});

describe("dialog keyboard focus", () => {
  it("enters the dialog and wraps around enabled controls", () => {
    mount();
    const buttons = host!.querySelectorAll("button");
    expect(document.activeElement).toBe(buttons[0]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true }));
    expect(document.activeElement).toBe(buttons[2]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }));
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("contains focus in the front nested dialog", () => {
    mount(true);
    const buttons = host!.querySelectorAll<HTMLButtonElement>("section button");
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }));
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("ignores a dialog hidden by its parent and wraps to a closed disclosure summary", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<HiddenControlsDialog />));
    const first = host.querySelector("button")!;
    const summary = host.querySelector("summary")!;
    expect(document.activeElement).toBe(first);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true }));
    expect(document.activeElement).toBe(summary);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", cancelable: true }));
    expect(document.activeElement).toBe(first);
  });

  it("returns focus to the opener after closing", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.push(callback); return frames.length; });
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    mount();
    act(() => root?.unmount());
    root = null;
    frames.forEach((callback) => callback(0));
    expect(document.activeElement).toBe(opener);
  });
});
