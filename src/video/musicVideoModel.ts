import type { NoteEvent } from "../music/types";
import { toNumber } from "../music/rational";
import { buildLyricVideoPlan, type LyricVideoPlan } from "./lyricVideoPlan";
import { getMusicVideoMeasures, type MusicVideoMeasureCue } from "./musicVideoMeasures";
import { isSceneChoreography, type SceneChoreography } from "./sceneActionTypes";
import { validateSceneActionRanges } from "./sceneActionPlan";
import { getSceneMeasureRanges, getSceneRangeIssue } from "./musicVideoSceneRanges";

export { getMusicVideoMeasures, resolveSceneEndMeasure, type MusicVideoMeasureCue } from "./musicVideoMeasures";

export const SCENE_WIDTH = 960;
export const SCENE_HEIGHT = 540;
export const MAX_SCENES = 24;
export const MAX_ELEMENTS = 240;
export const MAX_POINTS = 1200;
export const MAX_TOTAL_POINTS = 24_000;

export type ScenePoint = readonly [number, number, number];
export type DrawingTool = "brush" | "line" | "rectangle" | "ellipse";
export type SceneMotion = "auto" | "bounce" | "sway" | "float" | "pulse" | "still" |
  "draw-on" | "fade" | "slide" | "zoom" | "pop-in" | "iris" | "curtain" | "assemble" | "sparkle" | "confetti" |
  "rotate-in" | "flip-in" | "diagonal-reveal" | "zoom-out" | "snow" | "spotlight" |
  "move-left" | "move-right" | "move-up" | "move-down" | "move-up-left" | "move-up-right" |
  "move-down-left" | "move-down-right" | "bounce-left" | "bounce-right";
export type LyricAnchor = Readonly<{ measureIndex: number; noteId: string }>;
export type SceneElement = Readonly<{
  id: string;
  tool: DrawingTool;
  color: string;
  width: number;
  points: readonly ScenePoint[];
  /** An explicit object motion overrides the scene-wide default without changing its drawing. */
  motion?: SceneMotion;
  /** Objects assigned an effect together share this identity until edited separately. */
  motionGroupId?: string;
}>;
export type MusicVideoScene = Readonly<{
  id: string;
  /** The optional introductory drawing is separate from authored song measures. */
  section?: "intro";
  background: string;
  elements: readonly SceneElement[];
  endLyric: LyricAnchor | null;
  /** Present on newly authored scenes. endLyric remains readable for older saved drawings. */
  endMeasureIndex?: number;
  /** Omitted on older drawings, whose start follows the previous scene's end. */
  startMeasureIndex?: number;
  motion: SceneMotion;
  choreography?: SceneChoreography;
}>;
export type LyricCue = Readonly<{
  key: string;
  anchor: LyricAnchor;
  text: string;
  lineText: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
}>;
export type TimedMusicVideoScene = Readonly<{
  scene: MusicVideoScene;
  startSeconds: number;
  endSeconds: number;
  lyricText: string;
}>;
export type MusicVideoPlan = Readonly<{
  title: string;
  composer?: string;
  bpm: number;
  introSeconds: number;
  lyrics: LyricVideoPlan;
  scenes: readonly TimedMusicVideoScene[];
}>;
type LyricMeasure = Readonly<{ notes: readonly NoteEvent[]; measureIndex?: number }>;

export function isIntroScene(scene: Pick<MusicVideoScene, "section">): boolean {
  return scene.section === "intro";
}

export function anchorKey(anchor: LyricAnchor): string {
  return `${anchor.measureIndex}:${anchor.noteId}`;
}

export function getLyricCues(measures: readonly LyricMeasure[], bpm: number, introSeconds = 0): LyricCue[] {
  let cursor = introSeconds;
  const cues: LyricCue[] = [];
  for (const [index, measure] of measures.entries()) {
    const measureIndex = measure.measureIndex ?? index;
    const lineText = measure.notes.filter((note) => note.pitch !== null).map((note) => note.lyric?.trim() ?? "").join("");
    for (const note of measure.notes) {
      const endSeconds = cursor + Math.max(0, toNumber(note.duration)) * 60 / bpm;
      if (note.pitch !== null && note.lyric?.trim()) {
        const anchor = { measureIndex, noteId: note.id };
        cues.push({ key: anchorKey(anchor), anchor, text: note.lyric.trim(), lineText,
          label: `${measureIndex + 1}마디 · ${lineText} · ‘${note.lyric.trim()}’까지 (${cues.length + 1}번째 가사)`,
          startSeconds: cursor, endSeconds });
      }
      cursor = endSeconds;
    }
  }
  return cues;
}

export function createMusicVideoScene(endLyric: LyricAnchor | null = null,
  endMeasureIndex?: number): MusicVideoScene {
  return { id: crypto.randomUUID(), background: "#ffffff", elements: [], endLyric, motion: "still",
    ...(endMeasureIndex !== undefined ? { endMeasureIndex } : {}) };
}

export function validateMusicVideoScenes(scenes: readonly MusicVideoScene[],
  measures: readonly MusicVideoMeasureCue[], bpm?: number): string | null {
  if (!measures.some((measure) => measure.lyricText)) return "먼저 악보에 가사를 입력해 주세요.";
  if (scenes.length === 0) return "장면을 하나 이상 그려 주세요.";
  const intros = scenes.filter((scene) => scene && isIntroScene(scene));
  if (intros.length > 1) return "전주 장면은 하나만 지정해 주세요.";
  if (intros.length && (!scenes[0] || !isIntroScene(scenes[0]))) return "전주 장면은 첫 번째에 놓아 주세요.";
  if (!isMusicVideoScenes(scenes)) return "그림이 너무 복잡해요. 장면이나 선을 줄여 주세요.";
  if (scenes.every(isIntroScene)) return "본곡 장면을 하나 이상 그려 주세요.";
  const rangeIssue = getSceneRangeIssue(scenes, measures);
  if (rangeIssue) return rangeIssue;
  for (const range of getSceneMeasureRanges(scenes, measures)) {
    const index = range.sceneIndex;
    const scene = scenes[index];
    if (scene.elements.length === 0) return `${index + 1}번 장면에 그림을 그려 주세요.`;
    const actionError = validateSceneActionRanges(scene, measures, bpm, range.startIndex, range.endIndex);
    if (actionError) return `${index + 1}번 장면: ${actionError}`;
  }
  return null;
}

/** @deprecated Use authored measures with validateMusicVideoScenes to include rests and instrumental bars. */
export function validateSceneSequence(scenes: readonly MusicVideoScene[], cues: readonly LyricCue[]): string | null {
  const measures: MusicVideoMeasureCue[] = [];
  for (const cue of cues) {
    const previous = measures.at(-1);
    if (previous?.measureIndex === cue.anchor.measureIndex) {
      measures[measures.length - 1] = { ...previous, endSeconds: cue.endSeconds };
    } else {
      const measureIndex = cue.anchor.measureIndex;
      measures.push({ measureIndex, key: String(measureIndex), label: `${measureIndex + 1}마디 · ${cue.lineText}`,
        lyricText: cue.lineText, startSeconds: cue.startSeconds, endSeconds: cue.endSeconds });
    }
  }
  return validateMusicVideoScenes(scenes, measures);
}

export function buildMusicVideoPlan(title: string, measures: readonly LyricMeasure[], bpm: number,
  introSeconds: number, duration: number, scenes: readonly MusicVideoScene[], composer?: string): MusicVideoPlan {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(introSeconds) || introSeconds < 0 ||
    !Number.isFinite(duration) || duration <= introSeconds) throw new Error("노래의 재생 시간을 확인해 주세요.");
  const cues = getMusicVideoMeasures(measures, bpm, introSeconds);
  if (cues.some((cue) => cue.endSeconds > duration + .001)) throw new Error("노래와 가사 길이가 맞지 않아요. 다시 녹음해 주세요.");
  const error = validateMusicVideoScenes(scenes, cues, bpm);
  if (error) throw new Error(error);
  const ranges = getSceneMeasureRanges(scenes, cues);
  const timed = ranges.map((range, index) => {
    const endSeconds = index === ranges.length - 1 ? duration : cues[range.endIndex].endSeconds;
    return { scene: scenes[range.sceneIndex], startSeconds: cues[range.startIndex].startSeconds, endSeconds,
      lyricText: cues.slice(range.startIndex, range.endIndex + 1).map((cue) => cue.lyricText).join("") };
  });
  const intro = scenes.find(isIntroScene);
  if (intro && introSeconds > 0) timed.unshift({ scene: intro, startSeconds: 0, endSeconds: introSeconds, lyricText: "" });
  return { title: title.trim() || "나의 뮤직비디오", ...(composer === undefined ? {} : { composer: composer.trim() }), bpm, introSeconds,
    lyrics: buildMusicVideoLyricPlan(title, measures, bpm, introSeconds, duration), scenes: timed };
}

/** Keep authored bar IDs for scene actions without changing practice-video and recording frame conventions. */
export function buildMusicVideoLyricPlan(title: string, measures: readonly LyricMeasure[], bpm: number,
  introSeconds: number, duration: number): LyricVideoPlan {
  return withMusicVideoMeasureIndices(buildLyricVideoPlan(title, measures, bpm, introSeconds, duration), measures);
}

/** Apply once to practice/recording frames whose measure IDs still represent array positions. */
export function withMusicVideoMeasureIndices(plan: LyricVideoPlan, measures: readonly LyricMeasure[]): LyricVideoPlan {
  if (measures.every((measure, index) => measure.measureIndex === undefined || measure.measureIndex === index)) return plan;
  return { ...plan, frames: plan.frames.map((frame) => frame.measureIndex === null ? frame :
    { ...frame, measureIndex: measures[frame.measureIndex]?.measureIndex ?? frame.measureIndex }) };
}

const colorPattern = /^#[0-9a-f]{6}$/i;
const motions = ["auto", "bounce", "sway", "float", "pulse", "still", "draw-on", "fade", "slide", "zoom",
  "pop-in", "iris", "curtain", "assemble", "sparkle", "confetti", "rotate-in", "flip-in", "diagonal-reveal",
  "zoom-out", "snow", "spotlight", "move-left", "move-right", "move-up", "move-down", "move-up-left",
  "move-up-right", "move-down-left", "move-down-right", "bounce-left", "bounce-right"];
export function isMusicVideoScenes(value: unknown): value is readonly MusicVideoScene[] {
  if (!Array.isArray(value) || value.length > MAX_SCENES) return false;
  let pointCount = 0;
  const ids = new Set<string>();
  return value.every((scene: MusicVideoScene) => {
    if (!scene || typeof scene.id !== "string" || scene.id.length > 120 || ids.has(scene.id)) return false;
    ids.add(scene.id);
    if (!colorPattern.test(scene.background) || !motions.includes(scene.motion)) return false;
    if (scene.section !== undefined && scene.section !== "intro") return false;
    if (isIntroScene(scene) && (scene.endLyric !== null || scene.endMeasureIndex !== undefined ||
      scene.startMeasureIndex !== undefined)) return false;
    if (scene.endMeasureIndex !== undefined && (!Number.isInteger(scene.endMeasureIndex) ||
      scene.endMeasureIndex < 0 || scene.endMeasureIndex >= 64)) return false;
    if (scene.startMeasureIndex !== undefined && (!Number.isInteger(scene.startMeasureIndex) ||
      scene.startMeasureIndex < 0 || scene.startMeasureIndex >= 64)) return false;
    if (scene.endLyric !== null && (!scene.endLyric || !Number.isInteger(scene.endLyric.measureIndex) ||
      scene.endLyric.measureIndex < 0 || scene.endLyric.measureIndex >= 64 ||
      typeof scene.endLyric.noteId !== "string" || scene.endLyric.noteId.length > 120)) return false;
    if (!Array.isArray(scene.elements) || scene.elements.length > MAX_ELEMENTS) return false;
    const elementIds = new Set<string>();
    const motionGroups = new Map<string, SceneMotion>();
    const validElements = scene.elements.every((element: SceneElement) => {
      if (!element || typeof element.id !== "string" || element.id.length > 120 ||
        elementIds.has(element.id) ||
        !["brush", "line", "rectangle", "ellipse"].includes(element.tool) || !colorPattern.test(element.color) ||
        (element.motion !== undefined && !motions.includes(element.motion)) ||
        !Number.isFinite(element.width) || element.width < 1 || element.width > 60 ||
        !Array.isArray(element.points) || element.points.length === 0 || element.points.length > MAX_POINTS) return false;
      if (element.motionGroupId !== undefined) {
        if (typeof element.motionGroupId !== "string" || !element.motionGroupId.trim() || element.motionGroupId.length > 120 ||
          element.motion === undefined || element.motion === "still" || element.motion === "auto") return false;
        const groupMotion = motionGroups.get(element.motionGroupId);
        if (groupMotion !== undefined && groupMotion !== element.motion) return false;
        motionGroups.set(element.motionGroupId, element.motion);
      }
      elementIds.add(element.id);
      pointCount += element.points.length;
      return pointCount <= MAX_TOTAL_POINTS && element.points.every((point: ScenePoint) =>
        Array.isArray(point) && point.length === 3 && point.every(Number.isFinite) &&
        point[0] >= 0 && point[0] <= SCENE_WIDTH && point[1] >= 0 && point[1] <= SCENE_HEIGHT &&
        point[2] >= 0 && point[2] <= 1);
    });
    return validElements && (scene.choreography === undefined || isSceneChoreography(scene.choreography, scene.elements));
  });
}
