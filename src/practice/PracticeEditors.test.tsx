import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import PracticeEditors, { PracticeNoteTools, type PracticeEditorsProps } from "./PracticeEditors";

vi.mock("../components/ScoreMeasure", () => ({
  default: ({ notes, onSelectNote, onMoveNote }: {
    notes: readonly NoteEvent[];
    onSelectNote?: (id: string) => void;
    onMoveNote?: (id: string, pitch: number) => void;
  }) => <div data-testid="practice-mock-score">
    {notes.map((note) => <button key={note.id} data-testid={`score-note-${note.id}`}
      onClick={() => onSelectNote?.(note.id)} onKeyDown={() => onMoveNote?.(note.id, (note.pitch ?? 60) + 1)}>{note.id}</button>)}
  </div>
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(overrides: Partial<PracticeEditorsProps> = {}, toolsOnly = false): PracticeEditorsProps {
  const props: PracticeEditorsProps = {
    notes: [],
    meter: { beats: 4, beatUnit: 4 },
    step: "rhythm",
    inputMode: "grid",
    selectedNoteId: null,
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
  act(() => root?.render(toolsOnly ? <PracticeNoteTools {...props} /> : <PracticeEditors {...props} />));
  return props;
}

function button(testId: string): HTMLButtonElement {
  const result = container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!result) throw new Error(`${testId} 버튼을 찾지 못했습니다.`);
  return result;
}

function lyricInput(label: string): HTMLInputElement {
  const result = container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!result) throw new Error(`${label} 입력을 찾지 못했습니다.`);
  return result;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("리듬과 가락 연습 입력", () => {
  it("빈칸에서 음표를 더하고 점음표·쉼표 길이를 같은 단위로 전달한다", () => {
    const props = mount();
    const emptyCell = container?.querySelector<HTMLButtonElement>(".practice-empty-slot");
    act(() => emptyCell?.click());
    expect(props.onAdd).toHaveBeenLastCalledWith(1, 60, undefined);
    act(() => button("practice-duration-1.5").click());
    act(() => button("practice-add-note").click());
    expect(props.onAdd).toHaveBeenLastCalledWith(1.5, 60, true);
    act(() => button("practice-add-rest").click());
    expect(props.onAdd).toHaveBeenLastCalledWith(1.5, null, true);
    expect(props.onDuration).not.toHaveBeenCalled();
  });

  it("마디를 넘친 음표도 보이고 선택해 길이를 줄이거나 삭제할 수 있다", () => {
    const props = mount({
      notes: [
        { id: "long", pitch: 60, duration: rational(4), lyric: "봄" },
        { id: "overflow", pitch: 62, duration: rational(1), lyric: "날" }
      ],
      selectedNoteId: "overflow"
    });
    expect(container?.textContent).toContain("5 / 4박");
    expect(container?.textContent).toContain("1박이 넘쳤어요");
    expect(button("practice-rhythm-note-overflow").getAttribute("style")).toContain("left: 80%");
    expect(container?.querySelectorAll(".practice-overflow-slot").length).toBeGreaterThan(0);
    const lyric = container?.querySelector<HTMLButtonElement>('[aria-label="2번째 음표 가사 날 선택"]');
    act(() => lyric?.click());
    expect(props.onSelectNote).toHaveBeenCalledWith("overflow");
    act(() => button("practice-duration-0.5").click());
    expect(props.onDuration).toHaveBeenCalledWith("overflow", .5, undefined);
    act(() => button("practice-delete-note").click());
    expect(props.onDelete).toHaveBeenCalledWith("overflow");
  });

  it.each([
    { id: "short", pitch: 60, duration: rational(1, 2) },
    { id: "rest", pitch: null, duration: rational(3, 2) }
  ])("배치된 $id 리듬 칸은 선택 여부와 무관하게 한 번 누르면 삭제한다", (note) => {
    const props = mount({ notes: [note], selectedNoteId: note.pitch === null ? null : note.id });
    const block = button(`practice-rhythm-note-${note.id}`);
    expect(block.getAttribute("aria-label")).toContain("삭제");
    expect(block.hasAttribute("aria-pressed")).toBe(false);
    act(() => block.click());
    expect(props.onDelete).toHaveBeenCalledExactlyOnceWith(note.id);
    expect(props.onSelectNote).not.toHaveBeenCalled();
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("연주·저장 중에는 리듬 칸을 눌러도 음표를 삭제하거나 추가하지 않는다", () => {
    const props = mount({ notes: [{ id: "note", pitch: 60, duration: rational(1) }], disabled: true });
    act(() => {
      button("practice-rhythm-note-note").click();
      container?.querySelector<HTMLButtonElement>(".practice-empty-slot")?.click();
    });
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("가락 칸은 낮은 도~높은 도에서 음높이만 바꾸고 쉼표와 리듬 길이를 보존한다", () => {
    const notes = [
      { id: "first", pitch: 60, duration: rational(3, 2), lyric: "나" },
      { id: "rest", pitch: null, duration: rational(1, 2) },
      { id: "last", pitch: 64, duration: rational(2), lyric: "비" }
    ];
    const props = mount({ notes, step: "melody", selectedNoteId: "first" });
    expect(container?.querySelectorAll(".practice-melody-row")).toHaveLength(8);
    expect(container?.querySelector(".practice-pitch-row-label")?.textContent).toBe("높은 도");
    act(() => button("practice-melody-first-72").click());
    expect(props.onPitch).toHaveBeenCalledWith("first", 72);
    expect(props.onSelectNote).toHaveBeenCalledWith("first");
    expect(container?.querySelector('[data-testid="practice-melody-rest-72"]')).toBeNull();
    expect(button("practice-melody-first-72").getAttribute("style")).toContain("width: 37.5%");
    expect(button("practice-add-note").disabled).toBe(false);
    expect(button("practice-delete-note").disabled).toBe(false);
    expect(props.onDuration).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(notes[0].duration).toEqual(rational(3, 2));
    expect(container?.textContent).not.toContain("‘리듬 만들기’에서 고쳐요");
  });

  it("가락 만들기에서도 선택한 음표 길이를 고치고 음표·쉼표를 더하거나 지울 수 있다", () => {
    const props = mount({
      notes: [{ id: "note", pitch: 67, duration: rational(1), lyric: "별" }],
      step: "melody",
      selectedNoteId: "note"
    });
    act(() => button("practice-duration-1.5").click());
    expect(props.onDuration).toHaveBeenCalledWith("note", 1.5, true);
    act(() => button("practice-add-note").click());
    expect(props.onAdd).toHaveBeenLastCalledWith(1.5, 60, true);
    act(() => button("practice-add-rest").click());
    expect(props.onAdd).toHaveBeenLastCalledWith(1.5, null, true);
    act(() => button("practice-delete-note").click());
    expect(props.onDelete).toHaveBeenCalledWith("note");
  });

  it("가락 칸에서 쉼표도 선택해 길이를 바꾸고 지울 수 있다", () => {
    const props = mount({
      notes: [{ id: "rest", pitch: null, duration: rational(1) }],
      step: "melody",
      selectedNoteId: "rest"
    });
    act(() => button("practice-melody-rest-rest").click());
    expect(props.onSelectNote).toHaveBeenCalledWith("rest");
    act(() => button("practice-duration-0.5").click());
    expect(props.onDuration).toHaveBeenCalledWith("rest", .5, undefined);
    expect(button("practice-pitch-60").disabled).toBe(true);
    act(() => button("practice-delete-note").click());
    expect(props.onDelete).toHaveBeenCalledWith("rest");
  });

  it("공유 도구는 길이 선택과 추가를 연결하고 음표 이름 옆의 중복 박자 표기를 지운다", () => {
    const props = mount({ onAppendDurationChange: vi.fn() }, true);
    const duration = button("practice-duration-1.5");
    expect(duration.querySelector("span:not(.practice-note-symbol)")?.textContent).toBe("점4분음표");
    expect(duration.querySelector("small")?.textContent).toBe("1.5박");
    expect(duration.textContent).not.toContain(" · ");
    act(() => duration.click());
    expect(props.onAppendDurationChange).toHaveBeenCalledWith(1.5);
    act(() => button("practice-add-note").click());
    expect(props.onAdd).toHaveBeenLastCalledWith(1.5, 60, true);
    expect(container?.querySelector(".practice-editor-summary")).toBeNull();
    expect(container?.querySelector(".practice-grid-content")).toBeNull();
  });

  it("작은 마디 칸은 도구를 중복하지 않고 공유 길이로 빈칸을 채우며 음표별 가사를 입력한다", () => {
    const props = mount({
      notes: [
        { id: "first", pitch: 60, duration: rational(1), lyric: "봄" },
        { id: "rest", pitch: null, duration: rational(1, 2) }
      ],
      selectedNoteId: "first",
      compact: true,
      showTools: false,
      showSummary: false,
      appendDuration: 1.5,
      onNoteLyric: vi.fn()
    });
    expect(container?.querySelector(".practice-editors-compact")).not.toBeNull();
    expect(container?.querySelector(".practice-grid-content")?.getAttribute("style")).toContain("min-width: 160px");
    expect(container?.querySelector(".practice-editor-summary")).toBeNull();
    expect(container?.querySelector(".practice-duration-options")).toBeNull();
    const emptyCell = container?.querySelector<HTMLButtonElement>(".practice-empty-slot");
    act(() => emptyCell?.click());
    expect(props.onAdd).toHaveBeenCalledWith(1.5, 60, true);
    const input = lyricInput("1번째 음표 가사");
    expect(input.value).toBe("봄");
    expect(input.maxLength).toBe(1);
    act(() => input.focus());
    expect(props.onSelectNote).toHaveBeenCalledWith("first");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "별");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(props.onNoteLyric).toHaveBeenCalledWith("first", "별");
    expect(container?.querySelectorAll(".practice-lyric-input")).toHaveLength(1);
    expect(container?.querySelector(".practice-lyric-rest")?.textContent).toBe("—");
  });

  it("악보에서 끌거나 키보드로 바꾼 음은 연습 음계에 맞추고 팔레트도 같은 음표를 편집한다", () => {
    const props = mount({
      notes: [{ id: "note", pitch: 60, duration: rational(1) }],
      step: "melody",
      inputMode: "score",
      selectedNoteId: "note"
    });
    act(() => button("score-note-note").click());
    expect(props.onSelectNote).toHaveBeenCalledWith("note");
    expect(props.onDelete).not.toHaveBeenCalled();
    act(() => button("score-note-note").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(props.onPitch).toHaveBeenCalledWith("note", 62);
    act(() => button("practice-pitch-72").click());
    expect(props.onPitch).toHaveBeenLastCalledWith("note", 72);
    expect(props.onDuration).not.toHaveBeenCalled();
  });

  it("연주·내보내기 중 비활성 상태에서는 칸과 악보가 변경되지 않는다", () => {
    const props = mount({
      notes: [{ id: "note", pitch: 60, duration: rational(1) }],
      step: "melody",
      inputMode: "score",
      selectedNoteId: "note",
      disabled: true
    });
    act(() => button("practice-pitch-72").click());
    act(() => button("score-note-note").click());
    act(() => button("score-note-note").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    expect(props.onPitch).not.toHaveBeenCalled();
    expect(props.onSelectNote).not.toHaveBeenCalled();
  });
});
