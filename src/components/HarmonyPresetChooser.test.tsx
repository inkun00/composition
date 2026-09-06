// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findHarmonyPreset } from "../music/harmonyPresets";
import { validateMeasure } from "../music/meter";
import { toNumber } from "../music/rational";
import {
  buildHarmonyPreviewMeasures,
  default as HarmonyPresetChooser
} from "./HarmonyPresetChooser";

const { playComposition, stopPlayback } = vi.hoisted(() => ({
  playComposition: vi.fn().mockResolvedValue(8),
  stopPlayback: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../audio/player", () => ({ playComposition, stopPlayback }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  playComposition.mockClear();
  stopPlayback.mockClear();
});

describe("화음 이야기 미리듣기", () => {
  it("오른쪽 설명에는 제목을 반복하지 않고 연주가 주는 느낌을 알려 준다", () => {
    const preset = findHarmonyPreset("H095");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <HarmonyPresetChooser preset={preset} meter={{ beats: 4, beatUnit: 4 }}
        bpm={96} accompanimentStyleId="arpeggio" disabled={false} playing={false}
        onPlayingChange={() => undefined} onSelect={() => undefined} />
    ));

    const summary = container.querySelector(".preset-summary-copy");
    const selectedOption = container.querySelector<HTMLOptionElement>("option:checked");
    expect(selectedOption?.textContent).toBe("095 · 미지의 대륙 첫걸음");
    expect(selectedOption?.value).toBe("H095");
    expect(summary?.textContent).not.toContain(preset.childName);
    expect(summary?.textContent).not.toContain("이런 느낌의 연주예요");
    expect(summary?.textContent).toContain(
      "새로운 세계로 첫발을 내딛는 모험과 용기를 내야 하는 장면에 잘 어울려요."
    );
  });

  it("선택한 코드 구성에 맞는 추천 가락 네 마디를 만든다", () => {
    const preset = findHarmonyPreset("H038");
    const meter = { beats: 4, beatUnit: 4 } as const;
    const measures = buildHarmonyPreviewMeasures(preset, meter);

    expect(measures).toHaveLength(4);
    measures.forEach((measure, index) => {
      expect(measure.chords).toEqual(preset.bars[index]);
      expect(validateMeasure(measure.notes, meter).state).toBe("exact");
    });
  });

  it("음의 움직임 선택이 바뀌면 미리듣기 가락의 길이와 구성이 함께 바뀐다", () => {
    const preset = findHarmonyPreset("H001");
    const meter = { beats: 4, beatUnit: 4 } as const;
    const short = buildHarmonyPreviewMeasures(preset, meter, "children_song");
    const long = buildHarmonyPreviewMeasures(preset, meter, "opera");
    const averageDuration = (measures: typeof short) => {
      const notes = measures.flatMap((measure) => measure.notes);
      return notes.reduce((sum, note) => sum + toNumber(note.duration), 0) / notes.length;
    };

    expect(short.flatMap((measure) => measure.notes).map((note) => note.id)).not.toEqual(
      long.flatMap((measure) => measure.notes).map((note) => note.id)
    );
    expect(averageDuration(short)).toBeLessThan(averageDuration(long));
  });

  it("미리듣기 버튼으로 추천 가락과 코드 반주를 함께 재생한다", async () => {
    const preset = findHarmonyPreset("H001");
    const onPlayingChange = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(
      <HarmonyPresetChooser preset={preset} meter={{ beats: 4, beatUnit: 4 }}
        bpm={96} accompanimentStyleId="arpeggio" disabled={false} playing={false}
        onPlayingChange={onPlayingChange} onSelect={() => undefined} />
    ));

    const button = container.querySelector<HTMLButtonElement>('[data-testid="harmony-preview-button"]');
    await act(async () => button?.click());

    expect(playComposition).toHaveBeenCalledTimes(1);
    expect(playComposition.mock.calls[0][0]).toHaveLength(4);
    expect(playComposition.mock.calls[0][1]).toBe("acoustic_grand_piano");
    expect(playComposition.mock.calls[0][3]).toMatchObject({
      styleId: "arpeggio",
      instrumentIds: ["acoustic_grand_piano"],
      beatPattern: [],
      meter: { beats: 4, beatUnit: 4 }
    });
    expect(onPlayingChange).toHaveBeenCalledWith(true);
  });
});
