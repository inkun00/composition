import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { buildPracticeVideoPreviewPlan } from "./practiceVideoPlan";
import { preparePracticeVideoRenderer } from "./practiceVideoRenderer";
import { recordVideoCanvases, type VideoCanvasCommand } from "./practiceVideoRendererTestCanvas";
import { clearScoreDrawing, scoreDrawing } from "./practiceVideoRendererTestVex";

vi.mock("../music/vexflow", async () => {
  const { testVexFlow } = await import("./practiceVideoRendererTestVex");
  return { loadVexFlow: async () => testVexFlow() };
});

function note(id: string, pitch: number | null, beats: number, lyric?: string): NoteEvent {
  return { id, pitch, duration: rational(beats), lyric };
}

function videoPlan() {
  return buildPracticeVideoPreviewPlan({
    title: "화면에 들어가지 않는 제목",
    bpm: 120,
    meter: { beats: 4, beatUnit: 4 },
    step: "melody",
    melodyInstrumentId: "piano",
    rhythmInstrumentId: "beat:woodblock",
    measures: [
      { notes: [note("c", 60, 2, "가"), note("e", 64, 1, "나"), note("rest", null, 1)] },
      { notes: [note("g", 67, 4, "다")] }
    ]
  });
}

function white(color: string): boolean {
  return /^(white|#fff(?:fff)?|rgba?\(255[, ]+255[, ]+255(?:[, /][\d. ]+)?\))$/i.test(color);
}

function textCommands(commands: readonly VideoCanvasCommand[]) {
  return commands.filter((command) => command.name === "fillText" && command.args[0]);
}

beforeEach(clearScoreDrawing);
afterEach(() => { vi.restoreAllMocks(); });

describe("연습 저장 영상의 실제 그리기", () => {
  it.each(["bars", "score"] as const)("%s 화면은 검정 배경과 흰 도형·글자를 사용하며 별도 제목·정보를 그리지 않는다", async (mode) => {
    const canvases = recordVideoCanvases();
    const renderer = await preparePracticeVideoRenderer(videoPlan(), mode);
    const commands = canvases[0].commands;
    const background = commands.find((command) => command.name === "fillRect");
    expect(background?.args).toEqual([0, 0, renderer.canvas.width, renderer.canvas.height]);
    expect(background?.fillStyle).toMatch(/^(black|#000(?:000)?)$/i);
    const text = canvases.flatMap((canvas) => textCommands(canvas.commands));
    expect(text.map((command) => command.args[0]).join(" "))
      .not.toMatch(/화면에 들어가지 않는 제목|그랜드 피아노|\d마디|BPM|초/);
    expect(text.every((command) => white(command.fillStyle))).toBe(true);
    expect(commands.filter((command) => command.name === "fill")
      .every((command) => white(command.fillStyle))).toBe(true);
  });

  it("계이름은 각 막대 안에 있고 그 아래 가사에는 계이름을 섞지 않는다", async () => {
    const canvases = recordVideoCanvases();
    await preparePracticeVideoRenderer(videoPlan(), "bars");
    const commands = canvases[0].commands;
    const text = textCommands(commands);
    const rectangles = commands.filter((command) => command.name === "fill")
      .flatMap((command) => command.path.filter((part) => part.name === "roundRect"));
    for (const name of ["도", "미", "솔"]) {
      const label = text.find((command) => command.args[0] === name);
      expect(label, `${name} 계이름이 표시되어야 한다`).toBeDefined();
      const [x, y] = label!.args.slice(1, 3) as number[];
      expect(rectangles.some((rectangle) => {
        const [left, top, width, height] = rectangle.args as number[];
        return x >= left && x <= left + width && y >= top && y <= top + height;
      }), `${name} 계이름은 막대 내부에 있어야 한다`).toBe(true);
    }
    const lyricRows = text.filter((command) => ["가", "나", "다"].includes(String(command.args[0])));
    expect(lyricRows).toHaveLength(3);
    expect(text.some((command) => String(command.args[0]).includes(" · "))).toBe(false);
    expect(lyricRows.every((command) => Number(command.args[2]) > Math.max(
      ...text.filter((label) => ["도", "미", "솔"].includes(String(label.args[0])))
        .map((label) => Number(label.args[2]))
    ))).toBe(true);
  });

  it("악보는 끊김 없이 이어지고 흰 악보·가사 외의 설명 문구가 없다", async () => {
    const canvases = recordVideoCanvases();
    await preparePracticeVideoRenderer(videoPlan(), "score");
    const text = canvases.flatMap((canvas) => textCommands(canvas.commands));
    expect(text.map((command) => command.args[0])).toEqual(["가", "나", "다"]);
    expect(text.every((command) => white(command.fillStyle))).toBe(true);
    expect(scoreDrawing.staves).toHaveLength(2);
    const [first, second] = scoreDrawing.staves;
    expect(second.x).toBeCloseTo(first.x + first.width);
    expect(second.y).toBe(first.y);
    expect(first.clef).toBe(true);
    expect(second.clef).toBe(false);
    expect(first.timeSignature).toBe("4/4");
    expect(second.timeSignature).toBeUndefined();
    expect(scoreDrawing.styles.length).toBeGreaterThan(0);
    expect(scoreDrawing.styles.every((style) =>
      (!style.fillStyle || white(style.fillStyle)) && (!style.strokeStyle || white(style.strokeStyle))
    )).toBe(true);
  });

  it.each(["bars", "score"] as const)("%s 모드에서 재생 중인 음표의 모션은 시간에 따라 움직인다", async (mode) => {
    const canvases = recordVideoCanvases();
    const renderer = await preparePracticeVideoRenderer(videoPlan(), mode);
    canvases[0].clear();
    renderer.draw(0.1);
    const particles = () => canvases[0].commands.filter((command) => command.name === "fill" &&
      command.path.some((part) => part.name === "arc"));
    const first = JSON.stringify(particles());
    expect(particles().length).toBeGreaterThan(0);
    canvases[0].clear();
    renderer.draw(0.3);
    const second = JSON.stringify(particles());
    expect(second).not.toBe(first);
    expect(particles().every((command) => white(command.fillStyle))).toBe(true);
    canvases[0].clear();
    renderer.draw(0.3);
    expect(JSON.stringify(particles()), "같은 연주 시간의 미리보기와 MP4 프레임은 같아야 한다").toBe(second);
  });

  it("내보낼 모션 프레임의 간격은 24 fps 이하로 유지하고 음악 끝까지 빈틈이 없다", () => {
    const plan = videoPlan();
    expect(plan.frames[0].startSeconds).toBe(0);
    expect(plan.frames.at(-1)?.endSeconds).toBe(plan.durationSeconds);
    for (const [index, frame] of plan.frames.entries()) {
      expect(frame.endSeconds - frame.startSeconds).toBeLessThanOrEqual(1 / 24 + 0.000001);
      if (index) expect(frame.startSeconds).toBe(plan.frames[index - 1].endSeconds);
    }
  });
});
