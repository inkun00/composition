import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import PracticeEditors, { type PracticeEditorsProps } from "./PracticeEditors";

vi.mock("../components/ScoreMeasure", () => ({ default: () => <div /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(overrides: Partial<PracticeEditorsProps> = {}): PracticeEditorsProps {
  const props: PracticeEditorsProps = {
    notes: [],
    meter: { beats: 4, beatUnit: 4 },
    step: "melody",
    inputMode: "grid",
    selectedNoteId: null,
    showTools: false,
    onSelectNote: vi.fn(),
    onPitch: vi.fn(),
    onDuration: vi.fn(),
    onDelete: vi.fn(),
    onAdd: vi.fn(),
    ...overrides
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<PracticeEditors {...props} />));
  return props;
}

function cell(testId: string): HTMLButtonElement {
  const result = container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!result) throw new Error(`${testId} 칸을 찾지 못했습니다.`);
  return result;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("높은 도 위의 가락 칸 입력", () => {
  it.each([74, 79, 84])("빈칸에 %i 음을 넣을 때 선택한 길이와 시작 박자를 전달한다", (pitch) => {
    const props = mount({ allowMelodyAppend: true, appendDuration: 0.5 });
    act(() => cell(`practice-melody-empty-${pitch}-2`).click());
    expect(props.onAdd).toHaveBeenCalledExactlyOnceWith(0.5, pitch, undefined, 1);
    expect(props.onPitch).not.toHaveBeenCalled();
  });

  it.each([74, 79, 84])("리듬을 잠근 가락에서도 %i 음으로 바꾸고 기존 리듬·쉼표·가사를 보존한다", (pitch) => {
    const notes = [
      { id: "first", pitch: 60, duration: rational(3, 2), lyric: "별" },
      { id: "rest", pitch: null, duration: rational(1, 2) },
      { id: "last", pitch: 67, duration: rational(2), lyric: "빛" }
    ];
    const original = structuredClone(notes);
    const props = mount({ notes, selectedNoteId: "first", rhythmLocked: true, allowMelodyAppend: false });
    const target = cell(`practice-melody-first-${pitch}`);
    expect(target.style.width).toBe("37.5%");
    expect(target.getAttribute("aria-label")).toContain("1.5박 유지");
    act(() => target.click());
    expect(props.onSelectNote).toHaveBeenCalledExactlyOnceWith("first");
    expect(props.onPitch).toHaveBeenCalledExactlyOnceWith("first", pitch);
    expect(props.onDuration).not.toHaveBeenCalled();
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(cell("practice-melody-rest-rest").textContent).toBe("쉼표");
    expect(container?.querySelector(".practice-melody-empty-slot")).toBeNull();
    expect(notes).toEqual(original);
  });

  it.each([
    { pitch: 83, accidental: undefined, row: 83, name: "높은 시" },
    { pitch: 80, accidental: "sharp" as const, row: 79, name: "솔♯" },
    { pitch: 80, accidental: "flat" as const, row: 81, name: "라♭" }
  ])("악보에서 입력한 높은 음 $name 을 맞는 칸에 표시한다", ({ pitch, accidental, row, name }) => {
    mount({
      notes: [{ id: "high", pitch, accidental, duration: rational(1) }],
      selectedNoteId: "high"
    });
    const filled = cell(`practice-melody-high-${row}`);
    expect(filled.classList.contains("is-filled")).toBe(true);
    expect(filled.classList.contains("is-selected")).toBe(true);
    expect(filled.textContent).toContain(name);
    expect(container?.querySelectorAll(".practice-melody-cell.is-filled")).toHaveLength(1);
    expect(container?.querySelector('[data-testid="practice-melody-viewport"]')).not.toBeNull();
  });

  it("방향키로 높은 도 위의 칸까지 이동하고 선택한 칸을 눌렀을 때만 음높이를 바꾼다", () => {
    const props = mount({
      notes: [{ id: "first", pitch: 72, duration: rational(1) }],
      selectedNoteId: "first"
    });
    act(() => cell("practice-melody-first-72").focus());
    for (const pitch of [74, 76, 77, 79, 81, 83, 84]) {
      act(() => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
      expect(document.activeElement).toBe(cell(`practice-melody-first-${pitch}`));
    }
    expect(container?.querySelectorAll('.practice-melody-rows button[tabindex="0"]')).toHaveLength(1);
    expect(props.onPitch).not.toHaveBeenCalled();
    act(() => cell("practice-melody-first-84").click());
    expect(props.onPitch).toHaveBeenCalledExactlyOnceWith("first", 84);
  });

  it("연주 중에는 높은 음의 새 입력과 기존 음 편집도 잠근다", () => {
    const props = mount({
      notes: [{ id: "first", pitch: 72, duration: rational(1) }],
      allowMelodyAppend: true,
      disabled: true
    });
    act(() => {
      cell("practice-melody-first-84").click();
      cell("practice-melody-empty-79-2").click();
    });
    expect(props.onPitch).not.toHaveBeenCalled();
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(props.onSelectNote).not.toHaveBeenCalled();
  });
});
