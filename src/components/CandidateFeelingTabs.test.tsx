// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MELODY_FEELING_GROUPS, type MelodyFeelingId } from "../music/melodyFeelings";
import CandidateFeelingTabs from "./CandidateFeelingTabs";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("가락 느낌 탭", () => {
  it("아이에게 느낌 이름을 보여 주고 선택한 탭을 바꾼다", () => {
    function Example() {
      const [activeId, setActiveId] = useState<MelodyFeelingId>("flowing");
      return <CandidateFeelingTabs
        groups={MELODY_FEELING_GROUPS.map((group) => ({ ...group, count: 3 }))}
        activeId={activeId} onChange={setActiveId} />;
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Example />));

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect([...tabs].map((tab) => tab.textContent)).toEqual([
      "부드럽게3", "빠르게3", "통통 튀게3", "느긋하게3", "높이 힘차게3"
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    act(() => tabs[1].click());
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(container.textContent).toContain("짧은 음이 바쁘게 움직여요");
  });
});
