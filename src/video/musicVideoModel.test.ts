import { describe, expect, it } from "vitest";
import type { NoteEvent } from "../music/types";
import {
  MAX_ELEMENTS, MAX_POINTS, MAX_SCENES, MAX_TOTAL_POINTS, SCENE_HEIGHT, SCENE_WIDTH,
  anchorKey, buildMusicVideoPlan, createMusicVideoScene, getLyricCues, getMusicVideoMeasures, isMusicVideoScenes,
  resolveSceneEndMeasure, validateMusicVideoScenes, validateSceneSequence,
  type LyricAnchor, type MusicVideoScene, type SceneElement, type ScenePoint
} from "./musicVideoModel";

const quarter = { numerator: 1, denominator: 1 };
const half = { numerator: 2, denominator: 1 };
const measures: { measureIndex: number; notes: NoteEvent[] }[] = [
  { measureIndex: 4, notes: [
    { id: "rest", pitch: null, duration: quarter, lyric: "쉼표 가사 제외" },
    { id: "shared", pitch: 60, duration: quarter, lyric: " 라 " },
    { id: "second", pitch: 62, duration: half, lyric: "라" }
  ] },
  { measureIndex: 7, notes: [
    { id: "shared", pitch: 64, duration: quarter, lyric: "라" },
    { id: "instrumental", pitch: 65, duration: quarter, lyric: "  " },
    { id: "last", pitch: 67, duration: quarter, lyric: "끝" },
    { id: "tail-rest", pitch: null, duration: quarter }
  ] }
];
const cues = getLyricCues(measures, 120, 2);
const measureCues = getMusicVideoMeasures(measures, 120, 2);
const element: SceneElement = {
  id: "stroke", tool: "brush", color: "#1950aB", width: 8,
  points: [[0, 0, 0], [SCENE_WIDTH, SCENE_HEIGHT, 1]]
};

function scene(id: string, endLyric: LyricAnchor | null = cues.at(-1)!.anchor): MusicVideoScene {
  return { id, background: "#ffffff", motion: "auto", endLyric, elements: [element] };
}

describe("뮤직비디오 가사 구간", () => {
  it("반복 음절과 여러 마디의 동일한 음표 ID를 구별하며 쉼과 전주를 타이밍에 포함한다", () => {
    expect(cues.map((cue) => ({ key: cue.key, text: cue.text, start: cue.startSeconds, end: cue.endSeconds })))
      .toEqual([
        { key: "4:shared", text: "라", start: 2.5, end: 3 },
        { key: "4:second", text: "라", start: 3, end: 4 },
        { key: "7:shared", text: "라", start: 4, end: 4.5 },
        { key: "7:last", text: "끝", start: 5, end: 5.5 }
      ]);
    expect(cues[0].lineText).toBe("라라");
    expect(cues[2].lineText).toBe("라끝");
    expect(cues[0].label).toContain("5마디");
    expect(cues[2].label).toContain("8마디");
    expect(cues[0].label).not.toBe(cues[1].label);
    expect(anchorKey(cues[0].anchor)).not.toBe(anchorKey(cues[2].anchor));
  });

  it("마디 번호가 없으면 배열 순서를 사용한다", () => {
    expect(getLyricCues(measures.map(({ notes }) => ({ notes })), 120).map((cue) => cue.key))
      .toEqual(["0:shared", "0:second", "1:shared", "1:last"]);
  });

  it("예전 음절 선택도 마디 전체로 올림하고 첫 본곡 장면은 전주 뒤부터, 마지막은 후주까지 유지한다", () => {
    const scenes = [scene("first", cues[0].anchor), scene("last")];
    const plan = buildMusicVideoPlan("  반복 노래  ", measures, 120, 2, 7, scenes);

    expect(plan.title).toBe("반복 노래");
    expect(plan.bpm).toBe(120);
    expect(plan.scenes.map(({ startSeconds, endSeconds, lyricText }) => ({ startSeconds, endSeconds, lyricText })))
      .toEqual([
        { startSeconds: 2, endSeconds: 4, lyricText: "라라" },
        { startSeconds: 4, endSeconds: 7, lyricText: "라끝" }
      ]);
    expect(plan.lyrics.frames[0]).toMatchObject({ startSeconds: 0, endSeconds: 2, syllables: [] });
    expect(plan.lyrics.frames.at(-1)).toMatchObject({ startSeconds: 6, endSeconds: 7, syllables: [] });
    expect(plan.scenes[0].scene).toBe(scenes[0]);
  });

  it("하나의 장면으로 전체 노래를 덮을 수 있고 빈 제목은 기본값을 쓴다", () => {
    const plan = buildMusicVideoPlan(" ", measures, 120, 2, 7, [scene("only")]);
    expect(plan.title).toBe("나의 뮤직비디오");
    expect(plan.scenes[0]).toMatchObject({ startSeconds: 2, endSeconds: 7, lyricText: "라라라끝" });
  });

  it("가사·장면·그림이 없는 경우 생성을 막는다", () => {
    expect(validateMusicVideoScenes([scene("one")], [])).toContain("가사");
    expect(validateMusicVideoScenes([], measureCues)).toContain("장면");
    expect(validateMusicVideoScenes([{ ...scene("one"), elements: [] }], measureCues)).toContain("그림");
  });

  it.each([
    ["미지정", null],
    ["다른 마디의 음표", { measureIndex: 6, noteId: "shared" }]
  ] as const)("%s 끝 마디는 다시 선택해야 한다", (_label, endpoint) => {
    expect(validateMusicVideoScenes([scene("one", endpoint)], measureCues)).toContain("다시 선택");
  });

  it("같은 마디의 서로 다른 음절에 있던 장면은 그림을 버리지 않고 마디 재선택을 안내한다", () => {
    const scenes = [scene("one", cues[0].anchor), scene("two", cues[1].anchor), scene("three")];
    expect(validateMusicVideoScenes(scenes, measureCues)).toContain("같은 마디");
    expect(() => buildMusicVideoPlan("노래", measures, 120, 2, 7, scenes)).toThrow("같은 마디");
    expect(scenes.map((drawing) => drawing.elements)).toEqual([[element], [element], [element]]);
  });

  it("역순의 끝 마디는 거부하고 뒤의 마디를 요구한다", () => {
    const scenes = [scene("one", cues[2].anchor), scene("two", cues[0].anchor), scene("three")];
    expect(validateMusicVideoScenes(scenes, measureCues)).toContain("앞 장면보다 뒤");
    expect(() => buildMusicVideoPlan("노래", measures, 120, 2, 7, scenes)).toThrow("앞 장면보다 뒤");
  });

  it("마지막 마디를 덮어야 생성할 수 있고 오래된 검증 어댑터도 같은 마디 규칙을 쓴다", () => {
    expect(validateMusicVideoScenes([scene("one", cues[0].anchor)], measureCues)).toContain("마지막 마디");
    expect(validateMusicVideoScenes([scene("one", cues[2].anchor)], measureCues)).toBeNull();
    expect(validateSceneSequence([scene("one", cues[0].anchor), scene("two")], cues)).toBeNull();
  });

  it.each([
    [0, 2, 7],
    [-120, 2, 7],
    [Number.NaN, 2, 7],
    [Number.POSITIVE_INFINITY, 2, 7],
    [120, -1, 7],
    [120, Number.NaN, 7],
    [120, 2, Number.POSITIVE_INFINITY],
    [120, 2, Number.NaN],
    [120, 2, 2],
    [120, 2, 1]
  ])("유효하지 않은 재생 시간(bpm=%s, 전주=%s, 전체=%s)은 거부한다", (bpm, intro, duration) => {
    expect(() => buildMusicVideoPlan("노래", measures, bpm, intro, duration, [scene("only")]))
      .toThrow("재생 시간");
  });

  it("녹음은 마지막 가사 뒤 쉼표까지 포함한 마디 길이를 모두 담아야 한다", () => {
    const scenes = [scene("first", cues[0].anchor), scene("last")];
    expect(() => buildMusicVideoPlan("노래", measures, 120, 2, 4, scenes)).toThrow("가사 길이");
    expect(() => buildMusicVideoPlan("노래", measures, 120, 2, 5.5, scenes)).toThrow("가사 길이");
    expect(() => buildMusicVideoPlan("노래", measures, 120, 2, 6, scenes)).not.toThrow();
  });
});

describe("한 마디 단위 그림 구간", () => {
  const instrumental = { measureIndex: 8, notes: [{ id: "instrumental", pitch: null, duration: half }] };

  it("음절 수와 관계없이 마디당 한 항목을 만들고 가사 전체와 연주 마디를 표시한다", () => {
    const result = getMusicVideoMeasures([...measures, instrumental], 120, 2);
    expect(result).toEqual([
      { measureIndex: 4, key: "4", label: "5마디 · 라라", lyricText: "라라", startSeconds: 2, endSeconds: 4 },
      { measureIndex: 7, key: "7", label: "8마디 · 라끝", lyricText: "라끝", startSeconds: 4, endSeconds: 6 },
      { measureIndex: 8, key: "8", label: "9마디 · (연주)", lyricText: "", startSeconds: 6, endSeconds: 7 }
    ]);
    expect(getMusicVideoMeasures(measures.map(({ notes }) => ({ notes })), 120).map((cue) => cue.key))
      .toEqual(["0", "1"]);
  });

  it("새 장면은 끝 마디를 저장하고 명시한 마디를 예전 가사 정보보다 우선한다", () => {
    const fresh = createMusicVideoScene(null, 7);
    expect(fresh).toMatchObject({ endLyric: null, endMeasureIndex: 7 });
    expect(resolveSceneEndMeasure({ ...fresh, endLyric: cues[0].anchor }, measureCues)).toBe(measureCues[1]);
    expect(resolveSceneEndMeasure({ ...fresh, endMeasureIndex: 6 }, measureCues)).toBeNull();
    expect(resolveSceneEndMeasure(scene("one", { measureIndex: 7, noteId: "deleted" }), measureCues))
      .toBe(measureCues[1]);
  });

  it("마지막 가사 뒤 연주 마디까지 선택해야 하며 중간 장면은 마디 끝의 쉼표를 유지한다", () => {
    const authored = [...measures, instrumental];
    const endpoints = getMusicVideoMeasures(authored, 120, 2);
    expect(validateMusicVideoScenes([scene("only")], endpoints)).toContain("마지막 마디");
    const scenes = [scene("first", cues[0].anchor), scene("second"),
      { ...scene("final", null), endMeasureIndex: 8 }];
    expect(validateMusicVideoScenes(scenes, endpoints)).toBeNull();
    expect(buildMusicVideoPlan("노래", authored, 120, 2, 8, scenes).scenes
      .map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds])).toEqual([[2, 4], [4, 6], [6, 8]]);
    expect(validateMusicVideoScenes([{ ...scene("one", null), endMeasureIndex: 8 }],
      getMusicVideoMeasures([instrumental], 120))).toContain("가사");
  });
});

describe("저장된 뮤직비디오 그림 데이터 검증", () => {
  it.each(["still", "draw-on", "fade", "slide", "zoom", "float", "bounce", "pulse", "pop-in", "iris", "curtain",
    "assemble", "sparkle", "confetti", "rotate-in", "flip-in", "diagonal-reveal", "zoom-out", "snow", "spotlight",
    "move-left", "move-right", "move-up", "move-down", "move-up-left", "move-up-right", "move-down-left",
    "move-down-right", "bounce-left", "bounce-right", "auto", "sway"] as const)(
    "%s 모션과 기존 저장 형식을 읽고 영상 계획에 보존한다", (motion) => {
      const authored = { ...scene("preset"), motion };
      const restored = JSON.parse(JSON.stringify(authored));
      expect(isMusicVideoScenes([restored])).toBe(true);
      const plan = buildMusicVideoPlan("노래", measures, 120, 2, 7, [restored]);
      expect(plan.scenes[0].scene.motion).toBe(motion);
      expect(plan.scenes[0].scene.elements).toEqual(authored.elements);
    });

  it("화면 모서리와 필압·선 굵기의 허용 경계를 복원한다", () => {
    expect(isMusicVideoScenes([scene("one")])).toBe(true);
    expect(isMusicVideoScenes([{ ...scene("one"), elements: [{ ...element, width: 1 }] }])).toBe(true);
    expect(isMusicVideoScenes([{ ...scene("one"), elements: [{ ...element, width: 60 }] }])).toBe(true);
    expect(isMusicVideoScenes([])).toBe(true);
    expect(isMusicVideoScenes([{ ...scene("one", null), endMeasureIndex: 63 }])).toBe(true);
  });

  it.each([null, {}, "scene", [null], [42], [{ id: "bad" }]])("불완전한 데이터 %j는 거부한다", (value) => {
    expect(isMusicVideoScenes(value)).toBe(false);
  });

  it.each([
    { background: "red" },
    { background: "#fff" },
    { motion: "unknown" },
    { id: "x".repeat(121) },
    { elements: null },
    { endMeasureIndex: -1 },
    { endMeasureIndex: 64 },
    { endMeasureIndex: 0.5 },
    { endMeasureIndex: null },
    { endMeasureIndex: "0" },
    { endLyric: { measureIndex: -1, noteId: "a" } },
    { endLyric: { measureIndex: 64, noteId: "a" } },
    { endLyric: { measureIndex: 0.5, noteId: "a" } },
    { endLyric: { measureIndex: 0, noteId: "x".repeat(121) } }
  ])("유효하지 않은 장면 속성 %j는 거부한다", (patch) => {
    expect(isMusicVideoScenes([{ ...scene("one"), ...patch }])).toBe(false);
  });

  it.each([
    { id: "x".repeat(121) },
    { tool: "script" },
    { color: "url(https://example.com)" },
    { width: 0 },
    { width: 61 },
    { width: Number.NaN },
    { points: [] },
    { points: [[-1, 0, 0.5]] },
    { points: [[SCENE_WIDTH + 1, 0, 0.5]] },
    { points: [[0, SCENE_HEIGHT + 1, 0.5]] },
    { points: [[0, 0, -0.1]] },
    { points: [[0, 0, 1.1]] },
    { points: [[0, 0, Number.POSITIVE_INFINITY]] },
    { points: [[0, 0]] }
  ])("유효하지 않은 그림 속성 %j는 거부한다", (patch) => {
    expect(isMusicVideoScenes([{ ...scene("one"), elements: [{ ...element, ...patch }] }])).toBe(false);
  });

  it("장면 수와 중복 장면 ID를 제한한다", () => {
    const scenes = Array.from({ length: MAX_SCENES }, (_, index) => scene(`scene-${index}`));
    expect(isMusicVideoScenes(scenes)).toBe(true);
    expect(isMusicVideoScenes([...scenes, scene("extra")])).toBe(false);
    expect(isMusicVideoScenes([scene("same"), scene("same")])).toBe(false);
  });

  it("장면당 그림 수와 선당 점 수를 제한한다", () => {
    const elements = Array.from({ length: MAX_ELEMENTS }, (_, index) => ({ ...element, id: `element-${index}` }));
    expect(isMusicVideoScenes([{ ...scene("one"), elements }])).toBe(true);
    expect(isMusicVideoScenes([{ ...scene("one"), elements: [...elements, element] }])).toBe(false);
    const points: ScenePoint[] = Array.from({ length: MAX_POINTS }, () => [50, 50, 0.5]);
    expect(isMusicVideoScenes([{ ...scene("one"), elements: [{ ...element, points }] }])).toBe(true);
    expect(isMusicVideoScenes([{ ...scene("one"), elements: [{ ...element, points: [...points, points[0]] }] }]))
      .toBe(false);
  });

  it("여러 장면에 나뉜 그림도 전체 점 수 상한을 함께 적용한다", () => {
    const points: ScenePoint[] = Array.from({ length: MAX_POINTS }, () => [50, 50, 0.5]);
    const full = Array.from({ length: MAX_TOTAL_POINTS / MAX_POINTS }, (_, index) => ({
      ...scene(`scene-${index}`), elements: [{ ...element, points }]
    }));
    expect(isMusicVideoScenes(full)).toBe(true);
    expect(isMusicVideoScenes([...full, scene("extra")])).toBe(false);
  });
});
