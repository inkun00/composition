import type { MusicVideoScene, SceneMotion } from "../video/musicVideoModel";
import { getSceneMotionLabel, SCENE_MOTION_PRESETS } from "./sceneMotionPresets";
import type { SceneMotionScope } from "./sceneSelection";
import { isAssignedElementMotion } from "./sceneMotionAssignments";

function newMotionGroupId(scene: MusicVideoScene): string {
  const occupied = new Set(scene.elements.flatMap((element) => [element.id, element.motionGroupId]));
  const base = `motion-group:${crypto.randomUUID()}`;
  let id = base;
  for (let suffix = 1; occupied.has(id); suffix += 1) id = `${base}:${suffix}`;
  return id;
}

function assignedGroupId(scene: MusicVideoScene, motion: SceneMotion, selected: ReadonlySet<string>): string {
  const chosen = scene.elements.filter((element) => selected.has(element.id));
  const current = chosen[0].motionGroupId;
  const sameGroup = current !== undefined && chosen.every((element) =>
    element.motionGroupId === current && element.motion === motion);
  const wholeGroup = sameGroup && scene.elements.every((element) =>
    element.motionGroupId !== current || selected.has(element.id));
  return wholeGroup ? current : newMotionGroupId(scene);
}

export function getScopedSceneMotion(scene: MusicVideoScene, scope: SceneMotionScope, selectedIds: readonly string[]) {
  const hasObjectMotion = scene.elements.some((element) => element.motion !== undefined);
  const legacy = !hasObjectMotion && Boolean(scene.choreography?.actions.length);
  if (scope === "whole") {
    const custom = legacy || hasObjectMotion || scene.motion === "sway";
    return { motion: custom ? undefined : scene.motion === "auto" ? "still" : scene.motion,
      label: getSceneMotionLabel(scene), legacy: legacy || scene.motion === "sway", empty: false };
  }
  const chosen = scene.elements.filter((element) => selectedIds.includes(element.id));
  if (!chosen.length) return { motion: undefined, label: "선택한 개체 없음", legacy: false, empty: true };
  if (legacy) return { motion: undefined, label: "이전 움직임", legacy: true, empty: false };
  const motions = new Set(chosen.map((element) => {
    const motion = element.motion ?? scene.motion;
    return motion === "auto" ? "still" : motion;
  }));
  if (motions.size > 1) return { motion: undefined, label: "서로 다른 움직임", legacy: false, empty: false };
  const motion = [...motions][0];
  return { motion: motion === "sway" ? undefined : motion,
    label: SCENE_MOTION_PRESETS.find((preset) => preset.id === motion)?.label ?? "살랑살랑",
    legacy: motion === "sway", empty: false };
}

/** A blank selection never falls back to applying an effect to the whole drawing. */
export function applyScopedSceneMotion(scene: MusicVideoScene, motion: SceneMotion,
  scope: SceneMotionScope, selectedIds: readonly string[]): MusicVideoScene | null {
  const selected = new Set(selectedIds);
  if (scope === "selection" && !scene.elements.some((element) => selected.has(element.id))) return null;
  const motionGroupId = scope === "selection" && isAssignedElementMotion(motion)
    ? assignedGroupId(scene, motion, selected) : undefined;
  const elements = scene.elements.map((element) => {
    if (scope === "selection") {
      if (!selected.has(element.id) || (element.motion === motion && element.motionGroupId === motionGroupId)) return element;
      const { motionGroupId: _group, ...drawing } = element;
      return motionGroupId === undefined ? { ...drawing, motion } : { ...drawing, motion, motionGroupId };
    }
    if (element.motion === undefined && element.motionGroupId === undefined) return element;
    const { motion: _motion, motionGroupId: _group, ...drawing } = element;
    return drawing;
  });
  const sceneMotion = scope === "selection" ? "still" : motion;
  const changed = scene.motion !== sceneMotion || scene.choreography !== undefined ||
    elements.some((element, index) => element !== scene.elements[index]);
  return changed ? { ...scene, motion: sceneMotion, choreography: undefined, elements } : scene;
}
