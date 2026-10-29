import { vi } from "vitest";

export type VideoCanvasCommand = Readonly<{
  name: string;
  args: readonly unknown[];
  fillStyle: string;
  strokeStyle: string;
  globalAlpha: number;
  font: string;
  shadowBlur: number;
  path: readonly Readonly<{ name: string; args: readonly unknown[] }>[];
}>;

/** Records drawing output without depending on a browser's font or pixel rasterizer. */
export class VideoTestCanvas {
  readonly commands: VideoCanvasCommand[] = [];
  readonly context: CanvasRenderingContext2D;

  constructor() {
    const state: Record<string, unknown> = {
      fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1,
      lineWidth: 1, textAlign: "left", textBaseline: "alphabetic"
    };
    const saved: Record<string, unknown>[] = [];
    let path: { name: string; args: readonly unknown[] }[] = [];
    const record = (name: string, args: readonly unknown[]) => {
      this.commands.push({
        name, args, path: path.map((part) => ({ ...part, args: [...part.args] })),
        fillStyle: String(state.fillStyle), strokeStyle: String(state.strokeStyle),
        globalAlpha: Number(state.globalAlpha),
        font: String(state.font ?? ""), shadowBlur: Number(state.shadowBlur ?? 0)
      });
    };
    const pathMethods = new Set(["arc", "ellipse", "roundRect", "rect", "moveTo", "lineTo", "bezierCurveTo"]);
    this.context = new Proxy(state, {
      get: (target, key) => {
        if (key in target) return target[key as string];
        if (key === "measureText") return (text: string) => ({ width: text.length * 10 });
        if (key === "save") return () => { saved.push({ ...state }); };
        if (key === "restore") return () => {
          const previous = saved.pop();
          if (previous) {
            for (const property of Object.keys(state)) delete state[property];
            Object.assign(state, previous);
          }
        };
        if (key === "beginPath") return () => { path = []; };
        if (pathMethods.has(String(key))) return (...args: unknown[]) => {
          path.push({ name: String(key), args });
        };
        return (...args: unknown[]) => { record(String(key), args); };
      },
      set: (target, key, value) => { target[String(key)] = value; return true; }
    }) as unknown as CanvasRenderingContext2D;
  }

  clear(): void { this.commands.length = 0; }
}

export function recordVideoCanvases(): VideoTestCanvas[] {
  const canvases: VideoTestCanvas[] = [];
  const contexts = new WeakMap<HTMLCanvasElement, VideoTestCanvas>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    let canvas = contexts.get(this);
    if (!canvas) {
      canvas = new VideoTestCanvas();
      contexts.set(this, canvas);
      canvases.push(canvas);
    }
    return canvas.context;
  });
  return canvases;
}
