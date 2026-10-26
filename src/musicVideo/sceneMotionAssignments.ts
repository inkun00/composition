import type { MusicVideoScene, SceneMotion } from "../video/musicVideoModel";

export function isAssignedElementMotion(motion: SceneMotion | undefined): motion is Exclude<SceneMotion, "auto" | "still"> {
  return motion !== undefined && motion !== "auto" && motion !== "still";
}

/** Stop only these authored object effects without reviving an inherited motion. */
export function removeAssignedElementMotions(scene: MusicVideoScene, elementIds: readonly string[]): MusicVideoScene {
  if (!elementIds.length) return scene;
  const chosen = new Set(elementIds);
  const inheritedMotion = scene.motion !== "still" && scene.motion !== "auto";
  const needsStaticOverride = inheritedMotion || Boolean(scene.choreography?.actions.length);
  let changed = false;
  const elements = scene.elements.map((element) => {
    if (!chosen.has(element.id)) return element;
    if (!isAssignedElementMotion(element.motion)) {
      if (element.motionGroupId === undefined) return element;
      changed = true;
      const { motionGroupId: _group, ...artwork } = element;
      return artwork;
    }
    changed = true;
    const { motion: _motion, motionGroupId: _group, ...artwork } = element;
    return needsStaticOverride ? { ...artwork, motion: "still" as const } : artwork;
  });
  return changed ? { ...scene, elements } : scene;
}
