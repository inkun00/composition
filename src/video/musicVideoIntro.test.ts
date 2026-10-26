import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSceneFile, serializeSceneFile } from "../musicVideo/sceneFile";
import { buildMusicVideoPlan, getMusicVideoMeasures, isIntroScene, isMusicVideoScenes,
  resolveSceneEndMeasure, validateMusicVideoScenes, type MusicVideoScene } from "./musicVideoModel";
import { drawMusicVideoFrame } from "./musicVideoRenderer";

const measures = [0, 1].map((measureIndex) => ({ measureIndex, notes: [{ id: `note-${measureIndex}`,
  pitch: 60, lyric: "별", duration: { numerator: 4, denominator: 1 } }] }));
const artwork = { id: "line", tool: "line" as const, color: "#123456", width: 8,
  points: [[100, 100, .5], [300, 300, .8]] as const };
const normals: readonly MusicVideoScene[] = [0, 1].map((index) => ({ id: `normal-${index}`,
  background: "#ffffff", endLyric: null, endMeasureIndex: index, motion: "still", elements: [artwork] }));
const intro: MusicVideoScene = { id: "intro", section: "intro", background: "#112233", endLyric: null,
  motion: "still", elements: [{ ...artwork, id: "intro-line", color: "#f97316" }] };

function plan(scenes = normals, introSeconds = 2.08, composer?: string) {
  return buildMusicVideoPlan("우리 노래", measures, 120, introSeconds, 10.28, scenes, composer);
}

function canvas() {
  let font = "";
  const text: { value: string; font: string; color: string; x: number; y: number; maxWidth?: number }[] = [];
  const backgrounds: string[] = [];
  const strokes: string[] = [];
  const context = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "", globalAlpha: 1,
    get font() { return font; }, set font(value: string) { font = value; }, textAlign: "", textBaseline: "",
    save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
    measureText: vi.fn((value: string) => ({ width: [...new Intl.Segmenter("ko", { granularity: "grapheme" })
      .segment(value)].length * Number(font.match(/(\d+)px/)?.[1] ?? 32) })),
    fillText: vi.fn((value: string, x: number, y: number, maxWidth?: number) => {
      text.push({ value, x, y, maxWidth, font, color: context.fillStyle });
    })
  };
  context.fillRect.mockImplementation(() => { backgrounds.push(context.fillStyle); });
  context.stroke.mockImplementation(() => { strokes.push(context.strokeStyle); });
  return { context: context as unknown as CanvasRenderingContext2D, text, backgrounds, strokes };
}

beforeEach(() => vi.stubGlobal("Path2D", class { constructor(readonly source: string) {} }));
afterEach(() => vi.unstubAllGlobals());

describe("전주 장면의 구조와 실제 오디오 경계", () => {
  it("명시한 전주는 실제 전주만 덮고 본곡 마디와 후주는 원래 시각을 유지한다", () => {
    const scenes = [intro, ...normals];
    const original = structuredClone(scenes);
    const current = plan(scenes, 2.08, "  새봄  ");
    expect(current.composer).toBe("새봄");
    expect(current.scenes.map((entry) => [entry.scene.id, entry.startSeconds, entry.endSeconds, entry.lyricText]))
      .toEqual([["intro", 0, 2.08, ""], ["normal-0", 2.08, 4.08, "별"], ["normal-1", 4.08, 10.28, "별"]]);
    expect(current.scenes[0].scene).toBe(intro);
    expect(scenes).toEqual(original);
    expect(current.lyrics.frames[0]).toMatchObject({ startSeconds: 0, endSeconds: 2.08, measureIndex: null });
  });

  it("전주 미지정은 본곡을 앞당기지 않고 전주 0초는 그린 전주를 재생 계획에서 뺀다", () => {
    expect(plan().scenes[0].startSeconds).toBe(2.08);
    const current = plan([intro, ...normals], 0);
    expect(current.scenes.map((entry) => entry.scene.id)).toEqual(["normal-0", "normal-1"]);
    expect(current.scenes[0].startSeconds).toBe(0);
    expect(current.composer).toBeUndefined();
  });

  it("빈 전주는 유효하며 본곡 빈 그림과 본곡 누락은 계속 막는다", () => {
    const cues = getMusicVideoMeasures(measures, 120);
    const blank = { ...intro, elements: [] };
    expect(validateMusicVideoScenes([blank, ...normals], cues, 120)).toBeNull();
    expect(validateMusicVideoScenes([intro, { ...normals[1], elements: [] }], cues, 120)).toContain("그림");
    expect(validateMusicVideoScenes([intro], cues, 120)).toContain("본곡");
    expect(validateMusicVideoScenes([intro, normals[0]], cues, 120)).toContain("마지막 마디");
  });

  it("전주 중복과 본곡 뒤 전주 배치를 거절한다", () => {
    const cues = getMusicVideoMeasures(measures, 120);
    expect(validateMusicVideoScenes([intro, { ...intro, id: "other" }, ...normals], cues)).toContain("하나만");
    expect(validateMusicVideoScenes([normals[0], intro, normals[1]], cues)).toContain("첫 번째");
  });

  it("전주는 본곡 마디를 참조하지 않으며 단일 장면 JSON 저장도 허용한다", () => {
    expect(isIntroScene(intro)).toBe(true);
    expect(isIntroScene(normals[0])).toBe(false);
    expect(resolveSceneEndMeasure(intro, getMusicVideoMeasures(measures, 120))).toBeNull();
    expect(isMusicVideoScenes([intro])).toBe(true);
    expect(parseSceneFile(serializeSceneFile({ ...intro, elements: [] }))).toEqual({ ...intro, elements: [] });
    expect(isMusicVideoScenes([{ ...intro, endMeasureIndex: 0 }])).toBe(false);
    expect(isMusicVideoScenes([{ ...intro, endLyric: { measureIndex: 0, noteId: "note-0" } }])).toBe(false);
  });

  it.each(["normal", "outro", "", null, 1])("잘못된 section %j를 거절한다", (section) => {
    expect(isMusicVideoScenes([{ ...intro, section }])).toBe(false);
  });

  it("전주에 남은 이전 마디 동작은 본곡 범위 검증에서 제외한다", () => {
    const prior: MusicVideoScene = { ...intro, choreography: { version: 1, description: "이전 설정",
      actors: [{ id: "actor", name: "전주 그림", elementIds: ["intro-line"], fixedPoint: [100, 100],
        movingPoint: [300, 300], endPoint: [350, 350] }], actions: [{ id: "action", actorId: "actor", kind: "jump",
        startMeasureIndex: 63, startBeat: 0, durationBeats: 1, strength: 1 }] } };
    expect(validateMusicVideoScenes([prior, ...normals], getMusicVideoMeasures(measures, 120), 120)).toBeNull();
    const frame = canvas();
    expect(() => drawMusicVideoFrame(frame.context, plan([prior, ...normals]), 1, true)).not.toThrow();
    expect(frame.strokes).toEqual(["#f97316"]);
  });
});

describe("전주 미리보기와 MP4의 공통 화면", () => {
  it.each([false, true])("미지정 전주는 검정 제목·작곡가 화면이고 본곡 그림이 비치지 않는다 (animated=%s)", (animated) => {
    const frame = canvas();
    drawMusicVideoFrame(frame.context, plan(normals, 2.08, "새봄"), .5, animated);
    expect(frame.backgrounds).toEqual(["#000000"]);
    expect(frame.text.map((entry) => entry.value)).toEqual(["우리 노래", "작곡가 새봄"]);
    expect(frame.text.every((entry) => entry.color === "#ffffff" && entry.x === 640)).toBe(true);
    expect(frame.strokes).toEqual([]);
  });

  it.each([false, true])("빈 전주는 종이색 대신 검정 카드와 미입력 작곡가를 표시한다 (animated=%s)", (animated) => {
    const frame = canvas();
    drawMusicVideoFrame(frame.context, plan([{ ...intro, elements: [] }, ...normals]), 0, animated);
    expect(frame.backgrounds).toEqual(["#000000"]);
    expect(frame.text.map((entry) => entry.value)).toEqual(["우리 노래", "작곡가 미입력"]);
    expect(frame.strokes).toEqual([]);
  });

  it.each([false, true])("그린 전주는 마지막 순간까지 단독 표시하고 정확한 본곡 경계부터 다음 그림을 표시한다 (animated=%s)", (animated) => {
    const current = plan([intro, ...normals]);
    const before = canvas();
    drawMusicVideoFrame(before.context, current, current.introSeconds - 1e-8, animated);
    expect(before.backgrounds[0]).toBe("#112233");
    expect(before.strokes).toEqual(["#f97316"]);
    expect(before.text).toEqual([]);
    const after = canvas();
    drawMusicVideoFrame(after.context, current, current.introSeconds, animated);
    expect(after.backgrounds[0]).toBe("#ffffff");
    expect(after.strokes).toEqual(["#123456"]);
    expect(after.text.map((entry) => entry.value)).toEqual(["우리 노래", "별"]);
  });

  it("이전 수동 plan에서 본곡 첫 장면이 0초로 남아 있어도 전주에는 노출하지 않는다", () => {
    const original = plan();
    const legacy = { ...original, scenes: original.scenes.map((entry, index) => index ? entry : { ...entry, startSeconds: 0 }) };
    const frame = canvas();
    drawMusicVideoFrame(frame.context, legacy, 1, false);
    expect(frame.backgrounds[0]).toBe("#000000");
    expect(frame.strokes).toEqual([]);
  });

  it("긴 한글·결합 emoji는 안전한 글자 단위로 줄바꿈하고 축소하여 화면 안에 담는다", () => {
    const title = "봄날의👩🏽‍🎨그림과노래".repeat(6);
    const composer = "👨‍👩‍👧‍👦새봄".repeat(8);
    const current = { ...plan(normals, 2.08, composer), title };
    const frame = canvas();
    drawMusicVideoFrame(frame.context, current, .5, false);
    const headings = frame.text.filter((entry) => entry.font.startsWith("700 "));
    const credits = frame.text.filter((entry) => entry.font.startsWith("400 "));
    expect(headings.map((entry) => entry.value).join("")).toBe(title);
    expect(credits.map((entry) => entry.value).join("")).toBe(`작곡가 ${composer}`);
    expect(headings.length).toBeLessThanOrEqual(3);
    expect(credits.length).toBeLessThanOrEqual(2);
    expect(Number(headings[0].font.match(/(\d+)px/)?.[1])).toBeLessThan(76);
    expect(frame.text.every((entry) => entry.y > 50 && entry.y < 670 && entry.maxWidth === 1120)).toBe(true);
    expect(headings.every((entry) => !entry.value.startsWith("\u200d") && !entry.value.endsWith("\u200d"))).toBe(true);
  });

  it("비정상적으로 긴 문자열도 마지막 줄을 안전하게 줄여 카드 밖으로 밀리지 않는다", () => {
    const frame = canvas();
    drawMusicVideoFrame(frame.context, { ...plan(), title: "가".repeat(1000), composer: "나".repeat(1000) }, 1, false);
    expect(frame.text.filter((entry) => entry.font.startsWith("700 "))).toHaveLength(3);
    expect(frame.text.filter((entry) => entry.font.startsWith("400 "))).toHaveLength(2);
    expect(frame.text.filter((entry) => entry.value.endsWith("…"))).toHaveLength(2);
    expect(frame.text.every((entry) => entry.y > 50 && entry.y < 670)).toBe(true);
  });
});
