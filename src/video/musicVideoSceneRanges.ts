import type { MusicVideoScene } from "./musicVideoModel";
import { resolveSceneEndMeasure, type MusicVideoMeasureCue } from "./musicVideoMeasures";
import { validateSceneActionRanges } from "./sceneActionPlan";

export type SceneMeasureRange = Readonly<{
  sceneIndex: number;
  sceneId: string;
  /** Positions in the authored measure array, rather than authored measure IDs. */
  startIndex: number;
  endIndex: number;
}>;
export type SceneRangeConflict = Readonly<{
  startIndex: number;
  endIndex: number;
  sceneIndices: readonly number[];
}>;
export type SceneRangeShiftResult = Readonly<{
  scenes: readonly MusicVideoScene[];
  issue?: string;
  status?: string;
}>;

/** Older scenes keep their sequential starts until their timing is edited. */
export function getSceneMeasureRanges(scenes: readonly MusicVideoScene[],
  measures: readonly MusicVideoMeasureCue[]): readonly SceneMeasureRange[] {
  const ranges: SceneMeasureRange[] = [];
  let previousEnd = -1;
  let previousKnown = true;
  for (const [sceneIndex, scene] of scenes.entries()) {
    if (scene.section === "intro") continue;
    const cue = resolveSceneEndMeasure(scene, measures);
    const endIndex = cue ? measures.indexOf(cue) : -1;
    const authoredStart = scene.startMeasureIndex;
    const startIndex = authoredStart === undefined
      ? previousKnown ? previousEnd + 1 : -1
      : measures.findIndex((measure) => measure.measureIndex === authoredStart);
    ranges.push({ sceneIndex, sceneId: scene.id, startIndex, endIndex });
    previousEnd = endIndex;
    previousKnown = endIndex >= 0;
  }
  return ranges;
}

/** Adjacent overlapping bars form one warning, including every participating scene. */
export function findSceneRangeConflicts(scenes: readonly MusicVideoScene[],
  measures: readonly MusicVideoMeasureCue[]): readonly SceneRangeConflict[] {
  const ranges = getSceneMeasureRanges(scenes, measures);
  const conflicts: SceneRangeConflict[] = [];
  for (let index = 0; index < measures.length; index++) {
    const sceneIndices = ranges.filter((range) => range.startIndex >= 0 && range.startIndex <= index &&
      range.endIndex >= index).map((range) => range.sceneIndex);
    if (sceneIndices.length < 2) continue;
    const previous = conflicts.at(-1);
    if (previous && previous.endIndex === index - 1) {
      conflicts[conflicts.length - 1] = { ...previous, endIndex: index,
        sceneIndices: [...new Set([...previous.sceneIndices, ...sceneIndices])] };
    } else conflicts.push({ startIndex: index, endIndex: index, sceneIndices });
  }
  return conflicts;
}

function measureLabel(measures: readonly MusicVideoMeasureCue[], start: number, end = start): string {
  const first = measures[start]?.measureIndex;
  const last = measures[end]?.measureIndex;
  if (first === undefined || last === undefined) return "마디";
  return first === last ? `${first + 1}마디` : `${first + 1}–${last + 1}마디`;
}

/** Conflicting and incomplete timing remains saveable, but cannot produce a video. */
export function getSceneRangeIssue(scenes: readonly MusicVideoScene[],
  measures: readonly MusicVideoMeasureCue[]): string | null {
  const ranges = getSceneMeasureRanges(scenes, measures);
  for (const [position, range] of ranges.entries()) {
    if (range.endIndex < 0) return `${range.sceneIndex + 1}번 장면이 끝나는 마디를 다시 선택해 주세요.`;
    if (range.startIndex < 0) {
      return `${range.sceneIndex + 1}번 장면이 시작하는 마디를 다시 선택해 주세요.`;
    }
    if (range.startIndex > range.endIndex) {
      const previous = ranges[position - 1];
      if (scenes[range.sceneIndex].startMeasureIndex === undefined && previous) {
        return range.endIndex === previous.endIndex
          ? `${range.sceneIndex + 1}번 장면이 앞 장면과 같은 마디에서 끝나요. 뒤의 마디를 다시 선택해 주세요.`
          : `${range.sceneIndex + 1}번 장면은 앞 장면보다 뒤의 마디에서 끝나야 해요.`;
      }
      return `${range.sceneIndex + 1}번 장면의 시작 마디가 끝 마디보다 뒤에 있어요. 구간을 다시 선택해 주세요.`;
    }
    if (range.startIndex >= measures.length) return `${range.sceneIndex + 1}번 장면이 시작하는 마디를 다시 선택해 주세요.`;
  }
  const conflict = findSceneRangeConflicts(scenes, measures)[0];
  if (conflict) {
    return `${measureLabel(measures, conflict.startIndex, conflict.endIndex)}가 장면 ${conflict.sceneIndices.map((index) => index + 1).join(", ")}에 겹쳐요. 구간을 옮기거나 필요 없는 장면을 삭제해 주세요.`;
  }
  let expected = 0;
  for (const range of ranges) {
    if (range.startIndex < expected) return `${range.sceneIndex + 1}번 장면이 앞 장면보다 먼저 시작해요. 장면 순서에 맞게 구간을 옮겨 주세요.`;
    if (range.startIndex > expected) {
      return `${measureLabel(measures, expected, range.startIndex - 1)}에 연결된 장면이 없어요. 이웃 장면의 시작·끝 마디를 이어 주세요.`;
    }
    expected = range.endIndex + 1;
  }
  if (ranges.length && expected !== measures.length) return "마지막 장면은 노래의 마지막 마디까지 지정해 주세요.";
  return null;
}

function freezeSceneStarts(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  ranges: readonly SceneMeasureRange[]): readonly MusicVideoScene[] {
  const byIndex = new Map(ranges.map((range) => [range.sceneIndex, range]));
  return scenes.map((scene, index) => {
    const range = byIndex.get(index);
    const start = range && measures[range.startIndex]?.measureIndex;
    return start === undefined || scene.startMeasureIndex === start ? scene : { ...scene, startMeasureIndex: start };
  });
}

/** Freeze neighbors before an edit, so extending one scene never silently consumes another. */
export function changeSceneRangeBoundary(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  selected: number, boundary: "start" | "end", measureIndex: number): readonly MusicVideoScene[] {
  const chosen = measures.findIndex((measure) => measure.measureIndex === measureIndex);
  const ranges = getSceneMeasureRanges(scenes, measures);
  const range = ranges.find((item) => item.sceneIndex === selected);
  const current = scenes[selected];
  if (chosen < 0 || !current || !range && current.section !== "intro") return scenes;
  const frozen = freezeSceneStarts(scenes, measures, ranges);
  let start = range?.startIndex ?? 0;
  let end = range?.endIndex ?? chosen;
  if (boundary === "start") {
    start = chosen;
    if (end < start) end = start;
  } else {
    end = chosen;
    if (start < 0 || start > end) start = end;
  }
  return frozen.map((scene, index) => {
    if (index !== selected) return scene;
    const { section: _section, ...drawing } = scene;
    return { ...drawing, endLyric: null, startMeasureIndex: measures[start].measureIndex,
      endMeasureIndex: measures[end].measureIndex };
  });
}

/** Keep each drawing and its duration; a song-end overflow rejects the entire proposed move. */
export function shiftSceneRangesForward(scenes: readonly MusicVideoScene[], measures: readonly MusicVideoMeasureCue[],
  bpm?: number): SceneRangeShiftResult {
  const ranges = getSceneMeasureRanges(scenes, measures);
  if (!ranges.length) return { scenes, issue: "먼저 본곡 장면을 추가해 주세요." };
  if (ranges.some((range) => range.startIndex < 0 || range.endIndex < range.startIndex ||
    range.endIndex >= measures.length)) return { scenes, issue: "모든 장면의 시작·끝 마디를 먼저 선택해 주세요." };
  let previousEnd = -1;
  let offset = 0;
  const shifted = ranges.map((range) => {
    const proposedStart = range.startIndex + offset;
    if (proposedStart <= previousEnd) offset += previousEnd + 1 - proposedStart;
    const startIndex = range.startIndex + offset;
    const endIndex = range.endIndex + offset;
    previousEnd = endIndex;
    return { ...range, startIndex, endIndex };
  });
  const overflow = previousEnd - measures.length + 1;
  if (overflow > 0) return { scenes, issue: `뒤로 밀려면 ${overflow}마디가 더 필요해요. 필요 없는 장면을 삭제하거나, 앞 장면의 끝 마디를 당기거나, 노래의 마디를 늘려 주세요.` };
  const moved = shifted.filter((range, index) => range.startIndex !== ranges[index].startIndex);
  if (!moved.length) return { scenes, status: "뒤로 밀어야 할 장면이 없어요. 비어 있는 마디는 시작·끝 마디를 조절해 이어 주세요." };
  for (const range of moved) {
    const issue = validateSceneActionRanges(scenes[range.sceneIndex], measures, bpm, range.startIndex, range.endIndex);
    if (issue) return { scenes, issue: `${range.sceneIndex + 1}번 장면에 원래 마디에 고정된 동작이 있어요. 움직임을 다시 고른 뒤 뒤로 밀어 주세요. ${issue}` };
  }
  const frozen = freezeSceneStarts(scenes, measures, ranges);
  const byIndex = new Map(shifted.map((range) => [range.sceneIndex, range]));
  const next = frozen.map((scene, index) => {
    const range = byIndex.get(index);
    if (!range) return scene;
    return { ...scene, startMeasureIndex: measures[range.startIndex].measureIndex,
      endMeasureIndex: measures[range.endIndex].measureIndex, endLyric: null };
  });
  return { scenes: next, status: `${moved.length}개 장면을 길이와 뒤쪽 간격을 유지하며 뒤로 밀었어요. 실행 취소로 되돌릴 수 있어요.` };
}
