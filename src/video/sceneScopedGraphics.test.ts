import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMusicVideoPlan, type MusicVideoPlan, type MusicVideoScene, type SceneElement, type SceneMotion } from "./musicVideoModel";
import { elementPath } from "./sceneDrawing";
import { drawSceneMotionGraphics } from "./sceneMotionGraphics";
import { drawMusicVideoFrame } from "./musicVideoRenderer";

type Matrix = [number, number, number, number, number, number];
type Clip = Readonly<{ path: readonly unknown[][]; matrix: Matrix }>;
type Paint = Readonly<{ kind: string; source: string; color: string; alpha: number; matrix: Matrix; clips: readonly Clip[] }>;
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const motions = ["still", "draw-on", "fade", "slide", "zoom", "float", "bounce", "pulse", "pop-in", "iris", "curtain",
  "assemble", "sparkle", "confetti", "rotate-in", "flip-in", "diagonal-reveal", "zoom-out", "snow", "spotlight",
  "move-left", "move-right", "move-up", "move-down", "move-up-left", "move-up-right", "move-down-left", "move-down-right",
  "bounce-left", "bounce-right"] as const;
const behind: SceneElement = { id: "behind", tool: "line", width: 4, color: "#123456", points: [[50, 50, .5], [80, 80, .5]] };
const moving: SceneElement = { id: "moving", tool: "rectangle", width: 4, color: "#ea4335", points: [[300, 180, .5], [500, 320, .5]] };
const front: SceneElement = { ...behind, id: "front", color: "#345678", points: [[700, 400, .5], [750, 430, .5]] };

function scene(motion: SceneMotion): MusicVideoScene {
  return { id: "scoped", background: "#ffffff", motion: "still", endLyric: null, endMeasureIndex: 0,
    elements: [behind, { ...moving, motion }, front] };
}

function plan(current: MusicVideoScene, bpm = 120, duration = 10): MusicVideoPlan {
  return { title: "노래", bpm, introSeconds: 0, scenes: [{ scene: current, startSeconds: 0, endSeconds: duration, lyricText: "" }],
    lyrics: { title: "노래", hasLyrics: false, frames: [] } };
}

function recordingContext() {
  const paints: Paint[] = [];
  let matrix: Matrix = [...identity];
  let clips: Clip[] = [];
  let path: unknown[][] = [];
  const stack: { matrix: Matrix; clips: Clip[]; alpha: number; fill: string; stroke: string }[] = [];
  const record = (kind: string, source: string, color: string) => {
    paints.push({ kind, source, color, alpha: context.globalAlpha, matrix: [...matrix], clips: [...clips] });
  };
  const context = {
    globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "", font: "", textAlign: "", textBaseline: "",
    save() {
      stack.push({ matrix: [...matrix], clips: [...clips], alpha: this.globalAlpha, fill: this.fillStyle, stroke: this.strokeStyle });
    },
    restore() {
      const state = stack.pop()!;
      matrix = state.matrix;
      clips = state.clips;
      this.globalAlpha = state.alpha;
      this.fillStyle = state.fill;
      this.strokeStyle = state.stroke;
    },
    translate(x: number, y: number) {
      matrix[4] += matrix[0] * x + matrix[2] * y;
      matrix[5] += matrix[1] * x + matrix[3] * y;
    },
    scale(x: number, y: number) {
      matrix[0] *= x;
      matrix[1] *= x;
      matrix[2] *= y;
      matrix[3] *= y;
    },
    rotate(angle: number) {
      const [a, b, c, d] = matrix;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      matrix[0] = a * cos + c * sin;
      matrix[1] = b * cos + d * sin;
      matrix[2] = c * cos - a * sin;
      matrix[3] = d * cos - b * sin;
    },
    beginPath() {
      path = [];
    },
    moveTo(...values: number[]) {
      path.push(["move", ...values]);
    },
    lineTo(...values: number[]) {
      path.push(["line", ...values]);
    },
    closePath() {
      path.push(["close"]);
    },
    rect(...values: number[]) {
      path.push(["rect", ...values]);
    },
    arc(...values: number[]) {
      path.push(["arc", ...values]);
    },
    clip() {
      clips.push({ path: path.map((part) => [...part]), matrix: [...matrix] });
    },
    stroke(value: { source: string }) {
      record("stroke", value.source, this.strokeStyle);
    },
    fill(value: { source: string }) {
      record("fill", value.source, this.fillStyle);
    },
    fillRect(...values: number[]) {
      record("rect", values.join(","), this.fillStyle);
    },
    fillText(text: string) {
      record("text", text, this.fillStyle);
    },
    measureText() {
      return { width: 40 };
    }
  };
  return { context: context as unknown as CanvasRenderingContext2D, paints };
}

function snapshot(current: MusicVideoScene, time = .4, bpm = 120, duration = 10) {
  const recorded = recordingContext();
  const currentPlan = plan(current, bpm, duration);
  drawSceneMotionGraphics(recorded.context, currentPlan.scenes[0], currentPlan, time);
  return recorded.paints;
}

beforeEach(() => { vi.stubGlobal("Path2D", class { constructor(readonly source: string) {} }); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("선·도형에만 적용하는 모션", () => {
  it.each(motions)("%s 부분 효과도 다른 선의 위치와 원래 그리기 순서를 보존한다", (motion) => {
    const current = scene(motion);
    const before = JSON.stringify(current);
    const result = snapshot(current);
    expect(result[0]).toMatchObject({ color: behind.color, source: elementPath(behind), matrix: identity, clips: [] });
    expect(result.at(-1)).toMatchObject({ color: front.color, source: elementPath(front), matrix: identity, clips: [] });
    expect(result.filter((paint) => paint.color === behind.color || paint.color === front.color)).toHaveLength(2);
    expect(JSON.stringify(current)).toBe(before);
  });

  it("부분 확대의 중심은 장면 전체가 아니라 해당 도형의 중심이다", () => {
    const result = snapshot(scene("pulse"), .25);
    const selected = result.find((paint) => paint.color === moving.color)!;
    expect(selected.matrix[0]).toBeCloseTo(1.045);
    expect(selected.matrix[4]).toBeCloseTo(400 * (1 - 1.045));
    expect(selected.matrix[5]).toBeCloseTo(250 * (1 - 1.045));
  });

  it("부분 이동은 원래 도형 영역 밖으로 움직일 수 있으며 그 영역에 잘려 갇히지 않는다", () => {
    const selected = snapshot(scene("move-right"), 5).find((paint) => paint.color === moving.color)!;
    expect(selected.matrix[4]).toBe(28);
    expect(selected.clips).toEqual([]);
  });

  it("부분 회전은 해당 도형의 중심에서 등장하며 캔버스 중앙에서 날아오지 않는다", () => {
    const selected = snapshot(scene("rotate-in"), .4).find((paint) => paint.color === moving.color)!;
    const [a, b, c, d, x, y] = selected.matrix;
    expect(a * 400 + c * 250 + x).toBeCloseTo(400);
    expect(b * 400 + d * 250 + y).toBeCloseTo(250);
  });

  it("부분 슬라이드는 개체 크기에 맞춘 거리로 등장한다", () => {
    const selected = snapshot(scene("slide"), .1).find((paint) => paint.color === moving.color)!;
    expect(selected.matrix[4]).toBeLessThan(0);
    expect(selected.matrix[4]).toBeGreaterThan(-80);
  });

  it.each(["sparkle", "snow", "confetti", "spotlight"] as const)("%s 장식은 선택 도형의 외곽에만 제한한다", (motion) => {
    const result = snapshot(scene(motion));
    const decorations = result.filter((paint) => ![moving.color, behind.color, front.color].includes(paint.color));
    expect(decorations.length).toBeGreaterThan(0);
    for (const paint of decorations) {
      expect(paint.clips[0]).toEqual({ path: [["rect", 298, 178, 204, 144]], matrix: identity });
    }
  });

  it.each(["iris", "curtain", "diagonal-reveal", "assemble"] as const)("%s 마스크와 타일은 선택 도형의 좌표를 사용한다", (motion) => {
    const selected = snapshot(scene(motion)).find((paint) => paint.color === moving.color)!;
    expect(selected.clips.length).toBeGreaterThan(0);
    const commands = selected.clips.flatMap((clip) => clip.path);
    expect(commands).not.toContainEqual(["rect", 0, 0, 960, 540]);
    if (motion === "iris") expect(commands[0].slice(0, 3)).toEqual(["arc", 400, 250]);
    if (motion === "diagonal-reveal") expect(commands[0]).toEqual(["move", 298, 178]);
  });

  it.each(motions)("%s 부분 효과는 실제 90·180 BPM 악보의 같은 박자에서 동일하다", (motion) => {
    const current = scene(motion);
    const source = [{ notes: Array.from("우리노래", (lyric, index) => ({ id: `note-${index}`, pitch: 60, lyric,
      duration: { numerator: 1, denominator: 1 } })) }];
    const render = (bpm: number) => {
      const currentPlan = buildMusicVideoPlan("노래", source, bpm, 0, 4 * 60 / bpm, [current]);
      const recorded = recordingContext();
      drawSceneMotionGraphics(recorded.context, currentPlan.scenes[0], currentPlan, 1.2 * 60 / bpm);
      return recorded.paints;
    };
    expect(render(90)).toEqual(render(180));
  });

  it.each(motions)("%s 부분 효과는 정적 영상에서 원본만 출력한다", (motion) => {
    const currentPlan = plan(scene(motion));
    const recorded = recordingContext();
    drawMusicVideoFrame(recorded.context, currentPlan, .4, false);
    const strokes = recorded.paints.filter((paint) => paint.kind === "stroke");
    expect(strokes.map((paint) => paint.source)).toEqual([elementPath(behind), elementPath(moving), elementPath(front)]);
    expect(strokes.every((paint) => paint.clips.length === 0 && paint.alpha === 1)).toBe(true);
    expect(strokes.every((paint) => JSON.stringify(paint.matrix) === JSON.stringify([1280 / 960, 0, 0, 720 / 540, 0, 0]))).toBe(true);
  });

  it("부분 등장 효과도 짧은 장면의 마지막 40%에는 원본 그림을 표시한다", () => {
    for (const motion of ["fade", "pop-in", "draw-on", "rotate-in", "flip-in", "iris", "curtain", "diagonal-reveal", "assemble"] as const) {
      const selected = snapshot(scene(motion), .2, 120, .25).find((paint) => paint.color === moving.color)!;
      expect(selected).toMatchObject({ source: elementPath(moving), alpha: 1, matrix: identity, clips: [] });
    }
  });

  it("부분 효과의 임의 시점 재생은 이력에 의존하지 않는다", () => {
    const current = scene("snow");
    const first = snapshot(current, .6);
    snapshot(current, 1.2);
    expect(snapshot(current, .6)).toEqual(first);
  });
});
