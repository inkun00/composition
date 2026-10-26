import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMusicVideoPlan, type MusicVideoScene, type SceneElement } from "./musicVideoModel";
import { drawMusicVideoFrame, drawSceneElements } from "./musicVideoRenderer";

const body: SceneElement = { id: "body", tool: "rectangle", color: "#123456", width: 4,
  points: [[100, 100, .5], [200, 200, .5]] };
const arm: SceneElement = { id: "arm", tool: "line", color: "#654321", width: 4,
  points: [[200, 160, .5], [250, 170, .5]] };
const sun: SceneElement = { id: "sun", tool: "ellipse", color: "#ffcc00", width: 4,
  points: [[600, 60, .5], [660, 120, .5]] };
const scene: MusicVideoScene = { id: "first", background: "#ffffff", elements: [body, arm, sun],
  endLyric: { measureIndex: 0, noteId: "last" }, motion: "bounce" };
const measures = [{ notes: [
  { id: "first", pitch: 60, duration: { numerator: 1, denominator: 1 }, lyric: "나" },
  { id: "last", pitch: 62, duration: { numerator: 1, denominator: 1 }, lyric: "비" }
] }];

function canvasContext() {
  const context = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "", globalAlpha: 1,
    font: "", textAlign: "", textBaseline: "",
    save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
    fillText: vi.fn()
  };
  return context;
}

beforeEach(() => {
  vi.stubGlobal("Path2D", class { constructor(readonly source: string) {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("그림 장면 뮤직비디오 렌더링", () => {
  it("정적인 모드는 선의 위치를 바꾸지 않고 현재 가사를 강조한다", () => {
    const context = canvasContext();
    const colors: string[] = [];
    context.fillText.mockImplementation(() => { colors.push(context.fillStyle); });
    const plan = buildMusicVideoPlan("우리 노래", measures, 120, 0, 2, [scene]);
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, .6, false);

    expect(context.stroke).toHaveBeenCalledTimes(3);
    expect(context.translate).not.toHaveBeenCalled();
    expect(context.rotate).not.toHaveBeenCalled();
    expect(context.scale.mock.calls).toEqual([[1280 / 960, 720 / 540]]);
    expect(context.fillText.mock.calls.map((call) => call[0])).toEqual(["우리 노래", "나", "비"]);
    expect(colors).toEqual(["#ffffff", "#ffffff", "#ffd34f"]);
  });

  it("떨어진 해를 포함한 전체 그림에 공통 중심의 모션을 한 번 적용한다", () => {
    const context = canvasContext();
    const plan = buildMusicVideoPlan("노래", measures, 120, 0, 2, [scene]);
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, .2, true);

    expect(context.stroke).toHaveBeenCalledTimes(3);
    expect(context.rotate).toHaveBeenCalledOnce();
    expect(context.translate).toHaveBeenCalledTimes(2);
    expect(context.translate.mock.calls[0][0]).toBe(380);
    expect(context.translate.mock.calls[1]).toEqual([-380, -130]);
  });

  it("추천을 고르지 않은 예전 자동 장면은 임의의 동작으로 바꾸지 않는다", () => {
    const tall: SceneElement = { ...body, points: [[100, 100, .5], [120, 300, .5]] };
    const auto: MusicVideoScene = { ...scene, elements: [tall], motion: "auto" };
    const context = canvasContext();
    const plan = buildMusicVideoPlan("노래", measures, 120, 0, 2, [auto]);
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, .25, true);
    expect(context.rotate).not.toHaveBeenCalled();
    expect(context.translate).not.toHaveBeenCalled();
    expect(context.scale.mock.calls).toEqual([[1280 / 960, 720 / 540]]);
  });

  it.each(["draw-on", "fade", "slide", "zoom", "pop-in", "iris", "curtain", "assemble", "sparkle", "confetti",
    "rotate-in", "flip-in", "diagonal-reveal", "zoom-out", "snow", "spotlight",
    "move-left", "move-right", "move-up", "move-down", "move-up-left", "move-up-right",
    "move-down-left", "move-down-right", "bounce-left", "bounce-right"] as const)(
    "애니메이션 없는 %s 영상은 시작부터 원본 그림 전체를 표시한다", (motion) => {
    const context = canvasContext();
    const plan = buildMusicVideoPlan("노래", measures, 120, 0, 2, [{ ...scene, motion }]);
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, 0, false);
    expect(context.stroke).toHaveBeenCalledTimes(3);
    expect(context.translate).not.toHaveBeenCalled();
    expect(context.globalAlpha).toBe(1);
    expect(context.scale.mock.calls).toEqual([[1280 / 960, 720 / 540]]);
  });

  it("등장 효과의 투명도는 배경과 가사에는 적용하지 않는다", () => {
    const context = canvasContext();
    const alphas: { kind: string; alpha: number }[] = [];
    const stack: number[] = [];
    context.save.mockImplementation(() => { stack.push(context.globalAlpha); });
    context.restore.mockImplementation(() => { context.globalAlpha = stack.pop()!; });
    context.fillRect.mockImplementation(() => { alphas.push({ kind: "background", alpha: context.globalAlpha }); });
    context.stroke.mockImplementation(() => { alphas.push({ kind: "drawing", alpha: context.globalAlpha }); });
    context.fillText.mockImplementation(() => { alphas.push({ kind: "text", alpha: context.globalAlpha }); });
    const plan = buildMusicVideoPlan("노래", measures, 120, 0, 2, [{ ...scene, motion: "fade" }]);
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, .2, true);
    expect(alphas.filter((entry) => entry.kind === "drawing").every((entry) => entry.alpha > 0 && entry.alpha < 1)).toBe(true);
    expect(alphas.filter((entry) => entry.kind !== "drawing").every((entry) => entry.alpha === 1)).toBe(true);
  });

  it("장면 끝 시각부터 다음 그림을 표시하고 전주와 후주에는 가사를 숨긴다", () => {
    const first: MusicVideoScene = { ...scene, endLyric: { measureIndex: 0, noteId: "first" } };
    const second: MusicVideoScene = { ...scene, id: "second", background: "#abcdef",
      endLyric: null, endMeasureIndex: 1 };
    const twoMeasures = [...measures, { notes: measures[0].notes }];
    const plan = buildMusicVideoPlan("노래", twoMeasures, 120, 1, 4, [first, second]);
    const context = canvasContext();
    const backgrounds: string[] = [];
    context.fillRect.mockImplementation(() => { backgrounds.push(context.fillStyle); });
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, 2, false);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1280, 720);
    expect(backgrounds[0]).toBe("#abcdef");
    expect(context.fillText.mock.calls.map((call) => call[0])).toEqual(["노래", "나", "비"]);
    context.fillText.mockClear();
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, .5, false);
    expect(context.fillText.mock.calls.map((call) => call[0])).toEqual(["노래", "작곡가 미입력"]);
    context.fillText.mockClear();
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, 3, false);
    expect(context.fillText.mock.calls.map((call) => call[0])).toEqual(["노래"]);
  });

  it.each([false, true])("가사 프레임과 마디 시계의 반올림 차이가 있어도 새 장면 첫 음절에 그림을 바꾼다 (애니메이션 %s)", (animated) => {
    const words = ["내가그린그림", "한줄씩나타나요", "노래를따라서", "반짝이는이야기",
      "다음그림에는", "꽃이피어있어", "함께만들어요", "우리들의노래"];
    const authored = words.map((word, measureIndex) => ({ measureIndex,
      notes: Array.from(word, (lyric, index) => ({ id: `note-${measureIndex}-${index}`, pitch: 60, lyric,
        duration: { numerator: 4, denominator: word.length } })) }));
    const first: MusicVideoScene = { ...scene, motion: "still", endLyric: null, endMeasureIndex: 3 };
    const second: MusicVideoScene = { ...first, id: "next", background: "#abcdef", elements: [sun], endMeasureIndex: 7 };
    const plan = buildMusicVideoPlan("노래", authored, 120, .08, 24, [first, second]);
    const frame = plan.lyrics.frames.find((entry) => entry.measureIndex === 4)!;
    expect(frame.startSeconds).toBeLessThan(plan.scenes[1].startSeconds);
    const context = canvasContext();
    const backgrounds: string[] = [];
    context.fillRect.mockImplementation(() => { backgrounds.push(context.fillStyle); });
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, frame.startSeconds - .001, animated);
    expect(backgrounds[0]).toBe("#ffffff");
    backgrounds.length = 0;
    context.stroke.mockClear();
    context.fillText.mockClear();
    drawMusicVideoFrame(context as unknown as CanvasRenderingContext2D, plan, frame.startSeconds, animated);
    expect(backgrounds[0]).toBe("#abcdef");
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.fillText.mock.calls.slice(1).map((call) => call[0]).join("")).toBe(words[4]);
  });

  it("붓의 압력 윤곽선은 채우고 도형은 테두리로 그려 편집 그림과 일치시킨다", () => {
    const context = canvasContext();
    drawSceneElements(context as unknown as CanvasRenderingContext2D, { ...scene,
      elements: [{ ...arm, tool: "brush" }, sun] });
    expect(context.fill).toHaveBeenCalledOnce();
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 960, 540);
  });

  it("개체 효과가 있으면 남아 있는 예전 동작보다 우선하고 정적 출력은 모든 원본 선을 유지한다", () => {
    const partial: MusicVideoScene = {
      ...scene,
      motion: "still",
      elements: [{ ...body, motion: "move-right" }, arm, sun],
      choreography: {
        version: 1, description: "이전 파일",
        actors: [{ id: "old-actor", name: "팔", elementIds: ["arm"],
          fixedPoint: [200, 160], movingPoint: [250, 170], endPoint: [280, 170] }],
        actions: []
      }
    };
    const plan = buildMusicVideoPlan("노래", measures, 120, 0, 2, [partial]);
    const animated = canvasContext();
    drawMusicVideoFrame(animated as unknown as CanvasRenderingContext2D, plan, .2, true);
    expect(animated.stroke).toHaveBeenCalledTimes(3);
    expect(animated.translate.mock.calls.some(([x]) => x > 150 && x < 200)).toBe(true);

    const fixed = canvasContext();
    drawMusicVideoFrame(fixed as unknown as CanvasRenderingContext2D, plan, .2, false);
    expect(fixed.stroke).toHaveBeenCalledTimes(3);
    expect(fixed.translate).not.toHaveBeenCalled();
    expect(fixed.rotate).not.toHaveBeenCalled();
  });
});
