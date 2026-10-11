import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "../styles/mobile-measure-range.css";

type Range = { start: number; end: number };

export function visibleMeasureRange(
  cells: ArrayLike<HTMLElement>, activeIndex: number, left: number, right: number
): Range | null {
  if (cells.length === 0) return null;
  const rowStart = Math.floor(Math.min(Math.max(activeIndex, 0), cells.length - 1) / 4) * 4;
  let first = -1;
  let last = -1;
  for (let index = rowStart; index < Math.min(rowStart + 4, cells.length); index += 1) {
    const rect = cells[index].getBoundingClientRect();
    if (rect.right <= left + 1 || rect.left >= right - 1) continue;
    if (first < 0) first = index + 1;
    last = index + 1;
  }
  return first < 0 ? null : { start: first, end: last };
}

export default function MobileMeasureRange({
  children, total, activeIndex
}: { children: ReactNode; total: number; activeIndex: number }) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<Range | null>(null);

  useLayoutEffect(() => {
    const timeline = timelineRef.current;
    const scroller = timeline?.closest<HTMLElement>(".composition-section");
    if (!timeline || !scroller) return;

    const update = () => {
      const viewport = scroller.getBoundingClientRect();
      const cells = timeline.querySelectorAll<HTMLElement>(".measure-cell");
      const next = visibleMeasureRange(
        cells, activeIndex, viewport.left + scroller.clientLeft,
        viewport.left + scroller.clientLeft + scroller.clientWidth
      );
      setRange((current) => current?.start === next?.start && current?.end === next?.end ? current : next);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(scroller);
    observer?.observe(timeline);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [activeIndex, total]);

  const rangeText = range
    ? `${range.start}${range.end > range.start ? `~${range.end}` : ""} / ${total}마디`
    : `위치 확인 중 · 전체 ${total}마디`;

  return <>
    <div className="mobile-measure-range" data-testid="mobile-measure-range"
      aria-label={`선택한 ${activeIndex + 1}마디가 있는 줄에서 현재 보이는 마디: ${rangeText}`}>
      <span>보이는 마디 <strong>{rangeText}</strong></span>
      <small>선택한 줄 · 옆으로 밀어 보기 ↔</small>
    </div>
    <div className="measure-timeline" ref={timelineRef}>{children}</div>
  </>;
}
