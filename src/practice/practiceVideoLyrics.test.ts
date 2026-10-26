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
    expect(text(canvas.commands).map((command) => command.args[0])).toEqual(["봄날"]);

    for (const seconds of [0.1, 1.2, 1.9]) {
      canvas.clear();
      renderer.draw(seconds);
      expect(text(canvas.commands).map((command) => command.args[0])).toEqual(["봄날"]);
      expect(canvas.commands.map((command) => command.name)).toEqual(["fillRect", "fillText"]);
      expect(canvas.commands[0]).toMatchObject({ fillStyle: "#000", args: [0, 0, 1280, 720] });
      expect(canvas.commands[1]).toMatchObject({ fillStyle: "#fff", globalAlpha: 1 });
      expect(canvas.commands[1].args.slice(1, 3)).toEqual([640, 360]);
    }
    canvas.clear();
    renderer.draw(2);
    expect(text(canvas.commands).map((command) => command.args[0])).toEqual(["웃음"]);
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
    expect(text(canvases[0].commands).map((command) => command.args[0])).toEqual(["봄날"]);
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
      expect(text(canvases[0].commands).map((command) => command.args[0])).toEqual(["별"]);
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
    expect(labels.map((command) => command.args[0])).toEqual(["봄날", "짝", "쿵"]);
    expect(new Set(labels.map((command) => command.args[2])).size).toBe(3);
    expect(labels.every((command) => command.fillStyle === "#fff")).toBe(true);
    expect(canvases[0].commands.every((command) => ["fillRect", "fillText"].includes(command.name))).toBe(true);
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
    expect(labels.every((command) => Number(command.args[3]) === 1120)).toBe(true);
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
  });
});
