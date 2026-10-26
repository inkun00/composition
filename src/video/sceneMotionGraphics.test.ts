import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elementBounds, elementPath } from "./sceneDrawing";
import { buildMusicVideoPlan, type MusicVideoPlan, type MusicVideoScene, type SceneElement, type SceneMotion,
  type TimedMusicVideoScene } from "./musicVideoModel";
import { drawSceneMotionGraphics, sampleSceneGraphicPose } from "./sceneMotionGraphics";

const line: SceneElement = { id: "line-1", tool: "line", width: 4, color: "#123456",
  points: [[100, 100, .5], [200, 100, .5]] };
const second: SceneElement = { ...line, id: "line-2", points: [[600, 300, .5], [700, 300, .5]] };
const scene: MusicVideoScene = { id: "scene", background: "#ffffff", motion: "still",
  elements: [line, second], endLyric: null, endMeasureIndex: 0 };

function timed(motion: SceneMotion, startSeconds = 0, duration = 10): TimedMusicVideoScene {
  return { scene: { ...scene, motion }, startSeconds, endSeconds: startSeconds + duration, lyricText: "" };
}

function plan(current: TimedMusicVideoScene, bpm = 120, introSeconds = 0): MusicVideoPlan {
  return { title: "노래", bpm, introSeconds, scenes: [current],
    lyrics: { title: "노래", hasLyrics: false, frames: [] } };
}

function canvasContext() {
  const stack: number[] = [];
  const context = { globalAlpha: 1, strokeStyle: "", fillStyle: "", lineWidth: 0, lineCap: "", lineJoin: "",
    save: vi.fn(() => { stack.push(context.globalAlpha); }),
    restore: vi.fn(() => { context.globalAlpha = stack.pop()!; }),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    beginPath: vi.fn(), arc: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn() };
  return context;
}

type PaintedPath = { source: string };
beforeEach(() => { vi.stubGlobal("Path2D", class { constructor(readonly source: string) {} }); });
afterEach(() => { vi.unstubAllGlobals(); });

function graphicSnapshot(current: TimedMusicVideoScene, time: number, bpm = 120, beatOriginSeconds = 0) {
  const context = canvasContext();
  const paints: unknown[] = [];
  context.fill.mockImplementation((path: PaintedPath) => { paints.push(["fill", path.source, context.fillStyle, context.globalAlpha]); });
  context.stroke.mockImplementation((path: PaintedPath) => { paints.push(["stroke", path.source, context.strokeStyle, context.globalAlpha]); });
  context.fillRect.mockImplementation((...rect: number[]) => { paints.push(["rect", rect, context.fillStyle, context.globalAlpha]); });
  drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current, bpm, beatOriginSeconds), time);
  return { paints, translates: context.translate.mock.calls, rotations: context.rotate.mock.calls,
    scales: context.scale.mock.calls, arcs: context.arc.mock.calls, clips: context.rect.mock.calls,
    maskStart: context.moveTo.mock.calls, maskEdges: context.lineTo.mock.calls };
}

describe("장면별 모션그래픽의 시간과 전체 그림 변형", () => {
  it("등장 효과는 각 장면 시작부터 재생하고 1초 안에 원래 위치에서 멈춘다", () => {
    for (const motion of ["fade", "slide"] as const) {
      const current = timed(motion, 10, 8);
      const start = sampleSceneGraphicPose(current, 120, 10);
      const middle = sampleSceneGraphicPose(current, 120, 10.5);
      const end = sampleSceneGraphicPose(current, 120, 11);
      expect(start.opacity).toBe(0);
      expect(middle.opacity).toBeGreaterThan(0);
      expect(middle.opacity).toBeLessThan(1);
      expect(end.opacity).toBe(1);
      expect(end.dx).toBe(0);
      expect(sampleSceneGraphicPose(current, 120, 17)).toEqual(end);
    }
  });

  it("짧은 장면에서도 등장과 그리기가 장면이 끝나기 전에 완료된다", () => {
    for (const motion of ["fade", "slide", "draw-on"] as const) {
      const current = timed(motion, 10, .25);
      const end = sampleSceneGraphicPose(current, 120, 10.2);
      expect(end.opacity).toBe(1);
      expect(end.reveal).toBe(1);
      expect(end.dx).toBe(0);
    }
  });

  it("확대는 장면 전체 길이에 걸쳐 1배에서 1.08배까지 진행된다", () => {
    const current = timed("zoom", 10, 8);
    expect(sampleSceneGraphicPose(current, 120, 10).scale).toBe(1);
    expect(sampleSceneGraphicPose(current, 120, 14).scale).toBeCloseTo(1.04);
    expect(sampleSceneGraphicPose(current, 120, 18).scale).toBeCloseTo(1.08);
    expect(sampleSceneGraphicPose(current, 120, 100).scale).toBeCloseTo(1.08);
  });

  it.each(["float", "bounce", "pulse"] as const)("%s의 박자는 장면 위치가 달라도 같은 장면 시각에 일치한다", (motion) => {
    const first = sampleSceneGraphicPose(timed(motion, 0), 120, .125);
    const later = sampleSceneGraphicPose(timed(motion, 9), 120, 9.125);
    expect(later).toEqual(first);
    expect(first).not.toEqual(sampleSceneGraphicPose(timed(motion, 0), 60, .125));
  });

  it("떨어진 두 그림도 하나의 중심으로 함께 움직여 상대 위치가 유지된다", () => {
    const current = timed("float");
    const context = canvasContext();
    drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), .25);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(context.translate).toHaveBeenCalledTimes(2);
    expect(context.translate.mock.calls[1]).toEqual([-400, -200]);
    expect(context.rotate).toHaveBeenCalledOnce();
    expect(context.globalAlpha).toBe(1);
  });

  it.each(["still", "auto"] as const)("%s는 변형과 임의의 자동 움직임을 만들지 않는다", (motion) => {
    const current = timed(motion);
    const context = canvasContext();
    drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), 1.25);
    expect(context.stroke).toHaveBeenCalledTimes(2);
    expect(context.translate).not.toHaveBeenCalled();
    expect(context.rotate).not.toHaveBeenCalled();
    expect(context.scale).not.toHaveBeenCalled();
  });
});

describe("선을 그린 순서대로 나타나는 모션", () => {
  it("60% 구간 또는 여덟 박자 중 짧은 시간에 그리기를 마치고 유지한다", () => {
    expect(sampleSceneGraphicPose(timed("draw-on", 10, 10), 120, 10).reveal).toBe(0);
    expect(sampleSceneGraphicPose(timed("draw-on", 10, 10), 120, 12).reveal).toBe(.5);
    expect(sampleSceneGraphicPose(timed("draw-on", 10, 10), 120, 14).reveal).toBe(1);
    expect(sampleSceneGraphicPose(timed("draw-on", 10, 2), 120, 11.2).reveal).toBeCloseTo(1);
  });

  it("선 길이를 따라 첫 선을 먼저 그리고 다음 선으로 진행한다", () => {
    const current = timed("draw-on");
    const context = canvasContext();
    drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), 0);
    expect(context.stroke).not.toHaveBeenCalled();
    drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), 1);
    expect(context.stroke).toHaveBeenCalledOnce();
    expect((context.stroke.mock.calls[0][0] as PaintedPath).source).toBe("M 100 100 L 150 100");
    context.stroke.mockClear();
    drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), 3);
    expect(context.stroke.mock.calls.map((call) => (call[0] as PaintedPath).source)).toEqual([
      elementPath(line), "M 600 300 L 650 300"
    ]);
  });

  it("붓의 원본 점과 필압을 보간하고 완성된 프레임은 원본 윤곽과 같다", () => {
    const brush: SceneElement = { ...line, tool: "brush", points: [[100, 100, .1], [200, 100, .9]] };
    const current = { ...timed("draw-on"), scene: { ...scene, motion: "draw-on" as const, elements: [brush] } };
    const before = JSON.stringify(current.scene);
    const context = canvasContext();
    drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), 2);
    expect((context.fill.mock.calls[0][0] as PaintedPath).source).toBe(elementPath({ ...brush,
      points: [[100, 100, .1], [150, 100, .5]] }));
    context.fill.mockClear();
    drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), 5);
    expect((context.fill.mock.calls[0][0] as PaintedPath).source).toBe(elementPath(brush));
    expect(JSON.stringify(current.scene)).toBe(before);
  });

  it("네모는 둘레를 따라 그리고 동그라미도 완성 전부터 부분 경로로 표시한다", () => {
    const rectangle: SceneElement = { ...line, tool: "rectangle", points: [[100, 100, .5], [200, 200, .5]] };
    const ellipse: SceneElement = { ...rectangle, id: "circle", tool: "ellipse" };
    for (const element of [rectangle, ellipse]) {
      const current = { ...timed("draw-on"), scene: { ...scene, motion: "draw-on" as const, elements: [element] } };
      const context = canvasContext();
      drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), 1);
      const partial = (context.stroke.mock.calls[0][0] as PaintedPath).source;
      if (element.tool === "rectangle") expect(partial).toBe("M 100 100 L 200 100");
      expect(partial).not.toBe(elementPath(element));
      context.stroke.mockClear();
      drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), 4);
      expect((context.stroke.mock.calls[0][0] as PaintedPath).source).toBe(elementPath(element));
    }
  });

  it("점 하나로 찍은 붓도 오류 없이 나타나며 그림 데이터를 수정하지 않는다", () => {
    const dot: SceneElement = { ...line, tool: "brush", points: [[100, 100, .5]] };
    const current = { ...timed("draw-on"), scene: { ...scene, motion: "draw-on" as const, elements: [dot] } };
    const context = canvasContext();
    drawSceneMotionGraphics(context as unknown as CanvasRenderingContext2D, current, plan(current), .1);
    expect(context.fill).toHaveBeenCalledOnce();
    expect((context.fill.mock.calls[0][0] as PaintedPath).source).not.toContain("NaN");
  });
});

describe("새 장면 등장과 장식 효과", () => {
  const newMotions = ["pop-in", "iris", "curtain", "assemble", "sparkle", "confetti"] as const;

  it("팝업은 원본 크기를 넘지 않으며 등장 뒤 원래 크기와 투명도로 정착한다", () => {
    const current = timed("pop-in");
    expect(sampleSceneGraphicPose(current, 120, 0)).toMatchObject({ scale: .78, opacity: 0 });
    for (let index = 0; index <= 100; index += 1) {
      const pose = sampleSceneGraphicPose(current, 120, index / 100);
      expect(pose.scale).toBeGreaterThanOrEqual(.78);
      expect(pose.scale).toBeLessThanOrEqual(1);
    }
    expect(sampleSceneGraphicPose(current, 120, .8).scale).toBeLessThan(1);
    expect(sampleSceneGraphicPose(current, 120, 1)).toMatchObject({ scale: 1, opacity: 1 });
    const complete = graphicSnapshot(current, 1.2);
    expect(complete.paints).toEqual(graphicSnapshot(timed("still"), 1.2).paints);
    expect(complete.scales).toHaveLength(0);
  });

  it.each(["iris", "curtain"] as const)("%s는 그림 형태를 바꾸지 않는 마스크로 등장하고 완료 후 마스크를 제거한다", (motion) => {
    const current = timed(motion);
    expect(graphicSnapshot(current, 0).paints).toHaveLength(0);
    const during = graphicSnapshot(current, .2);
    expect(during.paints).toHaveLength(2);
    expect(motion === "iris" ? during.arcs : during.clips).toHaveLength(1);
    expect(during.translates).toHaveLength(0);
    const complete = graphicSnapshot(current, 1.2);
    expect(complete.paints).toEqual(graphicSnapshot(timed("still"), 1.2).paints);
    expect(complete.arcs).toHaveLength(0);
    expect(complete.clips).toHaveLength(0);
  });

  it("조각 모으기는 여섯 타일로 재생하고 완료 프레임은 타일 없는 원본 그림과 일치한다", () => {
    const current = timed("assemble");
    expect(graphicSnapshot(current, 0).paints).toHaveLength(0);
    const during = graphicSnapshot(current, .2);
    expect(during.clips).toHaveLength(6);
    expect(during.scales).toHaveLength(6);
    expect(during.scales.every(([x, y]) => x === y && x > 0 && x <= 1)).toBe(true);
    const complete = graphicSnapshot(current, 1.2);
    expect(complete.paints).toEqual(graphicSnapshot(timed("still"), 1.2).paints);
    expect(complete.clips).toHaveLength(0);
    expect(complete.scales).toHaveLength(0);
    expect(complete.translates).toHaveLength(0);
  });

  it.each(newMotions)("%s를 임의 시각으로 되감아도 동일하게 그리며 원본을 수정하지 않는다", (motion) => {
    const current = timed(motion);
    const original = JSON.stringify(current.scene);
    const first = graphicSnapshot(current, .4);
    graphicSnapshot(current, 1.1);
    expect(graphicSnapshot(current, .4)).toEqual(first);
    expect(JSON.stringify(current.scene)).toBe(original);
    expect(graphicSnapshot(timed(motion, 10), 10.5, 120, 10)).toEqual(graphicSnapshot(current, .5));
  });

  it.each(["assemble", "sparkle", "confetti"] as const)("%s의 장식 배치는 장면 ID에 따라 정해진다", (motion) => {
    const first = timed(motion);
    const next = { ...first, scene: { ...first.scene, id: "another-scene" } };
    expect(graphicSnapshot(first, .4)).not.toEqual(graphicSnapshot(next, .4));
  });

  it.each(["sparkle", "confetti"] as const)("%s는 원본 그림 전체를 항상 유지하며 장식만 추가한다", (motion) => {
    const current = timed(motion);
    const original = graphicSnapshot(timed("still"), .4).paints;
    expect(graphicSnapshot(current, .4).paints.slice(0, 2)).toEqual(original);
    expect(graphicSnapshot(current, .4).paints.length).toBeGreaterThan(2);
    expect(graphicSnapshot(current, .7)).not.toEqual(graphicSnapshot(current, .4));
  });

  it("색종이는 최초 여덟 박자 또는 장면의 70% 안에 끝나고 원본 그림으로 돌아간다", () => {
    const current = timed("confetti");
    expect(graphicSnapshot(current, 1.8, 240).paints.length).toBeGreaterThan(2);
    expect(graphicSnapshot(current, 2, 240).paints).toEqual(graphicSnapshot(timed("still"), 2, 240).paints);
    const short = timed("confetti", 0, .5);
    expect(graphicSnapshot(short, .4).paints).toEqual(graphicSnapshot(timed("still", 0, .5), .4).paints);
  });
});

describe("회전·카드·사선 등장과 겨울·조명 효과", () => {
  const motions = ["rotate-in", "flip-in", "diagonal-reveal", "zoom-out", "snow", "spotlight"] as const;

  it("회전 등장은 큰 그림과 가장자리에 붙은 그림의 모든 모서리를 화면 안에 유지한다", () => {
    const frames: SceneElement[] = [
      { ...line, tool: "rectangle", points: [[2, 2, .5], [958, 538, .5]] },
      { ...line, tool: "rectangle", points: [[2, 2, .5], [700, 500, .5]] }
    ];
    for (const frame of frames) {
      const current = { ...timed("rotate-in"), scene: { ...scene, motion: "rotate-in" as const, elements: [frame] } };
      const bounds = elementBounds(frame);
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      for (let index = 0; index < 200; index += 1) {
        const pose = sampleSceneGraphicPose(current, 120, index / 100);
        expect(pose.scale).toBeGreaterThan(0);
        expect(pose.scale).toBeLessThanOrEqual(1);
        for (const [x, y] of [[bounds.left, bounds.top], [bounds.right, bounds.top],
          [bounds.left, bounds.bottom], [bounds.right, bounds.bottom]]) {
          const dx = x - centerX;
          const dy = y - centerY;
          const mappedX = centerX + pose.dx + pose.scale * (Math.cos(pose.rotation) * dx - Math.sin(pose.rotation) * dy);
          const mappedY = centerY + pose.dy + pose.scale * (Math.sin(pose.rotation) * dx + Math.cos(pose.rotation) * dy);
          expect(mappedX).toBeGreaterThanOrEqual(-1e-8);
          expect(mappedX).toBeLessThanOrEqual(960 + 1e-8);
          expect(mappedY).toBeGreaterThanOrEqual(-1e-8);
          expect(mappedY).toBeLessThanOrEqual(540 + 1e-8);
        }
      }
    }
  });

  it("카드 뒤집기는 항상 양수 가로 배율을 사용해 글자를 거울상으로 만들지 않는다", () => {
    const current = timed("flip-in");
    for (let index = 0; index <= 120; index += 1) {
      const pose = sampleSceneGraphicPose(current, 120, index / 100);
      expect(pose.horizontalScale).toBeGreaterThan(0);
      expect(pose.horizontalScale).toBeLessThanOrEqual(1);
      expect(pose.scale).toBeLessThanOrEqual(1);
    }
    expect(sampleSceneGraphicPose(current, 120, .4).horizontalScale).toBeLessThan(.6);
    expect(sampleSceneGraphicPose(current, 120, 2).horizontalScale).toBe(1);
  });

  it.each(["rotate-in", "flip-in", "diagonal-reveal"] as const)("%s는 4박 안에 완료하고 원본 그림으로 정확하게 돌아온다", (motion) => {
    const current = timed(motion);
    const complete = graphicSnapshot(current, 2);
    expect(complete).toEqual(graphicSnapshot(timed("still"), 2));
    expect(graphicSnapshot(current, .4)).not.toEqual(complete);
    const short = timed(motion, 0, .25);
    expect(graphicSnapshot(short, .2)).toEqual(graphicSnapshot(timed("still", 0, .25), .2));
  });

  it("사선 마스크는 왼쪽 위에서 진행하며 완료 전에는 그림을 자르는 경로를 유지한다", () => {
    const current = timed("diagonal-reveal");
    expect(graphicSnapshot(current, 0).paints).toHaveLength(0);
    const early = graphicSnapshot(current, .2);
    const middle = graphicSnapshot(current, .6);
    expect(early.maskStart).toEqual([[0, 0]]);
    expect(early.maskEdges.length).toBeGreaterThanOrEqual(2);
    expect(middle.maskEdges).not.toEqual(early.maskEdges);
    expect(middle.translates).toHaveLength(0);
  });

  it("천천히 멀어지기는 장면 전체에 걸쳐 1배에서 0.92배로 축소한다", () => {
    const current = timed("zoom-out", 10, 8);
    expect(sampleSceneGraphicPose(current, 120, 10).scale).toBe(1);
    expect(sampleSceneGraphicPose(current, 120, 14).scale).toBeCloseTo(.96);
    expect(sampleSceneGraphicPose(current, 120, 18).scale).toBeCloseTo(.92);
  });

  it.each(motions)("%s의 임의 시점 재생과 장면 오프셋은 같은 그림을 재현한다", (motion) => {
    const current = timed(motion);
    const original = JSON.stringify(current.scene);
    const first = graphicSnapshot(current, .6);
    graphicSnapshot(current, 1.2);
    expect(graphicSnapshot(current, .6)).toEqual(first);
    expect(graphicSnapshot(timed(motion, 10), 10.5, 120, 10)).toEqual(graphicSnapshot(current, .5));
    expect(JSON.stringify(current.scene)).toBe(original);
  });

  it("눈은 원본 위에 밝은 채움과 하늘색 테두리로 보이며 ID와 시간에 따라 재현된다", () => {
    const current = timed("snow");
    const first = graphicSnapshot(current, .6);
    expect(first.paints.slice(0, 2)).toEqual(graphicSnapshot(timed("still"), .6).paints);
    expect(first.paints).toHaveLength(66);
    expect(first.paints).toContainEqual(expect.arrayContaining(["fill", expect.any(String), "#eef8ff"]));
    expect(first.paints).toContainEqual(expect.arrayContaining(["stroke", expect.any(String), "#90bde0"]));
    expect(graphicSnapshot(current, .9).translates).not.toEqual(first.translates);
    const next = { ...current, scene: { ...current.scene, id: "other-snow" } };
    expect(graphicSnapshot(next, .6)).not.toEqual(first);
  });

  it("스포트라이트는 원본을 유지하고 제목·가사를 제외한 영역의 선에만 부드러운 색을 더한다", () => {
    const current = timed("spotlight");
    const during = graphicSnapshot(current, 1.5);
    expect(during.paints.slice(0, 2)).toEqual(graphicSnapshot(timed("still"), 1.5).paints);
    expect(during.clips[0]).toEqual([0, 49.5, 960, 412.5]);
    expect(during.arcs).toHaveLength(8);
    expect(during.paints).toContainEqual(expect.arrayContaining(["stroke", expect.any(String), "#fff2a8"]));
    expect(during.paints.some((paint) => Array.isArray(paint) && paint[0] === "rect")).toBe(false);
    expect(graphicSnapshot(current, 4)).toEqual(graphicSnapshot(timed("still"), 4));
  });
});

describe("이동 프리셋의 장면 렌더링", () => {
  const motions = ["move-left", "move-right", "move-up", "move-down", "move-up-left", "move-up-right",
    "move-down-left", "move-down-right", "bounce-left", "bounce-right"] as const;

  it.each(motions)("%s는 전체 그림을 한 번만 변형하고 임의 시각과 장면 오프셋을 재현한다", (motion) => {
    const current = timed(motion);
    const original = JSON.stringify(current.scene);
    const first = graphicSnapshot(current, .6);
    graphicSnapshot(current, 1.2);
    expect(graphicSnapshot(current, .6)).toEqual(first);
    expect(graphicSnapshot(timed(motion, 10), 10.5, 120, 10)).toEqual(graphicSnapshot(current, .5));
    expect(first.paints).toEqual(graphicSnapshot(timed("still"), .6).paints);
    expect(first.translates).toHaveLength(2);
    expect(first.scales).toHaveLength(1);
    expect(JSON.stringify(current.scene)).toBe(original);
  });

  it("최대 굵기와 필압으로 도화지 밖까지 뻗는 붓 외곽도 모든 방향과 점프에서 잘리지 않는다", () => {
    const strokes: SceneElement[] = [
      { ...line, tool: "brush", width: 60, points: [[0, 0, 1], [960, 540, 1]] },
      { ...line, tool: "brush", width: 60, points: Array.from({ length: 109 }, (_, index) => [480, index * 5, 1]) },
      { ...line, tool: "brush", width: 60, points: Array.from({ length: 109 }, (_, index) => [index % 2 ? 960 : 0, index * 5, 1]) }
    ];
    for (const brush of strokes) {
      const outline = elementPath(brush).match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const xs = outline.filter((_, index) => index % 2 === 0);
      const ys = outline.filter((_, index) => index % 2 === 1);
      const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      const canvasFit = Math.min(1, 956 / (bounds.right - bounds.left), 536 / (bounds.bottom - bounds.top));
      for (const motion of motions) {
        const current = { ...timed(motion), scene: { ...scene, motion, elements: [brush] } };
        for (const time of [0, 1 / 6, .5, 5, 10]) {
          const pose = sampleSceneGraphicPose(current, 180, time);
          expect(pose.scale / canvasFit).toBeGreaterThanOrEqual(.88);
          expect(centerX + (bounds.left - centerX) * pose.scale + pose.dx).toBeGreaterThanOrEqual(-1e-8);
          expect(centerX + (bounds.right - centerX) * pose.scale + pose.dx).toBeLessThanOrEqual(960 + 1e-8);
          expect(centerY + (bounds.top - centerY) * pose.scale + pose.dy).toBeGreaterThanOrEqual(-1e-8);
          expect(centerY + (bounds.bottom - centerY) * pose.scale + pose.dy).toBeLessThanOrEqual(540 + 1e-8);
        }
      }
    }
  });
});

describe("악보 BPM에 맞춘 모든 모션의 속도", () => {
  const motions = ["still", "draw-on", "fade", "slide", "zoom", "float", "bounce", "pulse",
    "pop-in", "iris", "curtain", "assemble", "sparkle", "confetti", "rotate-in", "flip-in",
    "diagonal-reveal", "zoom-out", "snow", "spotlight", "move-left", "move-right", "move-up", "move-down",
    "move-up-left", "move-up-right", "move-down-left", "move-down-right", "bounce-left", "bounce-right"] as const;

  function scorePlan(motion: SceneMotion, bpm: number) {
    const measures = ["노래소리", "함께놀자"].map((word, measureIndex) => ({ measureIndex,
      notes: Array.from(word, (lyric, index) => ({ id: `${measureIndex}-${index}`, lyric, pitch: 60,
        duration: { numerator: 1, denominator: 1 } })) }));
    return buildMusicVideoPlan("노래", measures, bpm, 0, 8 * 60 / bpm,
      [{ ...scene, motion, endMeasureIndex: 0 }, { ...scene, id: "second", motion, endMeasureIndex: 1 }]);
  }

  it.each(motions)("%s는 실제 90·180 BPM 악보의 같은 박자 위치에서 동일하게 보인다", (motion) => {
    const slow = scorePlan(motion, 90);
    const fast = scorePlan(motion, 180);
    expect(fast.scenes[0].endSeconds * 2).toBe(slow.scenes[0].endSeconds);
    const beat = 1.2;
    expect(graphicSnapshot(fast.scenes[0], beat * 60 / 180, 180))
      .toEqual(graphicSnapshot(slow.scenes[0], beat * 60 / 90, 90));
  });

  it.each(motions.filter((motion) => motion !== "still"))("%s는 실제 악보의 같은 초에서 빠른 BPM이면 더 빠른 상태로 진행한다", (motion) => {
    const slow = scorePlan(motion, 90);
    const fast = scorePlan(motion, 180);
    expect(graphicSnapshot(fast.scenes[0], .25, 180)).not.toEqual(graphicSnapshot(slow.scenes[0], .25, 90));
  });

  it.each(["float", "bounce", "pulse", "bounce-left", "bounce-right"] as const)(
    "%s의 반복 위상은 전주 이후 박자 중간에 장면이 바뀌어도 유지된다", (motion) => {
      const origin = .08 + 16 * 60 / 120;
      const now = origin + .25;
      const first = timed(motion, 0, 20);
      const later = timed(motion, origin + .125, 4);
      const expected = sampleSceneGraphicPose(first, 120, now, origin);
      const actual = sampleSceneGraphicPose(later, 120, now, origin);
      expect(actual.dy).toBe(expected.dy);
      if (motion === "pulse") expect(actual.scale).toBe(1.045);
      if (motion === "bounce") expect(actual.dy).toBe(-15);
      if (motion.startsWith("bounce-")) expect(actual.dy).toBe(-14);
    });

  it.each(["sparkle", "snow"] as const)("%s도 후속 장면에서 음악 위상을 이어가고 전주 음수 박자를 안전하게 처리한다", (motion) => {
    const origin = .08 + 16 * 60 / 120;
    const now = origin + .25;
    expect(graphicSnapshot(timed(motion, origin + .125, 4), now, 120, origin))
      .toEqual(graphicSnapshot(timed(motion, 0, 20), now, 120, origin));
    const beforeMusic = graphicSnapshot(timed(motion, 0, 20), 0, 120, origin);
    expect(beforeMusic.paints.length).toBeGreaterThan(2);
    expect(beforeMusic.translates.every((coordinates) => coordinates.every(Number.isFinite))).toBe(true);
  });
});
