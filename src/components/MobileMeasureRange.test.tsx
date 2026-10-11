// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import MobileMeasureRange, { visibleMeasureRange } from "./MobileMeasureRange";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("모바일 악보의 보이는 마디 범위", () => {
  it("선택한 줄의 마디만 기준으로 가로로 보이는 범위를 계산한다", () => {
    const cells = Array.from({ length: 8 }, (_, index) => ({
      getBoundingClientRect: () => ({ left: index % 4 * 180, right: (index % 4 + 1) * 180 })
    })) as HTMLElement[];
    expect(visibleMeasureRange(cells, 0, 0, 360)).toEqual({ start: 1, end: 2 });
    expect(visibleMeasureRange(cells, 5, 180, 540)).toEqual({ start: 6, end: 7 });
    expect(visibleMeasureRange(cells, 5, 360, 720)).toEqual({ start: 7, end: 8 });
  });

  it("가로 스크롤·창 크기·선택한 마디 변경에 따라 표시를 갱신한다", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    let viewportWidth = 360;
    const render = (activeIndex: number) => root?.render(
      <section className="composition-section">
        <MobileMeasureRange total={8} activeIndex={activeIndex}>
          {Array.from({ length: 8 }, (_, index) =>
            <div key={index} className="measure-cell" data-index={index} />)}
        </MobileMeasureRange>
      </section>
    );
    act(() => render(0));

    const section = container.querySelector<HTMLElement>(".composition-section")!;
    Object.defineProperty(section, "clientWidth", { get: () => viewportWidth });
    section.getBoundingClientRect = () => ({ left: 0, right: viewportWidth }) as DOMRect;
    container.querySelectorAll<HTMLElement>(".measure-cell").forEach((cell, index) => {
      cell.getBoundingClientRect = () => ({
        left: index % 4 * 180 - section.scrollLeft,
        right: (index % 4 + 1) * 180 - section.scrollLeft
      }) as DOMRect;
    });

    act(() => section.dispatchEvent(new Event("scroll")));
    const indicator = container.querySelector(".mobile-measure-range")!;
    expect(indicator.textContent).toContain("1~2 / 8마디");

    act(() => {
      section.scrollLeft = 360;
      section.dispatchEvent(new Event("scroll"));
    });
    expect(indicator.textContent).toContain("3~4 / 8마디");

    act(() => render(5));
    expect(indicator.textContent).toContain("7~8 / 8마디");

    act(() => {
      viewportWidth = 180;
      window.dispatchEvent(new Event("resize"));
    });
    expect(indicator.textContent).toContain("7 / 8마디");
  });
});
