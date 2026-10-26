import type { PlaybackMeasure } from "../audio/accompanimentScore";
import type { Meter } from "../music/meter";
import { toNumber } from "../music/rational";
import { getMusicVideoMeasures, isIntroScene, resolveSceneEndMeasure, type MusicVideoScene, type SceneMotion } from "../video/musicVideoModel";
import { normalizeSceneBpm } from "../video/sceneMotionClock";
import { analyzeAutoMotionMusic, type AutoMotionMusic } from "./autoMotionMusic";
import { applyScopedSceneMotion } from "./sceneMotionScope";
import { getSceneMeasureRanges, getSceneRangeIssue } from "../video/musicVideoSceneRanges";

export type AutoSceneMotionAssignment = Readonly<{
  sceneId: string;
  motion: SceneMotion;
  reason: string;
}>;

export type AutoSceneMotionPlan = Readonly<{
  scenes: readonly MusicVideoScene[];
  assignments: readonly AutoSceneMotionAssignment[];
  skippedEmpty: number;
  issue: string | null;
}>;

type Options = Readonly<{
  scenes: readonly MusicVideoScene[];
  measures: readonly PlaybackMeasure[];
  bpm: number;
  meter?: Meter;
}>;

type MotionChoice = Readonly<{
  candidates: readonly SceneMotion[];
  reason: string;
}>;

function chooseMusicMotion(music: AutoMotionMusic, bpm: number): MotionChoice {
  if (music.voicedBeats === 0) {
    return { candidates: ["fade", "curtain"], reason: "쉼표 구간 · 소리가 쉬는 동안 부드럽게 나타나요." };
  }
  if (music.restRatio >= .5) {
    return { candidates: ["fade", "iris"], reason: "쉼표가 많은 가락 · 여유 있는 전환으로 음악의 빈 공간을 살려요." };
  }
  const direction = music.pitchTravel ? music.pitchChange / music.pitchTravel : 0;
  if (music.pitchChange >= 3 && direction >= .65) {
    return { candidates: ["move-up", "move-up-right"], reason: "상행 가락 · 음이 높아지는 흐름에 맞춰 위로 이동해요." };
  }
  if (music.pitchChange <= -3 && direction <= -.65) {
    return { candidates: ["move-down", "move-down-right"], reason: "하행 가락 · 음이 낮아지는 흐름에 맞춰 아래로 이동해요." };
  }
  if (music.pitchIntervals >= 2 && music.leapRatio >= .5) {
    return { candidates: ["bounce", "pulse"], reason: "도약이 큰 가락 · 높낮이의 변화를 박자에 맞춘 탄력 있는 움직임으로 표현해요." };
  }
  if (music.attackDensity >= 1.5 || music.attacksPerSecond >= 2.6) {
    return { candidates: ["pulse", "bounce"], reason: "빠르고 촘촘한 리듬 · 음이 시작되는 밀도에 어울리는 박자 움직임을 더해요." };
  }
  if (music.meanHeldBeats >= 1.75 || music.attacks === 0) {
    return music.longestHeldSeconds >= 1.5 || bpm < 100
      ? { candidates: ["float", "zoom"], reason: "길게 이어지는 음 · 느긋하게 흐르는 소리에 부드러운 움직임을 더해요." }
      : { candidates: ["zoom", "float"], reason: "길게 이어지는 음 · 음을 유지하는 동안 차분한 움직임으로 흐름을 살려요." };
  }
  if (music.restRatio >= .25) {
    return { candidates: ["pop-in", "fade"], reason: "음과 쉼이 교차하는 리듬 · 짧은 등장으로 소리가 시작되는 느낌을 살려요." };
  }
  if (music.alignedAttackRatio < .5) {
    return { candidates: ["pulse", "bounce"], reason: "박 사이를 채우는 리듬 · 규칙적인 박자 움직임으로 리듬의 대비를 살려요." };
  }
  if (music.pitchIntervals >= 2 && music.stepRatio >= .7) {
    return { candidates: ["float", "zoom"], reason: "부드러운 순차 가락 · 가까운 음으로 이어지는 선율을 유연하게 표현해요." };
  }
  if (bpm <= 84) {
    return { candidates: ["float", "zoom"], reason: "느린 박자 · 여유 있는 음악 속도에 맞춰 부드럽게 움직여요." };
  }
  return { candidates: ["bounce", "pulse"], reason: "규칙적인 박자 · 반복되는 음의 흐름을 박자에 맞춘 움직임으로 표현해요." };
}

function scoreIssue(measures: readonly PlaybackMeasure[]): string | null {
  if (!measures.length) return "모션을 맞출 악보가 없어요. 먼저 리듬이나 가락을 만들어 주세요.";
  let previousIndex = -1;
  for (const [index, measure] of measures.entries()) {
    const measureIndex = measure.measureIndex ?? index;
    if (!Number.isInteger(measureIndex) || measureIndex <= previousIndex) {
      return "악보의 마디 순서가 맞지 않아요. 마디 구성을 확인해 주세요.";
    }
    previousIndex = measureIndex;
    if (!measure.notes.length || measure.notes.some((note) => {
      const duration = toNumber(note.duration);
      return !Number.isFinite(duration) || duration <= 0 ||
        note.pitch !== null && (!Number.isFinite(note.pitch) || note.pitch < 0 || note.pitch > 127);
    })) return `${measureIndex + 1}마디의 음표 길이와 음높이를 확인해 주세요.`;
  }
  return null;
}

/** Analyze the entire score first; an invalid scene range never produces a partial application. */
export function createAutoSceneMotionPlan({ scenes, measures, bpm, meter }: Options): AutoSceneMotionPlan {
  const skippedEmpty = scenes.filter((scene) => scene.elements.length === 0).length;
  const unchanged = (issue: string | null): AutoSceneMotionPlan => ({ scenes, assignments: [], skippedEmpty, issue });
  const invalidScore = scoreIssue(measures);
  if (invalidScore) return unchanged(invalidScore);
  if (!scenes.length) return unchanged("먼저 장면을 추가하고 그림을 그려 주세요.");
  const normalizedBpm = normalizeSceneBpm(bpm);
  const cues = getMusicVideoMeasures(measures, normalizedBpm);
  if (cues.some((cue) => !Number.isFinite(cue.endSeconds) || cue.endSeconds <= cue.startSeconds)) {
    return unchanged("음악의 재생 길이를 확인해 주세요. 박자와 음표 길이를 다시 정해 주세요.");
  }
  const rangeIssue = getSceneRangeIssue(scenes, cues);
  if (rangeIssue && scenes.some((scene) => scene.startMeasureIndex !== undefined)) return unchanged(rangeIssue);
  const authoredRanges = getSceneMeasureRanges(scenes, cues);
  const ranges: Array<Readonly<{ first: number; last: number }> | null> = [];
  let previous = -1;
  for (const [index, scene] of scenes.entries()) {
    if (isIntroScene(scene)) {
      if (index !== 0) return unchanged("전주 장면은 맨 앞에 하나만 넣을 수 있어요.");
      ranges.push(null);
      continue;
    }
    const end = resolveSceneEndMeasure(scene, cues);
    const last = end ? cues.indexOf(end) : -1;
    if (last < 0) return unchanged(`${index + 1}번 장면의 마지막 마디를 먼저 정해 주세요.`);
    if (last <= previous) return unchanged(`${index + 1}번 장면은 앞 장면보다 뒤의 마디에서 끝나야 해요.`);
    const first = authoredRanges.find((range) => range.sceneIndex === index)?.startIndex ?? previous + 1;
    ranges.push({ first, last });
    previous = last;
  }
  if (previous !== cues.length - 1) return unchanged("마지막 장면을 노래의 마지막 마디까지 지정해 주세요.");

  const assignments: AutoSceneMotionAssignment[] = [];
  let previousMotion: SceneMotion | undefined;
  const applied = scenes.map((scene, index) => {
    if (!scene.elements.length) return scene;
    const range = ranges[index];
    if (!range) {
      assignments.push({ sceneId: scene.id, motion: "fade", reason: "전주 · 반주에 맞춰 그림이 부드럽게 나타나요." });
      return applyScopedSceneMotion(scene, "fade", "whole", [])!;
    }
    const music = analyzeAutoMotionMusic(measures, range.first, range.last, normalizedBpm, meter);
    const choice = chooseMusicMotion(music, normalizedBpm);
    const motion = choice.candidates.find((candidate) => candidate !== previousMotion) ?? choice.candidates[0];
    const variation = motion !== choice.candidates[0] ? " 앞 장면과 다른 움직임으로 변화를 줬어요." : "";
    assignments.push({ sceneId: scene.id, motion, reason: choice.reason + variation });
    previousMotion = motion;
    return applyScopedSceneMotion(scene, motion, "whole", [])!;
  });
  const changed = applied.some((scene, index) => scene !== scenes[index]);
  return { scenes: changed ? applied : scenes, assignments, skippedEmpty, issue: null };
}
