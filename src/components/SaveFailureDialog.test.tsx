// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import SaveFailureDialog from "./SaveFailureDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("저장 실패 안내", () => {
  it("실패한 마디와 위치 이동 기능을 보여준다", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const issue = { target: "measure" as const, measureIndex: 2, message: "3마디의 음표를 확인해 주세요." };
    const onLocate = vi.fn();
    act(() => root.render(<SaveFailureDialog issues={[issue]} onClose={() => undefined} onLocate={onLocate} />));

    expect(container.textContent).toContain("악보를 저장하지 못했어요");
    expect(container.textContent).toContain("3마디의 음표를 확인해 주세요.");
    const locateButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("위치 보기"));
    await act(async () => locateButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onLocate).toHaveBeenCalledWith(issue);
    act(() => root.unmount());
  });

  it("연결 문제에는 이동 버튼을 표시하지 않는다", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<SaveFailureDialog
      issues={[{ target: "cloud", message: "인터넷 연결을 확인해 주세요." }]}
      onClose={() => undefined} onLocate={() => undefined} />));
    expect(container.textContent).not.toContain("위치 보기");
    act(() => root.unmount());
  });
});
