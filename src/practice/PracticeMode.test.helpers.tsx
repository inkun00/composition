import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import { PRACTICE_STORAGE_KEY, type PracticeDraft } from "./practiceStorage";
import PracticeMode from "./PracticeMode";
import { usePracticeAudio } from "./usePracticeAudio";
import { practiceCreationModeLabel, type PracticeCreationMode } from "./practiceCreationMode";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
export let container: HTMLDivElement | null = null;

export function mount(onClose = vi.fn(), mode: PracticeCreationMode | null = "rhythm-melody"): ReturnType<typeof vi.fn> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<PracticeMode onClose={onClose} />));
  if (mode) {
    const choice = container.querySelector<HTMLButtonElement>(`button[aria-label="${practiceCreationModeLabel(mode)}"]`);
    if (choice) click(choice);
  }
  return onClose;
}

export function unmount(): void {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
}

export function rerender(): void {
  act(() => root?.render(<PracticeMode onClose={vi.fn()} />));
}

export function button(text: string): HTMLButtonElement {
  const found = [...(container?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
    .find((item) => item.textContent?.trim() === text || item.getAttribute("aria-label") === text || (
      text === "악보 추가하기" && item.textContent?.trim().startsWith(text)
    ));
  if (!found) throw new Error(`${text} 버튼을 찾지 못했습니다.`);
  return found;
}

export function testButton(testId: string): HTMLButtonElement {
  const activeScore = container?.querySelector<HTMLButtonElement>(
    '[data-testid^="practice-score-select-"][aria-pressed="true"]'
  );
  const activeIndex = Number(activeScore?.dataset.testid?.replace("practice-score-select-", "") ?? 0);
  const workspace = container?.querySelector(`[data-testid="practice-score-workspace-${activeIndex}"]`);
  const found = workspace?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
    ?? container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!found) throw new Error(`${testId} 버튼을 찾지 못했습니다.`);
  return found;
}

export function scoreButton(scoreIndex: number, testId: string): HTMLButtonElement {
  const found = container?.querySelector<HTMLButtonElement>(
    `[data-testid="practice-score-workspace-${scoreIndex}"] [data-testid="${testId}"]`
  );
  if (!found) throw new Error(`${scoreIndex + 1}번 악보의 ${testId} 버튼을 찾지 못했습니다.`);
  return found;
}

export function measureCard(index: number): HTMLElement {
  const found = container?.querySelector<HTMLElement>(`[data-testid="practice-measure-card-${index}"]`);
  if (!found) throw new Error(`${index + 1}마디 화면을 찾지 못했습니다.`);
  return found;
}

export function scoreCard(scoreIndex: number, measureIndex: number): HTMLElement {
  if (scoreIndex === 0) return measureCard(measureIndex);
  const found = container?.querySelector<HTMLElement>(
    `[data-testid="practice-score-${scoreIndex}-measure-card-${measureIndex}"]`
  );
  if (!found) throw new Error(`${scoreIndex + 1}번 악보 ${measureIndex + 1}마디를 찾지 못했습니다.`);
  return found;
}

export function placeNote(scoreIndex: number, measureIndex: number, beats: number, rest = false): void {
  click(testButton(scoreIndex === 0 ? `practice-measure-${measureIndex}` : `practice-score-${scoreIndex}-measure-${measureIndex}`));
  click(scoreButton(scoreIndex, rest ? "practice-choose-rest" : "practice-choose-note"));
  const durationId = `practice-${rest ? "rest" : "duration"}-${beats}`;
  if (![0.5, 1, 2].includes(beats)) {
    const more = scoreButton(scoreIndex, durationId).closest("details");
    if (more && !more.open) click(more.querySelector("summary")!);
  }
  click(scoreButton(scoreIndex, durationId));
  const card = scoreCard(scoreIndex, measureIndex);
  const empty = card.querySelector<HTMLButtonElement>('[data-testid^="practice-melody-empty-60-"]')
    ?? card.querySelector<HTMLButtonElement>(".practice-empty-slot");
  if (!empty) throw new Error("음표를 놓을 빈칸을 찾지 못했습니다.");
  click(empty);
}

export function placeCurrentNote(beats: number, rest = false, targetScore?: number): void {
  const active = container?.querySelector<HTMLElement>(".practice-measure-card.is-active");
  const index = Number(active?.dataset.testid?.split("-").at(-1) ?? 0);
  const workspace = active?.closest<HTMLElement>(".practice-score-workspace");
  const scoreIndex = targetScore ?? Number(workspace?.dataset.testid?.split("-").at(-1) ?? 0);
  placeNote(scoreIndex, index, beats, rest);
}

export function completeScoreMeasure(scoreIndex: number, measureIndex: number, lyric = "반짝별아"): void {
  const input = scoreCard(scoreIndex, measureIndex).querySelector<HTMLInputElement>(".practice-lyric-entry input");
  if (!input) throw new Error("마디 전체 가사 입력을 찾지 못했습니다.");
  changeInput(input, lyric);
  for (let noteIndex = 0; noteIndex < 4; noteIndex += 1) {
    placeNote(scoreIndex, measureIndex, 1);
  }
}

export function completeMeasure(index: number, lyric = "반짝별아"): void {
  completeScoreMeasure(0, index, lyric);
}

export function completeOneMeasure(lyric = "반짝별아"): void {
  changeValue("연습할 마디 수", "1");
  completeMeasure(0, lyric);
}

export function click(target: HTMLElement): void {
  act(() => target.click());
}

export function changeValue(label: string, value: string): void {
  const input = container?.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`);
  if (!input) throw new Error(`${label} 입력을 찾지 못했습니다.`);
  changeInput(input, value);
}

export function changeInput(input: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

export function savedDraft(): PracticeDraft {
  const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
  if (!raw) throw new Error("연습 가락이 자동 저장되지 않았습니다.");
  return JSON.parse(raw) as PracticeDraft;
}

export function latestAudioInput(): Parameters<typeof usePracticeAudio>[0] {
  const input = vi.mocked(usePracticeAudio).mock.calls.at(-1)?.[0];
  if (!input) throw new Error("연주에 전달된 연습 가락이 없습니다.");
  return input;
}
