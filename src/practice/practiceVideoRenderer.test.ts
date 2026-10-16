import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import type { PracticeAudioInput } from "./practiceAudioTypes";
import { drawPracticeVideoBars } from "./practiceVideoBars";
import { buildPracticeVideoPreviewPlan } from "./practiceVideoPlan";
import { preparePracticeVideoRenderer } from "./practiceVideoRenderer";
import { recordVideoCanvases, type VideoCanvasCommand } from "./practiceVideoRendererTestCanvas";
import { clearScoreDrawing, scoreDrawing } from "./practiceVideoRendererTestVex";

vi.mock("../music/vexflow", async () => {
  const { testVexFlow } = await import("./practiceVideoRendererTestVex");
  return { loadVexFlow: async () => testVexFlow() };
});

function note(id: string, pitch: number | null, beats: number, lyric?: string): NoteEvent {
  return { id, pitch, duration: rational(beats * 4, 4), lyric };
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

function layeredVideoInput(): PracticeAudioInput {
  return {
    title: "리듬을 담은 가락",
    mode: "rhythm-melody",
    bpm: 120,
    meter: { beats: 4, beatUnit: 4 },
    step: "melody",
    melodyInstrumentId: "piano",
    rhythmInstrumentId: "beat:woodblock",
    measures: [
      { notes: [note("main-c", 60, 2, "가"), note("main-e", 64, 2, "나")] },
      { notes: [note("main-g", 67, 4, "다")] }
    ],
    rhythmLayers: [
      { id: "clap", instrumentId: "beat:clap", measures: [
        { notes: [note("clap-one", 60, 4, "짝")] },
        { notes: [note("clap-two", 60, 4, "짝")] }
      ] },
      { id: "kick", instrumentId: "beat:kick", measures: [
        { notes: [note("kick-one", 60, 4, "쿵")] },
        { notes: [note("kick-two", 60, 4, "쿵")] }
      ] }
    ]
  };
}

function rhythmSymbolInput(beats: number, rest: boolean): PracticeAudioInput {
  return {
    title: "박자에 맞는 음표",
    mode: "rhythm",
    bpm: 120,
    meter: { beats: 4, beatUnit: 4 },
    step: "rhythm",
    melodyInstrumentId: "piano",
    rhythmInstrumentId: "beat:woodblock",
    measures: [
      { notes: [{ ...note("symbol", rest ? null : 60, beats, rest ? undefined : "별"), dotted: [1.5, 3].includes(beats) }] },
      { notes: [note("following", 60, 4, "빛")] }
    ]
  };
}

function comparableCommands(commands: readonly VideoCanvasCommand[]) {
  return commands.map((command) => ({
    ...command,
    args: command.args.map((argument) => argument instanceof HTMLCanvasElement
      ? { canvasWidth: argument.width, canvasHeight: argument.height } : argument)
  }));
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
  it.each([false, true])("리듬 막대의 쉼표=%s 기호는 일곱 길이를 구분하며 음악 글꼴이나 리듬 문구 없이 그린다", (rest) => {
    const canvases = recordVideoCanvases();
    const drawings: string[] = [];
    for (const beats of [0.25, 0.5, 1, 1.5, 2, 3, 4]) {
      const plan = buildPracticeVideoPreviewPlan(rhythmSymbolInput(beats, rest));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      // Drawing one inactive bar keeps its size and highlight identical, so only
      // the requested duration's musical symbol can distinguish these outputs.
      drawPracticeVideoBars(context, plan, [plan.measures[0]], -1);
      const commands = canvases.at(-1)!.commands;
      const text = textCommands(commands).map((command) => command.args[0]);
      expect(text).toEqual(rest ? [] : ["별"]);
      expect(text).not.toContain("리듬");
      expect(text).not.toContain("쉼");
      expect(commands.some((command) => command.name === "fill" || command.name === "stroke")).toBe(true);
      expect(commands.flatMap((command) => [
        ...command.args, ...command.path.flatMap((part) => part.args)
      ]).filter((argument): argument is number => typeof argument === "number").every(Number.isFinite)).toBe(true);
      const barStrokeIndex = commands.findIndex((command) => command.name === "stroke" &&
        command.path.some((part) => part.name === "roundRect"));
      const bar = commands[barStrokeIndex].path.find((part) => part.name === "roundRect")!;
      const [left, top, width, height] = bar.args as number[];
      const lyricIndex = commands.findIndex((command, index) => index > barStrokeIndex && command.name === "fillText");
      const symbols = commands.slice(barStrokeIndex + 1, lyricIndex)
        .filter((command) => ["fill", "stroke", "fillRect"].includes(command.name));
      expect(symbols.length).toBeGreaterThan(0);
      const points: number[][] = [];
      for (const command of symbols) {
        expect(white(command.name === "stroke" ? command.strokeStyle : command.fillStyle)).toBe(true);
        if (command.name === "fillRect") {
          const [x, y, w, h] = command.args as number[];
          points.push([x, y], [x + w, y + h]);
        }
        for (const part of command.path) {
          const args = part.args as number[];
          if (["moveTo", "lineTo", "bezierCurveTo"].includes(part.name)) {
            for (let index = 0; index < args.length; index += 2) points.push(args.slice(index, index + 2));
          }
          if (part.name === "arc" || part.name === "ellipse") {
            const [x, y, rx] = args;
            const ry = part.name === "ellipse" ? args[3] : rx;
            points.push([x - rx, y - ry], [x + rx, y + ry]);
          }
        }
      }
      expect(points.length).toBeGreaterThan(0);
      expect(points.every(([x, y]) => x >= left && x <= left + width && y >= top && y <= top + height),
        "음표·쉼표와 점은 모두 해당 리듬 막대 안에 들어가야 한다").toBe(true);
      const dots = symbols.flatMap((command) => command.path)
        .filter((part) => part.name === "arc" && Number(part.args[2]) <= 1.5);
      expect(dots.length > 0).toBe([1.5, 3].includes(beats));
      const lyric = commands[lyricIndex];
      expect(Number(lyric.args[2]), "가사는 기호가 있는 막대 아래에서 그대로 표시한다").toBeGreaterThan(top + height);
      drawings.push(JSON.stringify(comparableCommands(commands)));
    }
    expect(new Set(drawings).size, "16분·8분·4분·점4분·2분·점2분·온 기호가 각각 달라야 한다").toBe(7);
  });

  it.each(["bars", "score"] as const)("%s 저장 영상은 가락 단계에서 아래 리듬을 그리지 않고 리듬 모드에서는 세 악보를 유지한다", async (mode) => {
    const input = layeredVideoInput();
    const combined = buildPracticeVideoPreviewPlan(input);
    const melodyOnly = buildPracticeVideoPreviewPlan({ ...input, mode: "melody", rhythmLayers: [] });
    const rhythmOnly = buildPracticeVideoPreviewPlan({ ...input, mode: "rhythm", step: "rhythm" });
    expect(combined).toEqual(melodyOnly);
    expect(combined.tracks).toHaveLength(1);
    expect(combined.tracks[0].rhythm).toBe(false);
    expect(combined.measures.every((measure) => measure.tracks.length === 1)).toBe(true);
    expect(rhythmOnly.tracks).toHaveLength(3);
    expect(rhythmOnly.tracks.every((track) => track.rhythm)).toBe(true);
    const canvases = recordVideoCanvases();

    const capture = async (plan: typeof combined) => {
      clearScoreDrawing();
      const firstCanvas = canvases.length;
      const renderer = await preparePracticeVideoRenderer(plan, mode);
      for (const seconds of [0.1, 1.2, 2.1, 3.4]) renderer.draw(seconds);
      return {
        commands: canvases.slice(firstCanvas).map((canvas) => comparableCommands(canvas.commands)),
        staves: scoreDrawing.staves.map((stave) => ({ ...stave }))
      };
    };

    const combinedDrawing = await capture(combined);
    const melodyDrawing = await capture(melodyOnly);
    const rhythmDrawing = await capture(rhythmOnly);
    expect(combinedDrawing).toEqual(melodyDrawing);
    const combinedText = combinedDrawing.commands.flatMap(textCommands).map((command) => command.args[0]);
    expect(combinedText).not.toContain("짝");
    expect(combinedText).not.toContain("쿵");
    expect(rhythmDrawing).not.toEqual(combinedDrawing);
    if (mode === "score") {
      expect(combinedDrawing.staves).toHaveLength(2);
      expect(new Set(combinedDrawing.staves.map((stave) => stave.y)).size).toBe(1);
      expect(rhythmDrawing.staves).toHaveLength(6);
      expect(new Set(rhythmDrawing.staves.map((stave) => stave.y)).size).toBe(3);
    } else {
      expect(combinedDrawing.commands.flatMap(textCommands).some((command) => command.args[0] === "리듬"))
        .toBe(false);
      expect(rhythmDrawing.commands.flatMap(textCommands).some((command) => command.args[0] === "리듬"))
        .toBe(false);
      expect(rhythmDrawing.commands.flat().some((command) => command.path.some((part) => part.name === "ellipse")))
        .toBe(true);
    }
  });

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
