import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemoryConstellationGame from "./MemoryConstellationGame";
import { MEMORY_STAGES } from "./memoryGameModel";

const audio = vi.hoisted(() => ({ play: vi.fn(async () => undefined), stop: vi.fn(), error: "" }));
vi.mock("../useLearningPlayback", () => ({ useLearningPlayback: () => audio }));
vi.mock("../LearningScore", () => ({ NoteSymbol: () => <span aria-hidden="true" /> }));
vi.mock("../MusicSymbol", () => ({ default: () => <span aria-hidden="true" /> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
const complete = vi.fn();
const exit = vi.fn();

function click(selector: string) {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing control: ${selector}`);
  act(() => button.click());
}

function match(id: string) {
  click(`[data-pair='${id}'][data-side='sign']`);
  click(`[data-pair='${id}'][data-side='meaning']`);
}

beforeEach(() => {
  complete.mockReset();
  exit.mockReset();
  audio.play.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<MemoryConstellationGame onComplete={complete} onExit={exit} />));
});

afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("constellation memory game", () => {
  it("conceals card meanings and lets a mismatch be studied before trying again", () => {
    expect(container.querySelectorAll(".face-up")).toHaveLength(0);
    click("[data-pair='p'][data-side='sign']");
    click("[data-pair='mf'][data-side='meaning']");
    expect(container.querySelectorAll(".matched")).toHaveLength(0);
    expect(container.querySelectorAll(".face-up")).toHaveLength(2);
    expect(container.querySelector(".memory-notice")?.textContent).toContain("메조포르테");
    click(".memory-retry");
    expect(container.querySelectorAll(".face-up")).toHaveLength(0);
    match("mf");
    expect(container.querySelectorAll(".matched")).toHaveLength(2);
    expect(audio.play).toHaveBeenLastCalledWith(expect.objectContaining({ dynamic: "mf" }));
  });

  it("requires all three constellations before awarding a result, then returns to the map", () => {
    MEMORY_STAGES.forEach((stage, index) => {
      stage.items.forEach((item) => match(item.id));
      expect(document.activeElement).toBe(container.querySelector(".memory-clear h2"));
      if (index < MEMORY_STAGES.length - 1) {
        expect(complete).not.toHaveBeenCalled();
        click(".memory-clear .learn-primary");
      }
    });
    expect(complete).toHaveBeenCalledExactlyOnceWith({ stars: 3, score: expect.any(Number) });
    expect(container.querySelector(".memory-clear h2")?.textContent).toBe("모든 별자리를 밝혔어요!");
    click(".memory-clear .learn-primary");
    expect(exit).toHaveBeenCalledOnce();
  });
});
