// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MusicLearning from "./MusicLearning";
import { QUIZZES } from "./learningModel";
import { LEARNING_PROGRESS_KEY } from "./useLearningProgress";

// Notation drawing has its own browser verification; these tests exercise the
// learning flow without depending on asynchronously loaded engraving fonts.
vi.mock("./LearningScore", () => ({
  default: () => <div aria-label="악보" />,
  NoteSymbol: ({ id }: { id: string }) => <span aria-hidden="true">{id}</span>
}));
vi.mock("./MusicSymbol", () => ({ default: () => <span aria-hidden="true" /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function mount() {
  act(() => root.render(<MusicLearning onClose={() => undefined} onCreate={() => undefined} />));
}

function get<T extends HTMLElement = HTMLElement>(selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function click(element: HTMLElement) {
  act(() => element.click());
}

function button(text: string, scope: Element = container): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll("button"))
    .find((element) => element.textContent?.replace(/\s+/g, " ").trim() === text);
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}

function openLesson(index: number) {
  click(container.querySelectorAll<HTMLButtonElement>(".learn-lesson-card")[index]);
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  mount();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("music learning navigation and progress", () => {
  it("opens a lesson with focus on its visible heading, never the hidden quiz", () => {
    openLesson(0);
    expect(get("#learn-quiz-panel").hidden).toBe(true);
    expect(document.activeElement).toBe(get(".learn-lesson-heading h1"));
    expect(get("#learn-quiz-panel").contains(document.activeElement)).toBe(false);
  });

  it("keeps the current quiz question when a child revisits the explanation", () => {
    openLesson(0);
    click(get("#learn-quiz-tab"));
    click(container.querySelectorAll<HTMLButtonElement>(".learn-answers button")[1]);
    click(button("다음 문제"));
    expect(get("#learn-quiz-title").textContent).toBe(QUIZZES.notes[1].prompt);
    click(button("체험 다시 보기"));
    expect(get("#learn-explore-panel").hidden).toBe(false);
    click(get("#learn-quiz-tab"));
    expect(get("#learn-quiz-title").textContent).toBe(QUIZZES.notes[1].prompt);
    expect(get(".learn-quiz .learn-section-top").textContent).toContain("2 / 4");
  });

  it("keeps keyboard focus on a wrong answer so the child can try another choice", () => {
    openLesson(0);
    click(get("#learn-quiz-tab"));
    const wrongAnswer = container.querySelectorAll<HTMLButtonElement>(".learn-answers button")[0];
    act(() => {
      wrongAnswer.focus();
      wrongAnswer.click();
    });
    expect(document.activeElement).toBe(wrongAnswer);
    expect(wrongAnswer.disabled).toBe(false);
    expect(get(".learn-quiz-feedback").textContent).toContain("다시 생각해 볼까요?");
    expect(container.querySelector(".learn-quiz-footer .learn-primary")).toBeNull();
  });

  it("restores a discovery stamp after completing a quiz and reopening learning", () => {
    openLesson(0);
    click(get("#learn-quiz-tab"));
    QUIZZES.notes.forEach((question, index) => {
      click(container.querySelectorAll<HTMLButtonElement>(".learn-answers button")[question.answer]);
      click(button(index === QUIZZES.notes.length - 1 ? "도장 받기" : "다음 문제"));
    });
    expect(get(".learn-quiz-complete").textContent).toContain("발견 도장, 획득!");
    expect(JSON.parse(localStorage.getItem(LEARNING_PROGRESS_KEY) ?? "[]")).toEqual(["notes"]);
    act(() => root.unmount());
    root = createRoot(container);
    mount();
    expect(get(".arcade-guide-caption").textContent).toContain("1 / 5");
    expect(get(".learn-lesson-card").getAttribute("aria-label")).toContain("도감 완료");
  });

  it("resets a partial tap game when its experiment is hidden by the quiz", () => {
    openLesson(2);
    click(button("박자 누르기 시작"));
    click(get(".learn-tap-pad"));
    expect(get(".learn-tap-pad").getAttribute("aria-label")).toContain("1회 완료");
    click(get("#learn-quiz-tab"));
    click(get("#learn-explore-tab"));
    expect(container.querySelector(".learn-tap-pad")).toBeNull();
    click(button("박자 누르기 시작"));
    expect(get(".learn-tap-pad").getAttribute("aria-label")).toContain("0회 완료");
  });

  it("shows an eighth note as half a beat when filling a measure", () => {
    openLesson(1);
    click(get('[aria-label="8분음표 넣기, 반 박"]'));
    const beats = container.querySelectorAll<HTMLElement>(".learn-beat");
    expect(get(".learn-beat-rail").getAttribute("aria-label")).toBe("2박 중 0.5박 채움");
    expect(beats[0].style.getPropertyValue("--beat-fill")).toBe("50%");
    expect(beats[0].textContent).toContain("½");
    expect(beats[1].style.getPropertyValue("--beat-fill")).toBe("0%");
  });
});
