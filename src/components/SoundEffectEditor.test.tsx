// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOUND_EFFECTS } from "../music/soundEffects";
import SoundEffectEditor from "./SoundEffectEditor";

const { previewSoundEffect } = vi.hoisted(() => ({ previewSoundEffect: vi.fn() }));

vi.mock("../audio/soundEffects", () => ({ previewSoundEffect }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  previewSoundEffect.mockReset();
});

describe("효과음 선택", () => {
  it("재생 버튼은 효과음을 추가하지 않고 미리 듣기만 한다", () => {
    const onAdd = vi.fn();
    const effect = SOUND_EFFECTS[0];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<SoundEffectEditor measureIndex={0} capacity={4} events={[]}
      onAdd={onAdd} onMove={() => undefined} onRemove={() => undefined} />));

    const previewButton = container.querySelector<HTMLButtonElement>(`[data-testid="preview-effect-${effect.id}"]`);
    const addButton = container.querySelector<HTMLButtonElement>(`[data-testid="add-effect-${effect.id}"]`);
    act(() => previewButton?.click());
    expect(previewSoundEffect).toHaveBeenCalledWith(effect.id);
    expect(onAdd).not.toHaveBeenCalled();

    act(() => addButton?.click());
    expect(onAdd).toHaveBeenCalledWith(effect.id);
    expect(previewSoundEffect).toHaveBeenCalledTimes(1);
  });
});
