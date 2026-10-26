import type { MusicVideoScene } from "../video/musicVideoModel";
import { createSceneActor, type SceneActor, type SceneChoreography } from "../video/sceneActionTypes";

export function sceneChoreography(scene: MusicVideoScene): SceneChoreography {
  return scene.choreography ?? { version: 1, description: "", actors: [], actions: [] };
}

export function changeSceneActor(scene: MusicVideoScene, actorId: string,
  patch: Partial<Omit<SceneActor, "id">>): MusicVideoScene {
  const choreography = sceneChoreography(scene);
  return { ...scene, choreography: { ...choreography,
    actors: choreography.actors.map((actor) => actor.id === actorId ? { ...actor, ...patch } : actor) } };
}

/** Every line has one owner, so two actions cannot deform the same drawing by accident. */
export function assignActorElements(scene: MusicVideoScene, actorId: string,
  elementIds: readonly string[]): MusicVideoScene {
  const choreography = sceneChoreography(scene);
  const ids = [...new Set(elementIds)].filter((id) => scene.elements.some((element) => element.id === id));
  return { ...scene, choreography: { ...choreography, actors: choreography.actors.map((actor) => {
    if (actor.id !== actorId) return { ...actor, elementIds: actor.elementIds.filter((id) => !ids.includes(id)) };
    if (actor.elementIds.length || !ids.length) return { ...actor, elementIds: ids };
    const initial = createSceneActor(scene.elements.filter((element) => ids.includes(element.id)), actor.name);
    return { ...initial, id: actor.id };
  }) } };
}
