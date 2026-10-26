import { createMusicVideoScene, isIntroScene, MAX_SCENES, resolveSceneEndMeasure,
  type MusicVideoMeasureCue, type MusicVideoScene } from "../video/musicVideoModel";
import { validateSceneActionRanges } from "../video/sceneActionPlan";
import { getSceneMeasureRanges } from "../video/musicVideoSceneRanges";

export type SceneSlidePlacement = "before" | "after";
export type SceneSlideEditResult = Readonly<{
  scenes: readonly MusicVideoScene[];
  selected: number;
  issue?: string;
  status?: string;
}>;
type SceneRange = Readonly<{ scene: MusicVideoScene; rawIndex: number; start: number; end: number }>;
type InsertionPlan = Readonly<{
  at: number;
  normalizedIntro: boolean;
}> & (Readonly<{
  kind: "partition";
  boundary: number;
  ends: readonly number[];
  reviewActions?: boolean;
}> | Readonly<{
  kind: "anchored";
  measureIndex: number;
}>);
type PlanResult = Readonly<{ plan?: InsertionPlan; issue?: string }>;

function rangesFor(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  allowUncoveredTail = false): readonly SceneRange[] | null {
  const intros = scenes.filter(isIntroScene);
  if (intros.length > 1 || (intros.length === 1 && !isIntroScene(scenes[0]))) return null;
  const ranges: SceneRange[] = [];
  let previous = -1;
  for (const range of getSceneMeasureRanges(scenes, measures)) {
    const { sceneIndex: rawIndex, startIndex: start, endIndex: end } = range;
    const scene = scenes[rawIndex];
    if (start !== previous + 1 || end < start) return null;
    ranges.push({ scene, rawIndex, start, end });
    previous = end;
  }
  return ranges.length && previous !== measures.length - 1 && !allowUncoveredTail ? null : ranges;
}

function insertionIssue(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  selected: number): string | undefined {
  if (!measures.length) return "노래의 마디를 먼저 만들어 주세요.";
  if (scenes.length >= MAX_SCENES) return `장면은 최대 ${MAX_SCENES}개까지 만들 수 있어요.`;
  if (scenes.length && (!Number.isInteger(selected) || !scenes[selected])) return "장면을 먼저 선택해 주세요.";
  return undefined;
}

/** Keep authored ranges intact while the user resolves any temporary overlap or gap. */
function anchoredPlan(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  selected: number, placement: SceneSlidePlacement): InsertionPlan {
  const normalizedIntro = isIntroScene(scenes[selected]);
  const range = getSceneMeasureRanges(scenes, measures).find((item) => item.sceneIndex === selected);
  const preferred = placement === "before" ? range?.startIndex : range?.endIndex;
  const alternative = placement === "before" ? range?.endIndex : range?.startIndex;
  const measure = measures[preferred ?? -1] ?? measures[alternative ?? -1] ?? measures[0];
  return { kind: "anchored", at: selected + (placement === "after" || normalizedIntro ? 1 : 0),
    measureIndex: measure.measureIndex, normalizedIntro };
}

function freezeKnownStarts(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[]): MusicVideoScene[] {
  const ranges = getSceneMeasureRanges(scenes, measures);
  return scenes.map((scene, index) => {
    if (isIntroScene(scene) || scene.startMeasureIndex !== undefined) return scene;
    const range = ranges.find((item) => item.sceneIndex === index);
    const start = range && measures[range.startIndex];
    return start ? { ...scene, startMeasureIndex: start.measureIndex } : scene;
  });
}

/** Absolute action timings remain authored; an edit must not silently retime or remove them. */
function keepsActionRanges(ranges: readonly SceneRange[], ends: readonly number[], boundary: number,
  measures: readonly MusicVideoMeasureCue[], bpm?: number): boolean {
  return ranges.every((range, index) => {
    const shifted = index < boundary ? index : index + 1;
    const start = shifted === 0 ? 0 : ends[shifted - 1] + 1;
    const end = ends[shifted];
    if (start === range.start && end === range.end) return true;
    return validateSceneActionRanges(range.scene, measures, bpm, start, end) === null;
  });
}

function insertionPlan(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  selected: number, placement: SceneSlidePlacement, bpm?: number): PlanResult {
  const issue = insertionIssue(scenes, measures, selected);
  if (issue) return { issue };
  const ranges = rangesFor(scenes, measures, true);
  if (!ranges) return { plan: anchoredPlan(scenes, measures, selected, placement) };
  if (!ranges.length) return { plan: { kind: "partition", at: scenes.length, boundary: 0,
    ends: [measures.length - 1], normalizedIntro: Boolean(scenes.length) } };
  if (ranges.length >= measures.length) return { plan: anchoredPlan(scenes, measures, selected, placement) };
  const normalizedIntro = isIntroScene(scenes[selected]);
  const selectedNormal = ranges.findIndex((range) => range.rawIndex === selected);
  const boundary = normalizedIntro ? 0 : selectedNormal + (placement === "after" ? 1 : 0);
  const at = boundary < ranges.length ? ranges[boundary].rawIndex : scenes.length;
  if (ranges.at(-1)!.end !== measures.length - 1) {
    if (boundary !== ranges.length) return { plan: anchoredPlan(scenes, measures, selected, placement) };
    return { plan: { kind: "partition", at, boundary,
      ends: [...ranges.map((range) => range.end), measures.length - 1], normalizedIntro } };
  }
  const lengths = ranges.map((range) => range.end - range.start + 1);
  const preferredSide = placement === "before" || normalizedIntro ? "right" : "left";
  const donors = ranges.map((_, index) => index).filter((index) => lengths[index] >= 2)
    .sort((a, b) => {
      const distance = (index: number) => index < boundary ? boundary - index - 1 : index - boundary;
      const side = (index: number) => (index < boundary ? "left" : "right") === preferredSide ? 0 : 1;
      return distance(a) - distance(b) || side(a) - side(b);
    });
  let preferredPlan: InsertionPlan | undefined;
  for (const donor of donors) {
    // An adjacent scene splits evenly. A distant scene lends one bar, shifting intervening boundaries once.
    const adjacent = donor === boundary || donor === boundary - 1;
    const donated = adjacent ? Math.floor(lengths[donor] / 2) : 1;
    const nextLengths = lengths.map((length, index) => index === donor ? length - donated : length);
    nextLengths.splice(boundary, 0, donated);
    let end = -1;
    const ends = nextLengths.map((length) => { end += length; return end; });
    preferredPlan ??= { kind: "partition", at, boundary, ends, normalizedIntro, reviewActions: true };
    if (keepsActionRanges(ranges, ends, boundary, measures, bpm)) {
      return { plan: { kind: "partition", at, boundary, ends, normalizedIntro } };
    }
  }
  return { plan: preferredPlan ?? anchoredPlan(scenes, measures, selected, placement) };
}

export function getSceneSlideInsertionIssue(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  selected: number, _placement: SceneSlidePlacement, _bpm?: number): string | undefined {
  return insertionIssue(scenes, measures, selected);
}

/** Prefer a safe repartition; otherwise insert first and let the user resolve timing warnings. */
export function insertSceneSlide(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  selected: number, placement: SceneSlidePlacement, bpm?: number): SceneSlideEditResult {
  const { plan, issue } = insertionPlan(scenes, measures, selected, placement, bpm);
  if (!plan) return { scenes, selected, issue };
  if (plan.kind === "anchored") {
    const next = freezeKnownStarts(scenes, measures);
    const created = { ...createMusicVideoScene(null, plan.measureIndex), startMeasureIndex: plan.measureIndex };
    next.splice(plan.at, 0, created);
    return { scenes: next, selected: plan.at,
      status: "새 장면을 삽입했어요. 영상 제작 전에 표시된 마디 구간 경고를 해결해 주세요." };
  }
  const next = [...scenes];
  const created = createMusicVideoScene(null, measures[plan.ends[plan.boundary]].measureIndex);
  next.splice(plan.at, 0, created);
  let normalIndex = 0;
  const adjusted = next.map((scene) => {
    if (isIntroScene(scene)) return scene;
    const startIndex = normalIndex === 0 ? 0 : plan.ends[normalIndex - 1] + 1;
    const endMeasureIndex = measures[plan.ends[normalIndex++]].measureIndex;
    const startMeasureIndex = measures[startIndex].measureIndex;
    const hasExplicitStart = scene.startMeasureIndex !== undefined;
    if (resolveSceneEndMeasure(scene, measures)?.measureIndex === endMeasureIndex &&
      (!hasExplicitStart || scene.startMeasureIndex === startMeasureIndex)) return scene;
    return { ...scene, endLyric: null, endMeasureIndex,
      ...(hasExplicitStart ? { startMeasureIndex } : {}) };
  });
  return { scenes: adjusted, selected: plan.at,
    status: plan.reviewActions ? "새 장면을 삽입했어요. 기존 동작은 유지했으니 영상 제작 전에 동작의 마디 구간을 확인해 주세요."
      : plan.normalizedIntro ? "전주 다음에 새 본곡 장면을 삽입했어요. 실행 취소로 되돌릴 수 있어요."
      : "새 장면을 삽입했어요. 실행 취소로 되돌릴 수 있어요." };
}

/** The existing end-of-timeline add action uses the same bar and choreography safeguards. */
export function appendSceneSlide(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  bpm?: number): SceneSlideEditResult {
  return insertSceneSlide(scenes, measures, Math.max(0, scenes.length - 1), "after", bpm);
}

export function getSceneSlideDeletionIssue(scenes: readonly MusicVideoScene[], _measures: readonly MusicVideoMeasureCue[],
  selected: number, _bpm?: number): string | undefined {
  const scene = scenes[selected];
  if (!Number.isInteger(selected) || !scene) return "장면을 먼저 선택해 주세요.";
  if (isIntroScene(scene)) return undefined;
  if (scenes.filter((item) => !isIntroScene(item)).length <= 1) return "본곡 장면은 하나 이상 남겨 주세요.";
  return undefined;
}

/** A middle removal extends the next scene backwards; a tail removal extends its predecessor. */
export function deleteSceneSlide(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  selected: number, bpm?: number): SceneSlideEditResult {
  const issue = getSceneSlideDeletionIssue(scenes, measures, selected, bpm);
  if (issue) return { scenes, selected, issue };
  const removed = scenes[selected];
  const next = scenes.filter((_, index) => index !== selected);
  if (!isIntroScene(removed)) {
    const followingIndex = next.findIndex((scene, index) => index >= selected && !isIntroScene(scene));
    if (followingIndex >= 0) {
      const following = next[followingIndex];
      const previous = next.slice(0, followingIndex).filter((scene) => !isIntroScene(scene)).at(-1);
      const previousEnd = previous ? resolveSceneEndMeasure(previous, measures) : null;
      const start = measures[previousEnd ? measures.indexOf(previousEnd) + 1 : 0];
      if (start && following.startMeasureIndex !== undefined && following.startMeasureIndex > start.measureIndex) {
        next[followingIndex] = { ...following, startMeasureIndex: start.measureIndex };
      }
    }
  }
  const wasLastNormal = !isIntroScene(removed) && !scenes.slice(selected + 1).some((scene) => !isIntroScene(scene));
  if (wasLastNormal) {
    const end = measures.at(-1);
    for (let previousIndex = next.length - 1; previousIndex >= 0; previousIndex--) {
      const previous = next[previousIndex];
      if (isIntroScene(previous)) continue;
      if (end && resolveSceneEndMeasure(previous, measures) !== end) {
        next[previousIndex] = { ...previous, endLyric: null, endMeasureIndex: end.measureIndex };
      }
      break;
    }
  }
  return { scenes: next, selected: Math.max(0, Math.min(selected, next.length - 1)),
    status: isIntroScene(removed) ? "전주 장면을 삭제했어요. 실행 취소로 되돌릴 수 있어요."
      : "장면을 삭제하고 이웃 장면에 마디 구간을 이어 주었어요. 실행 취소로 되돌릴 수 있어요." };
}
