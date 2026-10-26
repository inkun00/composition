import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
import type { PlaybackMeasure } from "../audio/accompanimentScore";
import type { MusicVideoScene } from "../video/musicVideoModel";
import MusicVideoFeature, { type MusicVideoFeatureProps } from "./MusicVideoFeature";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const measures: readonly PlaybackMeasure[] = Array.from({ length: 4 }, (_, measureIndex) => ({
  harmony: "home", measureIndex, chords: ["C"],
  notes: Array.from("별빛노래", (lyric, index) => ({ id: `note-${index}`, pitch: 60 + index,
    duration: { numerator: 1, denominator: 1 }, lyric }))
}));
type HarnessProps = Partial<Omit<MusicVideoFeatureProps, "scenes" | "onScenesChange" | "onBusyChange">> & {
  initialScenes?: readonly MusicVideoScene[];
};
let root: Root;
let host: HTMLDivElement;
export let currentScenes: readonly MusicVideoScene[];
export let onScenesChange: ReturnType<typeof vi.fn>;
export let onBusyChange: ReturnType<typeof vi.fn>;

function Harness({ initialScenes = [], ...overrides }: HarnessProps) {
  const [scenes, setScenes] = useState(initialScenes);
  currentScenes = scenes;
  return <MusicVideoFeature scenes={scenes} onScenesChange={(next) => { onScenesChange(next); setScenes(next); }}
    onBusyChange={onBusyChange} measures={measures} title="별빛 이야기" instrumentId="violin" bpm={120}
    accompaniment={{ styleId: "arpeggio", instrumentIds: ["piano"], meter: { beats: 4, beatUnit: 4 } }}
    complete busy={false} {...overrides} />;
}

export function mount(props: HarnessProps = {}) {
  act(() => root.render(<Harness {...props} />));
}

export function byTestId(id: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[data-testid="${id}"]`);
  if (!button) throw new Error(`${id} 버튼을 찾지 못했습니다.`);
  return button;
}

export function byLabel(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`${label} 버튼을 찾지 못했습니다.`);
  return button;
}

export function byText(text: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`${text} 버튼을 찾지 못했습니다.`);
  return button;
}

export function click(button: HTMLButtonElement) {
  act(() => button.click());
}

const presetCategories: Record<string, string> = {
  "draw-on": "entrance", fade: "entrance", slide: "entrance", "pop-in": "entrance", assemble: "entrance",
  zoom: "transition", iris: "transition", curtain: "transition",
  still: "atmosphere", float: "atmosphere", bounce: "atmosphere", pulse: "atmosphere",
  sparkle: "atmosphere", confetti: "atmosphere", snow: "atmosphere", spotlight: "atmosphere",
  "rotate-in": "entrance", "flip-in": "entrance", "diagonal-reveal": "transition", "zoom-out": "transition",
  "move-left": "travel", "move-right": "travel", "move-up": "travel", "move-down": "travel",
  "move-up-left": "travel", "move-up-right": "travel", "move-down-left": "travel", "move-down-right": "travel",
  "bounce-left": "travel", "bounce-right": "travel"
};

export function choosePreset(id: string) {
  click(byTestId(`scene-motion-category-${presetCategories[id]}`));
  click(byTestId(`scene-motion-preset-${id}`));
}

export function open() { click(byTestId("draw-music-video-scene")); }

export function endpoint(value: string) {
  const select = document.querySelector<HTMLSelectElement>('[data-testid="scene-end-measure"]')!;
  act(() => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

export function canvasPointer(type: string, x: number, y: number, pointerType = "mouse") {
  const canvas = document.querySelector<SVGSVGElement>('[data-testid="scene-paint-canvas"]')!;
  Object.defineProperties(canvas, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => false },
    getBoundingClientRect: { configurable: true, value: () => ({ left: 0, top: 0, width: 960, height: 540 }) }
  });
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.assign(event, { pointerId: 3, pointerType, pressure: 0 });
  act(() => canvas.dispatchEvent(event));
}

export function canvasClick(x: number, y: number, pointerType = "mouse") {
  canvasPointer("pointerdown", x, y, pointerType);
  canvasPointer("pointerup", x, y, pointerType);
}

export function paint() {
  for (const [type, x, y] of [["pointerdown", 100, 100], ["pointermove", 150, 130], ["pointerup", 200, 150]] as const) {
    canvasPointer(type, x, y);
  }
}

export function setupFeatureHarness(exporter: ReturnType<typeof vi.fn>) {
  vi.resetAllMocks();
  exporter.mockResolvedValue(new Blob(["video"], { type: "video/mp4" }));
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:completed-music-video");
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  onScenesChange = vi.fn();
  onBusyChange = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
}

export function cleanupFeatureHarness() {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}
