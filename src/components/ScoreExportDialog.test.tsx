// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScoreExportDialog from "./ScoreExportDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderDialog(onSelect = vi.fn(), onCancel = vi.fn()) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<ScoreExportDialog onSelect={onSelect} onCancel={onCancel} />));
  return { onSelect, onCancel };
}

function click(testId: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("악보 저장 방법 선택", () => {
  it("반주 미포함을 고르면 false를 전달한다", () => {
    const { onSelect } = renderDialog();
    click("score-export-without-accompaniment");
    expect(onSelect).toHaveBeenCalledWith(false);
  });

  it("반주 포함을 고르면 true를 전달한다", () => {
    const { onSelect } = renderDialog();
    click("score-export-with-accompaniment");
    expect(onSelect).toHaveBeenCalledWith(true);
  });

  it("Escape를 누르면 저장하지 않고 닫는다", () => {
    const { onSelect, onCancel } = renderDialog();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
