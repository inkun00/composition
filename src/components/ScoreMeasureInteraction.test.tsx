import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import ScoreMeasure from "./ScoreMeasure";
import { expandedStaffLedgerLines, expandedStaffNoteY, pitchAfterStaffDrag } from "./scorePitchGeometry";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function mount(pitch: number, expandedStaff = true) {
  const onMoveNote = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<ScoreMeasure plain expandedStaff={expandedStaff}
    notes={[{ id: "note", pitch, duration: rational(1) }]}
    onSelectNote={() => undefined} onMoveNote={onMoveNote} />));
  const note = container.querySelector<SVGGElement>('[role="button"]');
  if (!note) throw new Error("편집할 음표를 찾지 못했습니다.");
  vi.spyOn(note.ownerSVGElement!, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 700, bottom: 196, width: 700, height: 196,
    toJSON: () => undefined
  });
  return { note, onMoveNote };
}

describe("연습 악보의 높은 음 배치", () => {
  it("높은 도 위 음들도 서로 다른 위치에 표시하고 가장 높은 도의 선택 영역을 악보 안에 담는다", () => {
    const markup = renderToStaticMarkup(<ScoreMeasure plain expandedStaff
      notes={[72, 81, 84].map((pitch) => ({ id: `note-${pitch}`, pitch, duration: rational(1) }))}
      onSelectNote={() => undefined} />);
    const document = new DOMParser().parseFromString(markup, "text/html");
    const heads = Array.from(document.querySelectorAll(".note-head"));
    expect(heads.map((head) => Number(head.getAttribute("cy")))).toEqual([82, 52, 40]);
    const highestTarget = document.querySelectorAll(".note-hit")[2];
    expect(Number(highestTarget.getAttribute("y"))).toBeGreaterThan(0);
    expect(markup).toContain('class="staff-line ledger-line"');
    expect(expandedStaffLedgerLines(84)).toEqual([52, 40]);
  });

  it("높은 도를 선택한 뒤 위 방향키로 반음 더 올릴 수 있다", () => {
    const { note, onMoveNote } = mount(72);
    act(() => note.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(onMoveNote).toHaveBeenCalledExactlyOnceWith("note", 73);
  });

  it("높은 도에서 오선의 한 칸씩 위로 끌면 높은 레부터 두 옥타브 위 도까지 배치한다", () => {
    const { note, onMoveNote } = mount(72);
    act(() => note.dispatchEvent(new MouseEvent("pointerdown", { clientY: 100, bubbles: true })));
    act(() => window.dispatchEvent(new MouseEvent("pointermove", { clientY: 94, bubbles: true })));
    expect(onMoveNote).toHaveBeenLastCalledWith("note", 74);
    act(() => window.dispatchEvent(new MouseEvent("pointermove", { clientY: 58, bubbles: true })));
    expect(onMoveNote).toHaveBeenLastCalledWith("note", 84);
    act(() => window.dispatchEvent(new MouseEvent("pointerup", { clientY: 58, bubbles: true })));
  });

  it("오선 간격에 맞춘 끌기는 샤프와 플랫의 변화음을 유지한다", () => {
    expect(pitchAfterStaffDrag(73, -6, 1, "sharp")).toBe(75);
    expect(pitchAfterStaffDrag(75, -6, 1, "flat")).toBe(76);
    expect(expandedStaffNoteY(73, "sharp")).toBe(expandedStaffNoteY(72));
    expect(expandedStaffNoteY(75, "flat")).toBe(expandedStaffNoteY(76));
  });

  it("높은 음의 편집 상한과 일반 작곡 악보의 기존 반음 끌기를 유지한다", () => {
    expect(pitchAfterStaffDrag(84, -60, 1)).toBe(84);
    const { note, onMoveNote } = mount(72, false);
    act(() => note.dispatchEvent(new MouseEvent("pointerdown", { clientY: 100, bubbles: true })));
    act(() => window.dispatchEvent(new MouseEvent("pointermove", { clientY: 94, bubbles: true })));
    expect(onMoveNote).toHaveBeenLastCalledWith("note", 74);
    act(() => window.dispatchEvent(new MouseEvent("pointerup", { clientY: 94, bubbles: true })));
  });
});
