import type { DrawingTool, MusicVideoScene, SceneElement, SceneMotion } from "../video/musicVideoModel";
import { isAssignedElementMotion } from "./sceneMotionAssignments";

export type AssignedMotionGroup = Readonly<{
  id: string;
  elements: readonly SceneElement[];
  motion: Exclude<SceneMotion, "auto" | "still">;
  name: string;
}>;

type Bucket = {
  groupId: string | undefined;
  elements: SceneElement[];
  firstIndex: number;
  motion: AssignedMotionGroup["motion"];
};

const TOOL_NAMES: Record<DrawingTool, string> = {
  brush: "붓", line: "직선", rectangle: "네모", ellipse: "동그라미"
};

/** Preserve authored application units; older unmarked effects share a motion bucket. */
export function getAssignedMotionGroups(scene: MusicVideoScene): readonly AssignedMotionGroup[] {
  const buckets = new Map<string, Bucket>();
  for (const [index, element] of scene.elements.entries()) {
    if (!isAssignedElementMotion(element.motion)) continue;
    const key = JSON.stringify([element.motionGroupId === undefined ? "legacy" : "explicit",
      element.motionGroupId ?? null, element.motion]);
    const previous = buckets.get(key);
    if (previous) previous.elements.push(element);
    else buckets.set(key, { groupId: element.motionGroupId, motion: element.motion,
      elements: [element], firstIndex: index });
  }

  const explicitIds = new Set([...buckets.values()].flatMap((bucket) => bucket.groupId === undefined ? [] : [bucket.groupId]));
  const usedIds = new Set<string>();
  let groupNumber = 0;
  return [...buckets.values()].map((bucket) => {
    const multiple = bucket.elements.length > 1;
    const candidate = bucket.groupId ?? (multiple ? `legacy:${bucket.motion}` : bucket.elements[0].id);
    let id = candidate;
    for (let suffix = 1; usedIds.has(id) ||
      ((bucket.groupId === undefined || id !== candidate) && explicitIds.has(id)); suffix += 1) {
      id = `${candidate}:${suffix}`;
    }
    usedIds.add(id);
    const name = multiple ? `그룹 ${++groupNumber} · 개체 ${bucket.elements.length}개`
      : `${TOOL_NAMES[bucket.elements[0].tool]} ${bucket.firstIndex + 1}`;
    return { id, elements: bucket.elements, motion: bucket.motion, name };
  });
}
