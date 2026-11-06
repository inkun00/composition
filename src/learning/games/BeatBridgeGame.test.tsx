import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BeatBridgeGame from "./BeatBridgeGame";

vi.mock("../LearningScore", () => ({
  default: () => <div aria-label="악보" />,
  NoteSymbol: () => <span aria-hidden="true" />
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const onComplete = vi.fn();

function press(name: string) {
  const target = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => (button.getAttribute("aria-label") ?? button.textContent)?.includes(name));
  if (!target) throw new Error(`No button ${name}`);
  act(() => target.click());
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onComplete.mockClear();
  act(() => root.render(<BeatBridgeGame onExit={() => undefined} onComplete={onComplete} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("beat bridge rescue journey", () => {
  it("keeps the bird on the first bank when the bridge is incomplete", () => {
    press("4분음표 조각 놓기");
    press("다리 건너기");
    expect(container.querySelector(".bridge-scene")?.classList.contains("is-cleared")).toBe(false);
    expect(container.querySelector(".bridge-feedback")?.textContent).toContain("1박만큼 짧아요");
    expect(onComplete).not.toHaveBeenCalled();
    press("하나 빼기");
    press("2분음표 조각 놓기");
    press("다리 건너기");
    expect(container.querySelector(".bridge-scene")?.classList.contains("is-cleared")).toBe(true);
  });

  it("reports a score once after rescuing all five friends and supports a fresh run", () => {
    const solutions = [["2분음표"], ["4분음표", "4분음표"], ["2분음표", "4분음표"], ["온음표"], ["2분음표", "4분음표", "4분쉼표"]];
    solutions.forEach((notes, index) => {
      notes.forEach((note) => press(`${note} 조각 놓기`));
      press("다리 건너기");
      if (index < solutions.length - 1) {
        expect(onComplete).not.toHaveBeenCalled();
        press("다음 친구 구하기");
      }
    });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ score: 1500, stars: 3 });
    expect(container.textContent).toContain("다섯 친구 모두 구조했어요");
    press("새 기록 도전");
    expect(container.querySelector(".bridge-score")?.textContent).toContain("0점");
    expect(container.querySelector(".bridge-scene")?.classList.contains("is-cleared")).toBe(false);
  });
});
