import { afterEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import type { PracticeAudioInput } from "./practiceAudioTypes";
import { buildPracticeVideoPreviewPlan } from "./practiceVideoPlan";
import { preparePracticeVideoRenderer } from "./practiceVideoRenderer";
import { recordVideoCanvases, type VideoCanvasCommand } from "./practiceVideoRendererTestCanvas";

const vex = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../music/vexflow", () => ({ loadVexFlow: vex.load }));

function note(id: string, lyric: string, beats: number, pitch: number | null = 60): NoteEvent {
  return { id, lyric, pitch, duration: rational(beats * 64, 64) };
}

function input(step: "rhythm" | "melody" = "melody"): PracticeAudioInput {
  return {
    title: "영상에 넣지 않는 제목", step, bpm: 120,
    melodyInstrumentId: "piano", rhythmInstrumentId: "beat:woodblock",
    meter: { beats: 4, beatUnit: 4 },
    measures: [
      { notes: [note("spring", "봄", 2), note("day", "날", 1), note("rest", "", 1, null)] },
      { notes: [note("smile", "웃", 2), note("face", "음", 2)] }
    ]
  };
}

function text(commands: readonly VideoCanvasCommand[]): VideoCanvasCommand[] {
  return commands.filter((command) => command.name === "fillText");
}

function words(commands: readonly VideoCanvasCommand[]): string {
  return text(commands).map((command) => command.args[0]).join("");
}

function highlighted(commands: readonly VideoCanvasCommand[]): string[] {
  return text(commands).filter((command) => command.shadowBlur > 0)
    .map((command) => String(command.args[0]));
}

afterEach(() => {
  vi.restoreAllMocks();
  vex.load.mockClear();
});

describe("검정 화면의 흰 가사 영상", () => {
  it.each(["rhythm", "melody"] as const)("%s 음악과 같은 마디 시간에 가사만 바꾸고 쉼표 동안에도 유지한다", async (step) => {
    const canvases = recordVideoCanvases();
    const plan = buildPracticeVideoPreviewPlan(input(step));
    const renderer = await preparePracticeVideoRenderer(plan, "lyrics");
    const canvas = canvases[0];
    expect(renderer.canvas.width).toBe(1280);
    expect(renderer.canvas.height).toBe(720);
    expect(renderer.canvas.getAttribute("aria-label")).toBe("저장할 가사 영상 미리보기");
    expect(words(canvas.commands)).toBe("봄날");

    for (const seconds of [0.1, 1.2, 1.9]) {
      canvas.clear();
      renderer.draw(seconds);
      expect(words(canvas.commands)).toBe("봄날");
      expect(canvas.commands[0]).toMatchObject({ fillStyle: "#000", args: [0, 0, 1280, 720] });
      expect(text(canvas.commands).every((command) => command.fillStyle === "#fff" && command.globalAlpha === 1)).toBe(true);
      expect(highlighted(canvas.commands)).toEqual(seconds < 1 ? ["봄"] : seconds < 1.5 ? ["날"] : []);
    }
    canvas.clear();
    renderer.draw(2);
    expect(words(canvas.commands)).toBe("웃음");
    expect(vex.load).not.toHaveBeenCalled();
    expect(canvases).toHaveLength(1);
  });

  it("재생 계획의 시간 경계를 사용하고 빈 가사 마디는 완전히 검정으로 그린다", async () => {
    const base = buildPracticeVideoPreviewPlan(input());
    const plan = {
      ...base, durationSeconds: 7,
      measures: [
        { ...base.measures[0], endSeconds: 5 },
        { ...base.measures[1], startSeconds: 5, endSeconds: 7, tracks: [[]] }
      ]
    };
    const canvases = recordVideoCanvases();
    const renderer = await preparePracticeVideoRenderer(plan, "lyrics");
    canvases[0].clear();
    renderer.draw(4.9);
    expect(words(canvases[0].commands)).toBe("봄날");
    expect(highlighted(canvases[0].commands)).toEqual([]);
    canvases[0].clear();
    renderer.draw(5);
    expect(canvases[0].commands).toEqual([expect.objectContaining({ name: "fillRect", fillStyle: "#000" })]);
  });

  it("이어지는 빈 음표와 긴 음 동안에는 해당 마디 가사를 유지한다", async () => {
    const settings = { ...input(), measures: [{ notes: [
      { ...note("held", "별", 1), linkToNext: true },
      note("continuation", "", 2), note("rest", "", 1, null)
    ] }] };
    const canvases = recordVideoCanvases();
    const renderer = await preparePracticeVideoRenderer(buildPracticeVideoPreviewPlan(settings), "lyrics");
    for (const seconds of [0, 0.7, 1.4, 1.9]) {
      canvases[0].clear();
      renderer.draw(seconds);
      expect(words(canvases[0].commands)).toBe("별");
      expect(highlighted(canvases[0].commands)).toEqual(seconds < 1.5 ? ["별"] : []);
    }
  });

  it("리듬 악보마다 작성한 가사를 별도 줄에 표시하며 악기 이름을 섞지 않는다", async () => {
    const settings = { ...input("rhythm"),
      rhythmLayers: ["beat:clap", "beat:kick"].map((instrumentId, index) => ({
        id: `layer-${index}`, instrumentId,
        measures: [{ notes: [note(`layer-note-${index}`, index === 0 ? "짝" : "쿵", 4)] }]
      }))
    };
    const canvases = recordVideoCanvases();
    await preparePracticeVideoRenderer(buildPracticeVideoPreviewPlan(settings), "lyrics");
    const labels = text(canvases[0].commands);
    expect(words(canvases[0].commands)).toBe("봄날짝쿵");
    expect(highlighted(canvases[0].commands)).toEqual(["봄", "짝", "쿵"]);
    expect(new Set(labels.map((command) => command.args[2])).size).toBe(3);
    expect(labels.every((command) => command.fillStyle === "#fff")).toBe(true);
    expect(canvases[0].commands.filter((command) => command.name === "stroke").length).toBe(6);
  });

  it("256개 음절은 잘라 버리지 않고 화면 안의 여러 줄로 나눈다", async () => {
    const settings = { ...input(),
      measures: [{ notes: Array.from({ length: 256 }, (_, index) => note(`n-${index}`, "가", 1 / 64)) }]
    };
    const canvases = recordVideoCanvases();
    await preparePracticeVideoRenderer(buildPracticeVideoPreviewPlan(settings), "lyrics");
    const labels = text(canvases[0].commands);
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.map((command) => command.args[0]).join("")).toBe("가".repeat(256));
    expect(labels.every((command) => Number(command.args[2]) > 72 && Number(command.args[2]) < 648)).toBe(true);
    expect(labels.every((command) => Number(command.args[1]) >= 80 && Number(command.args[1]) <= 1200)).toBe(true);
  });

  it("한 음표의 아주 긴 가사도 시간에 따라 나눠 보여 주고 마지막 부분까지 도달한다", async () => {
    const lyric = "가".repeat(3999) + "끝";
    const settings = { ...input(), measures: [{ notes: [note("long", lyric, 4)] }] };
    const canvases = recordVideoCanvases();
    const renderer = await preparePracticeVideoRenderer(buildPracticeVideoPreviewPlan(settings), "lyrics");
    const first = text(canvases[0].commands).map((command) => command.args[0]).join("");
    expect(first).not.toContain("끝");
    canvases[0].clear();
    renderer.draw(1.999);
    const last = text(canvases[0].commands);
    expect(last.map((command) => command.args[0]).join("")).toContain("끝");
    expect(last.every((command) => Number(command.args[2]) > 72 && Number(command.args[2]) < 648)).toBe(true);
    expect(highlighted(canvases[0].commands)).toHaveLength(1);
  });

  it("음절 경계와 공백에서는 실제 가사에만 강조를 이동한다", async () => {
    const settings = { ...input(), measures: [{ notes: [note("words", "봄 날", 3), note("blank", "", 1)] }] };
    const canvases = recordVideoCanvases();
    const renderer = await preparePracticeVideoRenderer(buildPracticeVideoPreviewPlan(settings), "lyrics");
    for (const [seconds, expected] of [[0, ["봄"]], [0.5, []], [1, ["날"]], [1.5, []]] as const) {
      canvases[0].clear();
      renderer.draw(seconds);
      expect(words(canvases[0].commands)).toBe("봄 날");
      expect(highlighted(canvases[0].commands)).toEqual(expected);
    }
  });

  it("서로 다른 높이의 연결이나 쉼표에는 앞 음절의 강조를 연장하지 않는다", async () => {
    for (const pitch of [62, null]) {
      const settings = { ...input(), measures: [{ notes: [
        { ...note("first", "별", 1), linkToNext: true }, note("next", "", 3, pitch)
      ] }] };
      const canvases = recordVideoCanvases();
      const renderer = await preparePracticeVideoRenderer(buildPracticeVideoPreviewPlan(settings), "lyrics");
      canvases[0].clear();
      renderer.draw(0.5);
      expect(highlighted(canvases[0].commands)).toEqual([]);
      vi.restoreAllMocks();
    }
  });

  it("진행 밑줄과 살짝 떠오르는 효과를 시간으로 계산해 탐색 후에도 같은 프레임을 그린다", async () => {
    const canvases = recordVideoCanvases();
    const renderer = await preparePracticeVideoRenderer(buildPracticeVideoPreviewPlan(input()), "lyrics");
    const frame = (seconds: number) => {
      canvases[0].clear();
      renderer.draw(seconds);
      return [...canvases[0].commands];
    };
    const early = frame(0.1);
    const middle = frame(0.5);
    expect(middle).not.toEqual(early);
    const active = text(middle).find((command) => command.shadowBlur > 0)!;
    expect(Number(active.args[2])).toBeLessThan(360);
    expect(parseFloat(active.font.split(" ")[1])).toBeGreaterThan(56);
    expect(middle.some((command) => command.name === "stroke" && command.strokeStyle === "#7ce8ed")).toBe(true);
    frame(2);
    expect(frame(0.5)).toEqual(middle);
    expect(highlighted(frame(1))).toEqual(["날"]);
    expect(highlighted(frame(1.5))).toEqual([]);
  });
});
