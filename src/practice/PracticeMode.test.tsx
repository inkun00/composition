import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_METERS, validateMeasure } from "../music/meter";
import { PRACTICE_STORAGE_KEY, type PracticeDraft } from "./practiceStorage";
import PracticeMode from "./PracticeMode";
import { usePracticeAudio } from "./usePracticeAudio";

const audio = vi.hoisted(() => ({
  busy: false,
  playing: false,
  previewMeasureIndex: null as number | null,
  previewScoreIndex: null as number | null,
  previewRhythmMixing: false,
  playingNoteId: null,
  playingNoteIds: [] as readonly string[],
  status: "",
  progress: 0,
  preview: vi.fn(),
  previewMeasure: vi.fn(),
  previewRhythmMix: vi.fn(),
  save: vi.fn(),
  stop: vi.fn()
}));

vi.mock("./usePracticeAudio", () => ({ usePracticeAudio: vi.fn(() => audio) }));
vi.mock("../components/ScoreMeasure", () => ({ default: () => <div aria-label="연습 악보" /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(onClose = vi.fn()): ReturnType<typeof vi.fn> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<PracticeMode onClose={onClose} />));
  return onClose;
}

function unmount(): void {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

function rerender(): void {
  act(() => root?.render(<PracticeMode onClose={vi.fn()} />));
}

function button(text: string): HTMLButtonElement {
  const found = [...(container?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    .find((item) => item.textContent?.trim() === text || item.getAttribute("aria-label") === text || (
      text === "악보 추가하기" && item.textContent?.trim().startsWith(text)
    ));
  if (!found) throw new Error(`${text} 버튼을 찾지 못했습니다.`);
  return found;
}

function testButton(testId: string): HTMLButtonElement {
  const found = container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!found) throw new Error(`${testId} 버튼을 찾지 못했습니다.`);
  return found;
}

function measureCard(index: number): HTMLElement {
  const found = container?.querySelector<HTMLElement>(`[data-testid="practice-measure-card-${index}"]`);
  if (!found) throw new Error(`${index + 1}마디 화면을 찾지 못했습니다.`);
  return found;
}

function scoreCard(scoreIndex: number, measureIndex: number): HTMLElement {
  if (scoreIndex === 0) return measureCard(measureIndex);
  const found = container?.querySelector<HTMLElement>(
    `[data-testid="practice-score-${scoreIndex}-measure-card-${measureIndex}"]`
  );
  if (!found) throw new Error(`${scoreIndex + 1}번 악보 ${measureIndex + 1}마디를 찾지 못했습니다.`);
  return found;
}

function completeScoreMeasure(scoreIndex: number, measureIndex: number, lyric = "반짝별아"): void {
  const card = scoreCard(scoreIndex, measureIndex);
  const input = card.querySelector<HTMLInputElement>(".practice-lyric-entry input");
  if (!input) throw new Error("마디 전체 가사 입력을 찾지 못했습니다.");
  changeInput(input, lyric);
  const generate = [...card.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === "가사에 음표 붙이기");
  if (!generate) throw new Error("가사에 음표 붙이기 버튼을 찾지 못했습니다.");
  click(generate);
}

function completeMeasure(index: number, lyric = "반짝별아"): void {
  changeValue(`${index + 1}마디 가사`, lyric);
  const generate = [...measureCard(index).querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === "가사에 음표 붙이기");
  if (!generate) throw new Error(`${index + 1}마디 가사에 음표 붙이기 버튼을 찾지 못했습니다.`);
  click(generate);
}

function click(target: HTMLElement): void {
  act(() => target.click());
}

function changeValue(label: string, value: string): void {
  const input = container?.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`);
  if (!input) throw new Error(`${label} 입력을 찾지 못했습니다.`);
  changeInput(input, value);
}

function changeInput(input: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function savedDraft(): PracticeDraft {
  const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
  if (!raw) throw new Error("연습 가락이 자동 저장되지 않았습니다.");
  return JSON.parse(raw) as PracticeDraft;
}

function latestAudioInput(): Parameters<typeof usePracticeAudio>[0] {
  const input = vi.mocked(usePracticeAudio).mock.calls.at(-1)?.[0];
  if (!input) throw new Error("연주에 전달된 연습 가락이 없습니다.");
  return input;
}

function completeOneMeasure(lyric = "반짝별아"): void {
  changeValue("연습할 마디 수", "1");
  changeValue("1마디 가사", lyric);
  click(button("가사에 음표 붙이기"));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  audio.busy = false;
  audio.playing = false;
  audio.previewMeasureIndex = null;
  audio.previewScoreIndex = null;
  audio.previewRhythmMixing = false;
  audio.playingNoteIds = [];
  audio.status = "";
  audio.progress = 0;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  unmount();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("악보를 겹쳐 리듬 만들기", () => {
  it("음표를 넣기 전에 입력 영역 위에서 악기를 고르고 세 악보를 함께 펼친다", () => {
    mount();
    const instruments = container?.querySelector('[aria-label="리듬 악보와 악기 선택"]') as Element;
    const workspace = container?.querySelector(".practice-shared-tools") as Element;
    expect(instruments).not.toBeNull();
    expect(instruments.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(savedDraft().measures.every((measure) => measure.notes.length === 0)).toBe(true);
    changeValue("리듬 연주 악기", "beat:clap");
    expect(savedDraft().rhythmInstrumentId).toBe("beat:clap");
    click(button("악보 추가하기"));
    changeValue("2번 악보 리듬 연주 악기", "beat:shaker");
    click(button("악보 추가하기"));
    changeValue("3번 악보 리듬 연주 악기", "beat:kick");
    expect(savedDraft().rhythmLayers.map((layer) => layer.instrumentId)).toEqual(["beat:shaker", "beat:kick"]);
    expect(button("악보 추가하기").disabled).toBe(true);
    click(button("악보 추가하기"));
    expect(savedDraft().rhythmLayers).toHaveLength(2);
    for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
      expect(container?.querySelector(`[data-testid="practice-score-workspace-${scoreIndex}"]`)).not.toBeNull();
      expect(scoreCard(scoreIndex, 0)).not.toBeNull();
      expect(scoreCard(scoreIndex, 1)).not.toBeNull();
    }
    expect(container?.querySelectorAll('[data-testid="practice-add-note"]')).toHaveLength(1);
  });

  it("빈칸을 채우고 다시 눌러 지운 뒤 재추가해도 다른 악보와 마디의 리듬·가사를 보존한다", () => {
    mount();
    completeMeasure(0, "작은새야");
    completeMeasure(1, "노래하자");
    click(button("악보 추가하기"));
    completeScoreMeasure(1, 0, "반짝별아");
    changeInput(scoreCard(1, 1).querySelector<HTMLInputElement>(".practice-lyric-entry input") as HTMLInputElement, "봄");
    const before = savedDraft();
    click(testButton("practice-measure-0"));
    click(testButton("practice-duration-0.5"));
    click(scoreCard(1, 1).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const inserted = savedDraft().rhythmLayers[0].measures[1].notes[0];
    expect(inserted).toMatchObject({ pitch: 60, duration: { numerator: 1, denominator: 2 }, lyric: "봄" });
    expect(scoreCard(1, 1).querySelector(".practice-measure-total")?.textContent).toBe("0.5 / 4박");
    click(testButton("practice-measure-0"));
    click(testButton(`practice-rhythm-note-${inserted.id}`));
    expect(savedDraft()).toEqual(before);
    expect(scoreCard(1, 1).querySelector(".practice-measure-total")?.textContent).toBe("0 / 4박");
    expect(scoreCard(1, 1).classList.contains("is-active")).toBe(true);
    expect(testButton("practice-delete-note").disabled).toBe(true);
    click(scoreCard(1, 1).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const after = savedDraft();
    expect(after.measures).toEqual(before.measures);
    expect(after.rhythmLayers[0].measures[0]).toEqual(before.rhythmLayers[0].measures[0]);
    expect(after.rhythmLayers[0].measures[1].notes).toHaveLength(1);
    expect(after.rhythmLayers[0].measures[1].notes[0]).toMatchObject({
      pitch: 60, duration: inserted.duration, lyric: "봄"
    });
    expect(after.rhythmLayers[0].measures[1].notes[0].id).not.toBe(inserted.id);
  });

  it("선택한 악보에만 서로 다른 리듬을 넣고 해당 악보와 마디를 따로 듣는다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    click(testButton("practice-add-note"));
    const primary = savedDraft().measures[0].notes;
    click(button("악보 추가하기"));
    click(testButton("practice-score-select-1"));
    click(testButton("practice-duration-0.5"));
    click(testButton("practice-add-note"));
    click(testButton("practice-add-rest"));
    const before = savedDraft();
    expect(before.measures[0].notes).toEqual(primary);
    expect(before.rhythmLayers[0].measures[0].notes.map((note) => note.pitch)).toEqual([60, null]);
    expect(before.rhythmLayers[0].measures[0].notes.map((note) => note.duration))
      .toEqual([{ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 2 }]);
    expect(testButton("practice-score-1-measure-preview-0").disabled).toBe(false);
    click(testButton("practice-score-1-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenLastCalledWith(0, 1);
    expect(latestAudioInput().rhythmLayers).toEqual(before.rhythmLayers);
    expect(latestAudioInput().measures).toEqual(before.measures);
    expect(latestAudioInput().meter).toEqual(before.meter);
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenLastCalledWith(0, 0);
    click(testButton("practice-score-select-0"));
    const lyric = scoreCard(1, 0).querySelector<HTMLInputElement>('[aria-label="1번째 음표 가사"]');
    click(lyric as HTMLInputElement);
    click(testButton("practice-duration-2"));
    expect(savedDraft()).toEqual(before);
    click(testButton("practice-add-note"));
    expect(savedDraft().measures[0].notes).toEqual(primary);
    expect(savedDraft().rhythmLayers[0].measures[0].notes.slice(0, -1))
      .toEqual(before.rhythmLayers[0].measures[0].notes);
    expect(savedDraft().rhythmLayers[0].measures[0].notes.at(-1)?.duration)
      .toEqual({ numerator: 2, denominator: 1 });
  });

  it("다 채우지 않은 리듬도 함께 듣고 준비 취소와 멈추는 동안 다른 입력을 잠근다", () => {
    mount();
    click(button("악보 추가하기"));
    expect(button("리듬 함께 듣기").disabled).toBe(true);
    click(testButton("practice-score-select-0"));
    click(testButton("practice-add-note"));
    const before = savedDraft();
    expect(button("리듬 함께 듣기").disabled).toBe(false);
    expect(button("MP3 저장").disabled).toBe(true);
    click(button("리듬 함께 듣기"));
    expect(audio.previewRhythmMix).toHaveBeenCalledTimes(1);
    expect(audio.preview).not.toHaveBeenCalled();
    audio.busy = true;
    audio.previewRhythmMixing = true;
    rerender();
    expect(button("리듬 함께 듣기 준비 취소").disabled).toBe(false);
    expect(button("악보 추가하기").disabled).toBe(true);
    expect(testButton("practice-add-note").disabled).toBe(true);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    const instrument = container?.querySelector<HTMLSelectElement>('[aria-label="리듬 연주 악기"]');
    expect(instrument?.matches(":disabled")).toBe(true);
    click(button("리듬 함께 듣기 준비 취소"));
    expect(audio.stop).toHaveBeenCalledTimes(1);
    audio.busy = false;
    audio.playing = true;
    rerender();
    expect(button("겹친 리듬 멈추기").disabled).toBe(false);
    click(button("겹친 리듬 멈추기"));
    expect(audio.stop).toHaveBeenCalledTimes(2);
    expect(savedDraft()).toEqual(before);
  });

  it("같은 번호의 다른 악보 미리듣기를 잠그고 현재 듣는 악보만 취소한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    click(testButton("practice-add-note"));
    click(button("악보 추가하기"));
    click(testButton("practice-score-select-1"));
    click(testButton("practice-add-note"));
    audio.busy = true;
    audio.previewScoreIndex = 1;
    audio.previewMeasureIndex = 0;
    rerender();
    const extraPreview = testButton("practice-score-1-measure-preview-0");
    expect(extraPreview.textContent).toContain("2번 악보 1마디 준비 취소");
    expect(extraPreview.disabled).toBe(false);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(button("리듬 함께 듣기").disabled).toBe(true);
    click(extraPreview);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(audio.previewMeasure).not.toHaveBeenCalled();
  });

  it("모든 악보의 박자를 완성해야 가락과 저장을 열고 추가 악보는 가락 단계에서도 리듬으로 수정한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    completeMeasure(0);
    click(button("악보 추가하기"));
    click(button("악보 추가하기"));
    const melodyTab = container?.querySelector<HTMLButtonElement>("#practice-melody-tab") as HTMLButtonElement;
    expect(melodyTab.disabled).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    completeScoreMeasure(1, 0, "작은새야");
    expect(melodyTab.disabled).toBe(true);
    completeScoreMeasure(2, 0, "노래하자");
    expect(melodyTab.disabled).toBe(false);
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    click(button("MP3 저장"));
    click(button("MP4 저장"));
    expect(audio.save.mock.calls).toEqual([["mp3"], ["mp4"]]);
    expect(latestAudioInput().step).toBe("rhythm");
    expect(latestAudioInput().rhythmLayers).toHaveLength(2);
    click(melodyTab);
    expect(measureCard(0).querySelectorAll(".practice-melody-row")).toHaveLength(8);
    expect(scoreCard(1, 0).querySelector(".practice-rhythm-timeline")).not.toBeNull();
    expect(scoreCard(1, 0).querySelectorAll(".practice-melody-row")).toHaveLength(0);
    const primary = savedDraft().measures[0].notes;
    click(testButton("practice-score-1-measure-0"));
    const lyric = scoreCard(1, 0).querySelector<HTMLInputElement>('[aria-label="1번째 음표 가사"]');
    click(lyric as HTMLInputElement);
    click(testButton("practice-duration-2"));
    expect(savedDraft().measures[0].notes).toEqual(primary);
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    click(testButton("practice-add-note"));
    expect(savedDraft().rhythmLayers[0].measures[0].notes.at(-1)?.duration)
      .toEqual({ numerator: 2, denominator: 1 });
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    expect(melodyTab.getAttribute("aria-selected")).toBe("true");
  });

  it("세 악보의 악기와 별도 음표를 복원하고 마디 수를 함께 늘리고 줄인다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    completeMeasure(0);
    changeValue("리듬 연주 악기", "beat:clap");
    click(button("악보 추가하기"));
    changeValue("2번 악보 리듬 연주 악기", "beat:shaker");
    completeScoreMeasure(1, 0, "작은새야");
    click(button("악보 추가하기"));
    changeValue("3번 악보 리듬 연주 악기", "beat:kick");
    completeScoreMeasure(2, 0, "노래하자");
    const original = savedDraft();
    unmount();
    mount();
    expect(savedDraft()).toEqual(original);
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="2번 악보 리듬 연주 악기"]')?.value).toBe("beat:shaker");
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="3번 악보 리듬 연주 악기"]')?.value).toBe("beat:kick");
    changeValue("연습할 마디 수", "2");
    expect(savedDraft().measures).toHaveLength(2);
    expect(savedDraft().rhythmLayers.every((layer) => layer.measures.length === 2)).toBe(true);
    completeScoreMeasure(2, 1, "봄이와요");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    changeValue("연습할 마디 수", "1");
    expect(savedDraft().measures).toHaveLength(2);
    expect(savedDraft().rhythmLayers[1].measures[1].notes).toHaveLength(4);
    changeValue("연습할 마디 수", "1");
    expect(savedDraft().measures).toHaveLength(1);
    expect(savedDraft().rhythmLayers.map((layer) => layer.measures[0])).toEqual(original.rhythmLayers.map((layer) => layer.measures[0]));
  });

  it("음표가 든 악보 삭제를 취소하면 보존하고 승인하면 다른 악보를 유지한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    completeMeasure(0);
    click(button("악보 추가하기"));
    completeScoreMeasure(1, 0, "작은새야");
    click(button("악보 추가하기"));
    completeScoreMeasure(2, 0, "노래하자");
    const before = savedDraft();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    click(button("2번 악보 삭제"));
    expect(savedDraft()).toEqual(before);
    click(button("2번 악보 삭제"));
    expect(savedDraft().measures).toEqual(before.measures);
    expect(savedDraft().rhythmLayers).toEqual([before.rhythmLayers[1]]);
    expect(button("악보 추가하기").disabled).toBe(false);
    expect(container?.querySelector('[data-testid="practice-score-workspace-2"]')).toBeNull();
  });
});

describe("기능 연습하기 전체 흐름", () => {
  it("길이를 먼저 고르고 빈칸에 배치하며 이후 길이 선택은 다음 음표에만 적용한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    changeValue("1마디 가사", "봄날");
    click(testButton("practice-duration-0.5"));
    expect(savedDraft().measures[0].notes).toHaveLength(0);
    click(measureCard(0).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const first = savedDraft().measures[0].notes[0];
    expect(first).toMatchObject({ duration: { numerator: 1, denominator: 2 }, lyric: "봄" });
    click(testButton("practice-duration-2"));
    expect(savedDraft().measures[0].notes).toEqual([first]);
    expect(testButton("practice-duration-2").getAttribute("aria-pressed")).toBe("true");
    click(measureCard(0).querySelector<HTMLButtonElement>(".practice-empty-slot") as HTMLButtonElement);
    const second = savedDraft().measures[0].notes[1];
    expect(second).toMatchObject({ duration: { numerator: 2, denominator: 1 }, lyric: "날" });
    expect(savedDraft().measures[0].notes[0]).toEqual(first);
    click(measureCard(0).querySelector<HTMLInputElement>('[aria-label="1번째 음표 가사"]') as HTMLInputElement);
    click(testButton("practice-duration-1.5"));
    expect(savedDraft().measures[0].notes).toEqual([first, second]);
    expect(testButton("practice-duration-1.5").getAttribute("aria-pressed")).toBe("true");
    click(testButton("practice-add-rest"));
    const notes = savedDraft().measures[0].notes;
    expect(notes.slice(0, 2)).toEqual([first, second]);
    expect(notes[2]).toMatchObject({ pitch: null, duration: { numerator: 3, denominator: 2 }, dotted: true });
    expect(validateMeasure(notes, savedDraft().meter).state).toBe("exact");
    click(testButton("practice-duration-0.5"));
    expect(savedDraft().measures[0].notes).toEqual(notes);
    expect(button("MP3 저장").disabled).toBe(false);
  });

  it("가락 만들기나 가락 악기 선택 없이 완성한 리듬을 MP3와 MP4로 저장한다", () => {
    mount();
    changeValue("리듬 연주 악기", "beat:shaker");
    const melodyInstrument = savedDraft().melodyInstrumentId;
    completeOneMeasure();
    const before = savedDraft();
    expect(container?.querySelector("#practice-rhythm-tab")?.getAttribute("aria-selected")).toBe("true");
    expect(container?.querySelector('[aria-label="가락 연주 악기"]')).toBeNull();
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    click(button("MP3 저장"));
    click(button("MP4 저장"));
    expect(audio.save.mock.calls).toEqual([["mp3"], ["mp4"]]);
    expect(latestAudioInput()).toMatchObject({ step: "rhythm", rhythmInstrumentId: "beat:shaker" });
    expect(savedDraft()).toEqual(before);
    expect(savedDraft().melodyInstrumentId).toBe(melodyInstrument);
    expect(container?.querySelector("#practice-melody-tab")?.getAttribute("aria-selected")).toBe("false");
  });

  it("가사 없이 박자를 완성해도 리듬 단계에서 MP4로 저장한다", () => {
    mount();
    changeValue("연습할 마디 수", "1");
    click(testButton("practice-duration-4"));
    click(testButton("practice-add-note"));
    const before = savedDraft();
    expect(before.measures[0].lyric).toBe("");
    expect(before.measures[0].notes.every((note) => !note.lyric)).toBe(true);
    expect(validateMeasure(before.measures[0].notes, before.meter).state).toBe("exact");
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    click(button("MP4 저장"));
    expect(audio.save).toHaveBeenCalledWith("mp4");
    expect(latestAudioInput().step).toBe("rhythm");
    expect(savedDraft()).toEqual(before);
  });

  it("다른 마디가 비어 있어도 미완성 마디의 리듬을 듣고 가사와 음표를 그대로 유지한다", () => {
    mount();
    changeValue("연습할 마디 수", "4");
    expect(testButton("practice-measure-preview-2").disabled).toBe(true);
    click(testButton("practice-measure-2"));
    click(testButton("practice-add-note"));
    changeValue("3마디 가사", "봄");
    const before = savedDraft();
    expect(validateMeasure(before.measures[2].notes, before.meter).state).toBe("short");
    expect(testButton("practice-measure-preview-2").disabled).toBe(false);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    click(testButton("practice-measure-preview-2"));
    expect(audio.previewMeasure.mock.calls).toEqual([[2, 0]]);
    expect(audio.preview).not.toHaveBeenCalled();
    expect(savedDraft()).toEqual(before);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    expect(button("가락 만들기로").disabled).toBe(true);
    expect(container?.querySelector<HTMLButtonElement>("#practice-melody-tab")?.disabled).toBe(true);
  });

  it("소리 나는 음표가 있으면 초과 박자도 들을 수 있고 빈 마디와 쉼표뿐인 마디는 듣기를 막는다", () => {
    mount();
    changeValue("연습할 마디 수", "3");
    click(testButton("practice-measure-0"));
    click(testButton("practice-duration-4"));
    click(testButton("practice-add-note"));
    click(testButton("practice-add-note"));
    expect(validateMeasure(savedDraft().measures[0].notes, savedDraft().meter).state).toBe("over");
    expect(testButton("practice-measure-preview-0").disabled).toBe(false);
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenCalledWith(0, 0);
    click(testButton("practice-measure-1"));
    click(testButton("practice-add-rest"));
    expect(savedDraft().measures[1].notes.every((note) => note.pitch === null)).toBe(true);
    expect(testButton("practice-measure-preview-1").disabled).toBe(true);
    expect(testButton("practice-measure-preview-2").disabled).toBe(true);
    click(testButton("practice-measure-preview-1"));
    click(testButton("practice-measure-preview-2"));
    expect(audio.previewMeasure).toHaveBeenCalledTimes(1);
  });

  it("마디 연주를 준비하거나 듣는 동안 그 마디만 취소·멈춤을 허용하고 다른 연주와 저장은 잠근다", () => {
    mount();
    changeValue("연습할 마디 수", "2");
    completeMeasure(0);
    completeMeasure(1);
    const before = savedDraft();
    audio.busy = true;
    audio.previewMeasureIndex = 1;
    audio.previewScoreIndex = 0;
    rerender();
    const cancel = testButton("practice-measure-preview-1");
    expect(cancel.textContent).toContain("2마디 준비 취소");
    expect(cancel.disabled).toBe(false);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    click(cancel);
    expect(audio.stop).toHaveBeenCalledTimes(1);

    audio.busy = false;
    audio.playing = true;
    rerender();
    const stop = testButton("practice-measure-preview-1");
    expect(stop.textContent).toContain("2마디 연주 멈추기");
    expect(stop.disabled).toBe(false);
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    click(stop);
    expect(audio.stop).toHaveBeenCalledTimes(2);
    expect(audio.previewMeasure).not.toHaveBeenCalled();
    expect(savedDraft()).toEqual(before);

    audio.previewMeasureIndex = null;
    audio.previewScoreIndex = null;
    rerender();
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(testButton("practice-measure-preview-1").disabled).toBe(true);
    expect(button("연주 멈추기").disabled).toBe(false);
    audio.playing = false;
    audio.busy = true;
    rerender();
    expect(testButton("practice-measure-preview-0").disabled).toBe(true);
    expect(testButton("practice-measure-preview-1").disabled).toBe(true);
  });

  it("가락 단계에서 리듬을 미완성으로 고친 뒤에도 해당 마디의 리듬 듣기를 유지한다", () => {
    mount();
    completeOneMeasure();
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    click(testButton("practice-duration-2"));
    const before = savedDraft();
    expect(validateMeasure(before.measures[0].notes, before.meter).state).toBe("over");
    expect(testButton("practice-measure-preview-0").disabled).toBe(false);
    click(testButton("practice-measure-preview-0"));
    expect(audio.previewMeasure).toHaveBeenCalledWith(0, 0);
    expect(latestAudioInput().step).toBe("melody");
    expect(savedDraft()).toEqual(before);
    expect(button("가락 미리듣기").disabled).toBe(true);
    expect(button("MP3 저장").disabled).toBe(true);
  });

  it.each(SUPPORTED_METERS)("$beats/$beatUnit박자에서 가사를 리듬으로 만들고 길이를 유지하며 높은 도에 놓는다", (meter) => {
    mount();
    changeValue("연습할 마디 수", "1");
    changeValue("연습 박자", `${meter.beats}/${meter.beatUnit}`);
    changeValue("1마디 가사", "반짝별아");
    click(button("가사에 음표 붙이기"));

    expect(container?.textContent).toContain("1 / 1마디 박자 완성");
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(false);
    const rhythmNotes = savedDraft().measures[0].notes;
    expect(validateMeasure(rhythmNotes, meter).state).toBe("exact");

    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    expect(container?.querySelector("#practice-melody-tab")?.getAttribute("aria-selected")).toBe("true");
    expect(container?.querySelectorAll(".practice-melody-row")).toHaveLength(8);
    expect(container?.querySelectorAll(".practice-pitch-row-label")[0]?.textContent).toBe("높은 도");
    expect(container?.querySelectorAll(".practice-pitch-row-label")[7]?.textContent).toBe("낮은 도");
    const firstId = rhythmNotes[0].id;
    click(testButton(`practice-melody-${firstId}-72`));
    const melodyNotes = savedDraft().measures[0].notes;
    expect(melodyNotes[0].pitch).toBe(72);
    expect(melodyNotes.map((note) => ({ id: note.id, duration: note.duration, lyric: note.lyric })))
      .toEqual(rhythmNotes.map((note) => ({ id: note.id, duration: note.duration, lyric: note.lyric })));
    expect(testButton(`practice-melody-${firstId}-72`).getAttribute("aria-pressed")).toBe("true");
    expect(testButton(`practice-melody-${firstId}-72`).getAttribute("aria-label")).toContain("높은 도");
    expect(latestAudioInput().step).toBe("melody");
    expect(latestAudioInput().measures[0].notes).toEqual(melodyNotes);

    click(button("가락 미리듣기"));
    click(button("MP3 저장"));
    click(button("MP4 저장"));
    expect(audio.preview).toHaveBeenCalledTimes(1);
    expect(audio.save.mock.calls).toEqual([["mp3"], ["mp4"]]);
  });

  it("설정한 네 마디를 함께 보여 주고 모든 마디의 리듬을 완성해야 가락 단계로 넘어간다", () => {
    mount();
    changeValue("연습할 마디 수", "4");
    expect(container?.querySelectorAll(".practice-measure-card")).toHaveLength(4);
    expect(container?.querySelectorAll('[data-testid="practice-duration-0.5"]')).toHaveLength(1);
    const melodyTab = container?.querySelector<HTMLButtonElement>("#practice-melody-tab") as HTMLButtonElement;
    for (let index = 0; index < 4; index += 1) {
      expect(measureCard(index).querySelector(`[aria-label="${index + 1}마디 가사"]`)).not.toBeNull();
      expect(measureCard(index).querySelector(".practice-rhythm-timeline")).not.toBeNull();
    }
    completeMeasure(0);
    expect(container?.textContent).toContain("1 / 4마디 박자 완성");
    expect(melodyTab.disabled).toBe(true);
    click(melodyTab);
    expect(container?.querySelector("#practice-rhythm-tab")?.getAttribute("aria-selected")).toBe("true");
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    expect(button("리듬 미리듣기").disabled).toBe(true);
    click(button("MP3 저장"));
    expect(audio.save).not.toHaveBeenCalled();
    for (let index = 1; index < 4; index += 1) {
      completeMeasure(index);
      expect(melodyTab.disabled).toBe(index < 3);
    }
    expect(container?.textContent).toContain("4 / 4마디 박자 완성");
    click(melodyTab);
    expect(melodyTab.getAttribute("aria-selected")).toBe("true");
    expect(container?.querySelectorAll(".practice-measure-card")).toHaveLength(4);
    expect(container?.querySelectorAll(".practice-melody-row")).toHaveLength(32);
  });

  it("박자 칸 아래 가사를 입력하고 모든 마디 아래에서 악기와 듣기를 설정한다", () => {
    mount();
    changeValue("연습할 마디 수", "4");
    const follows = (earlier: Element, later: Element) =>
      Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (let index = 0; index < 4; index += 1) {
      const card = measureCard(index);
      const rhythm = card.querySelector(".practice-rhythm-timeline") as Element;
      const lyric = card.querySelector(`[aria-label="${index + 1}마디 가사"]`) as Element;
      expect(follows(rhythm, lyric)).toBe(true);
      expect(follows(card, container?.querySelector(".practice-listen-card") as Element)).toBe(true);
    }
    expect(container?.querySelector(".practice-listen-card")?.closest("aside")).toBeNull();
    const shortestDuration = testButton("practice-duration-0.5");
    expect(shortestDuration.querySelector("small")?.textContent).toBe("0.5박");
    expect([...shortestDuration.querySelectorAll("span")].map((item) => item.textContent))
      .toContain("8분음표");
    expect(shortestDuration.textContent).not.toContain("반 박");
    expect(shortestDuration.textContent).not.toContain("·");
  });

  it("가락 단계에서 리듬의 길이와 쉼표를 고치고 박자 오류를 바로 알리며 가사와 높이를 보존한다", () => {
    mount();
    completeOneMeasure();
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    const original = savedDraft().measures[0].notes;
    changeValue("1번째 음표 가사", "");
    expect(savedDraft().measures[0].notes[0].lyric).toBe("");
    expect(savedDraft().measures[0].notes.slice(1)).toEqual(original.slice(1));
    click(testButton(`practice-melody-${original[0].id}-67`));
    const selected = savedDraft().measures[0].notes;
    click(testButton("practice-duration-2"));
    expect(validateMeasure(savedDraft().measures[0].notes, savedDraft().meter).state).toBe("over");
    expect(measureCard(0).querySelector(".practice-measure-validation")?.textContent).toContain("맞지 않아요");
    expect(button("MP3 저장").disabled).toBe(true);
    expect(button("MP4 저장").disabled).toBe(true);
    expect(container?.querySelector("#practice-melody-tab")?.getAttribute("aria-selected")).toBe("true");
    expect(savedDraft().measures[0].notes.map((note) => ({ id: note.id, pitch: note.pitch, lyric: note.lyric })))
      .toEqual(selected.map((note) => ({ id: note.id, pitch: note.pitch, lyric: note.lyric })));
    click(testButton("practice-duration-1"));
    expect(button("MP3 저장").disabled).toBe(false);
    click(testButton("practice-add-rest"));
    const rest = savedDraft().measures[0].notes.at(-1);
    expect(rest?.pitch).toBeNull();
    expect(savedDraft().measures[0].notes.slice(0, -1)).toEqual(selected);
    expect(button("MP3 저장").disabled).toBe(true);
    click(testButton("practice-delete-note"));
    expect(savedDraft().measures[0].notes).toEqual(selected);
    expect(button("MP3 저장").disabled).toBe(false);
    click(testButton("practice-add-note"));
    expect(savedDraft().measures[0].notes).toHaveLength(selected.length + 1);
    expect(savedDraft().measures[0].notes.at(-1)?.pitch).toBe(60);
    click(testButton("practice-delete-note"));
    expect(savedDraft().measures[0].notes).toEqual(selected);
    unmount();
    mount();
    expect(savedDraft().measures[0].notes).toEqual(selected);
    expect(container?.querySelector<HTMLInputElement>('[aria-label="1번째 음표 가사"]')?.value).toBe("");
  });

  it("박자는 완성해도 가사 글자가 음표보다 많으면 MP4를 막고 필요한 글자 수를 알린다", () => {
    mount();
    completeOneMeasure();
    expect(button("MP4 저장").disabled).toBe(false);
    changeValue("1마디 가사", "반짝이는우리별");
    expect(container?.textContent).toContain("가사 3글자에 아직 음표가 없어요");
    expect(button("MP3 저장").disabled).toBe(false);
    expect(button("MP4 저장").disabled).toBe(true);
    click(button("MP4 저장"));
    expect(audio.save).not.toHaveBeenCalled();
    expect(validateMeasure(savedDraft().measures[0].notes, savedDraft().meter).state).toBe("exact");
  });

  it("자동 저장한 가사·높이·악기·빠르기와 이름을 다시 열어 복원한다", () => {
    mount();
    completeOneMeasure();
    changeValue("연습 가락 이름", "우리들의 봄 가락");
    changeValue("연습 빠르기", "72");
    changeValue("리듬 연주 악기", "beat:clap");
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    changeValue("가락 연주 악기", "violin");
    const firstId = savedDraft().measures[0].notes[0].id;
    click(testButton(`practice-melody-${firstId}-67`));
    const before = savedDraft();
    unmount();
    mount();

    expect(container?.querySelector<HTMLInputElement>('[aria-label="연습 가락 이름"]')?.value).toBe("우리들의 봄 가락");
    expect(container?.querySelector<HTMLInputElement>('[aria-label="1마디 가사"]')?.value).toBe("반짝별아");
    expect(savedDraft().melodyInstrumentId).toBe("violin");
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="리듬 연주 악기"]')?.value).toBe("beat:clap");
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="연습 빠르기"]')?.value).toBe("72");
    expect(latestAudioInput().measures).toEqual(before.measures);
    expect(latestAudioInput().title).toBe("우리들의 봄 가락");
    expect(button("MP3 저장").disabled).toBe(false);
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    expect(container?.querySelector<HTMLSelectElement>('[aria-label="가락 연주 악기"]')?.value).toBe("violin");
    expect(testButton(`practice-melody-${firstId}-67`).getAttribute("aria-pressed")).toBe("true");
  });

  it("불안정한 음에 간접 힌트를 보여 주고 힌트를 눌러도 가락을 자동으로 바꾸지 않는다", () => {
    mount();
    completeOneMeasure();
    click(container?.querySelector<HTMLElement>("#practice-melody-tab") as HTMLElement);
    const firstId = savedDraft().measures[0].notes[0].id;
    click(testButton(`practice-melody-${firstId}-71`));
    const beforeHint = savedDraft().measures[0].notes;
    expect(container?.textContent).toContain("조금 불안정하게 들릴 수 있어요");
    const hint = container?.querySelector<HTMLButtonElement>(".practice-harmony-warning button");
    expect(hint?.textContent).toContain("가까운 음");
    click(hint as HTMLButtonElement);
    expect(savedDraft().measures[0].notes).toEqual(beforeHint);
    expect(testButton(`practice-melody-${firstId}-71`).classList.contains("is-selected")).toBe(true);
  });

  it("네 단계 안내를 순서대로 보여 주고 마지막 안내에서 닫는다", () => {
    mount();
    click(button("처음이라면? 연습 안내"));
    const expectedTitles = ["작은 목표를 골라요", "말을 리듬으로 바꿔요", "원하면 높낮이를 붙여요", "귀로 확인하고 간직해요"];
    expectedTitles.forEach((title, index) => {
      const tutorial = container?.querySelector('[aria-label="연습 튜토리얼"]');
      expect(tutorial?.querySelector("h2")?.textContent).toBe(title);
      expect(tutorial?.textContent).toContain(`${index + 1} / 4`);
      click(button(index === 3 ? "연습해 볼게요" : "다음 안내"));
    });
    expect(container?.querySelector('[aria-label="연습 튜토리얼"]')).toBeNull();
    expect(button("처음이라면? 연습 안내").getAttribute("aria-expanded")).toBe("false");
  });

  it("돌아갈 때 연주를 먼저 멈추고 상위 화면 닫기 함수를 호출한다", () => {
    audio.playing = true;
    const onClose = mount();
    click(button("돌아가기"));
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(audio.stop.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
