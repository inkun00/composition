import type { SceneElement } from "./musicVideoModel";

export const MAX_SCENE_ACTORS = 12;
export const MAX_SCENE_ACTIONS = 48;
export const SCENE_ACTION_KINDS = [
  "press", "bend", "swing", "jump", "walk", "nod", "flap", "light-on", "light-off", "move", "grow"
] as const;

export type SceneActionKind = typeof SCENE_ACTION_KINDS[number];
export type ActorPoint = readonly [number, number];
export type SceneActor = Readonly<{
  id: string;
  name: string;
  elementIds: readonly string[];
  fixedPoint: ActorPoint;
  movingPoint: ActorPoint;
  endPoint: ActorPoint;
}>;
export type SceneAction = Readonly<{
  id: string;
  actorId: string;
  kind: SceneActionKind;
  startMeasureIndex: number;
  startBeat: number;
  durationBeats: number;
  strength: number;
}>;
export type SceneChoreography = Readonly<{
  version: 1;
  description: string;
  actors: readonly SceneActor[];
  actions: readonly SceneAction[];
}>;

export const SCENE_ACTION_LABELS: Readonly<Record<SceneActionKind, string>> = {
  press: "누르기", bend: "굽히기", swing: "흔들기", jump: "뛰기", walk: "걷기", nod: "끄덕이기",
  flap: "날갯짓", "light-on": "불 켜기", "light-off": "불 끄기", move: "이동하기", grow: "자라기"
};

/** Initial handles are editable; no object recognition or anatomical inference is performed. */
export function createSceneActor(elements: readonly SceneElement[], name = "대상"): SceneActor {
  const points = elements.flatMap((element) => element.points);
  const minX = points.length ? Math.min(...points.map((point) => point[0])) : 400;
  const maxX = points.length ? Math.max(...points.map((point) => point[0])) : 560;
  const minY = points.length ? Math.min(...points.map((point) => point[1])) : 190;
  const maxY = points.length ? Math.max(...points.map((point) => point[1])) : 350;
  const centerX = (minX + maxX) / 2;
  return {
    id: crypto.randomUUID(), name: name.trim().slice(0, 40) || "대상", elementIds: elements.map((element) => element.id),
    fixedPoint: [centerX, maxY], movingPoint: [centerX, minY], endPoint: [Math.min(960, centerX + 30), minY]
  };
}

export function createSceneAction(actorId: string, kind: SceneActionKind,
  startMeasureIndex = 0): SceneAction {
  return { id: crypto.randomUUID(), actorId, kind, startMeasureIndex, startBeat: 0, durationBeats: 2, strength: 1 };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 120;
const validPoint = (value: unknown): value is ActorPoint => Array.isArray(value) && value.length === 2 &&
  value.every(Number.isFinite) && value[0] >= 0 && value[0] <= 960 && value[1] >= 0 && value[1] <= 540;

/** Invalid choreography must invalidate its saved scene, rather than silently losing authored motion. */
export function isSceneChoreography(value: unknown, elements: readonly SceneElement[]): value is SceneChoreography {
  if (!isRecord(value) || value.version !== 1 || typeof value.description !== "string" ||
    value.description.length > 1000 || !Array.isArray(value.actors) || value.actors.length > MAX_SCENE_ACTORS ||
    !Array.isArray(value.actions) || value.actions.length > MAX_SCENE_ACTIONS) return false;
  const elementIds = new Set(elements.map((element) => element.id));
  const assignedIds = new Set<string>();
  const actorIds = new Set<string>();
  for (const actor of value.actors) {
    if (!isRecord(actor) || !validId(actor.id) || actorIds.has(actor.id) || typeof actor.name !== "string" ||
      !actor.name.trim() || actor.name.length > 40 || !Array.isArray(actor.elementIds) ||
      actor.elementIds.length > elements.length || !validPoint(actor.fixedPoint) ||
      !validPoint(actor.movingPoint) || !validPoint(actor.endPoint)) return false;
    actorIds.add(actor.id);
    for (const id of actor.elementIds) {
      if (!validId(id) || !elementIds.has(id) || assignedIds.has(id)) return false;
      assignedIds.add(id);
    }
  }
  const actionIds = new Set<string>();
  for (const action of value.actions) {
    if (!isRecord(action) || !validId(action.id) || actionIds.has(action.id) || !validId(action.actorId) ||
      !actorIds.has(action.actorId) || !SCENE_ACTION_KINDS.includes(action.kind as SceneActionKind) ||
      !Number.isInteger(action.startMeasureIndex) || (action.startMeasureIndex as number) < 0 ||
      (action.startMeasureIndex as number) >= 64 || !Number.isFinite(action.startBeat) ||
      (action.startBeat as number) < 0 || (action.startBeat as number) > 16 ||
      !Number.isFinite(action.durationBeats) || (action.durationBeats as number) <= 0 ||
      (action.durationBeats as number) > 64 || !Number.isFinite(action.strength) ||
      (action.strength as number) < .1 || (action.strength as number) > 2) return false;
    actionIds.add(action.id);
  }
  return true;
}

/** Removing strokes must not leave invalid actor references in the saved drawing. */
export function pruneSceneChoreography(choreography: SceneChoreography | undefined,
  elements: readonly SceneElement[]): SceneChoreography | undefined {
  if (!choreography) return undefined;
  const ids = new Set(elements.map((element) => element.id));
  const actors = choreography.actors.map((actor) => ({ ...actor, elementIds: actor.elementIds.filter((id) => ids.has(id)) }))
    .filter((actor, index) => actor.elementIds.length > 0 || choreography.actors[index].elementIds.length === 0);
  const actorIds = new Set(actors.map((actor) => actor.id));
  return { ...choreography, actors, actions: choreography.actions.filter((action) => actorIds.has(action.actorId)) };
}
