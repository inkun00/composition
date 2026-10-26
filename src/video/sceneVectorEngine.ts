import type paper from "paper";
import type { SceneElement } from "./musicVideoModel";
import { elementPath } from "./sceneDrawing";
import { deformActorPoint, type ActionPose } from "./sceneActionPose";
import type { SceneActor } from "./sceneActionTypes";

type VectorLibrary = typeof paper;
type Geometry = { rest: paper.Path; working: paper.Path; targets: Map<string, paper.Path> };
let vector: VectorLibrary | undefined;
let loading: Promise<void> | undefined;
const geometryCache = new WeakMap<SceneActor, WeakMap<SceneElement, Geometry>>();

/** Load the browser vector engine only when authored actions need it, including before export. */
export function ensureSceneVectorEngine(signal?: AbortSignal): Promise<void> {
  const aborted = () => new DOMException("움직임 도구 준비를 멈췄어요.", "AbortError");
  if (signal?.aborted) return Promise.reject(aborted());
  if (vector) return Promise.resolve();
  if (!loading) loading = import("paper").then((module) => {
    const library = module.default;
    library.setup(new library.Size(960, 540));
    library.view.autoUpdate = false;
    vector = library;
  }).catch((error) => { loading = undefined; throw error; });
  if (!signal) return loading;
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { signal.removeEventListener("abort", cancel); reject(aborted()); };
    signal.addEventListener("abort", cancel, { once: true });
    loading!.then(() => { signal.removeEventListener("abort", cancel); resolve(); },
      (error) => { signal.removeEventListener("abort", cancel); reject(error); });
  });
}

function geometry(actor: SceneActor, element: SceneElement): Geometry {
  let elements = geometryCache.get(actor);
  if (!elements) { elements = new WeakMap(); geometryCache.set(actor, elements); }
  let value = elements.get(element);
  if (!value) {
    const original = new vector!.Path({ pathData: elementPath(element), insert: false });
    // Sample long straight edges too, so a finger drawn as one line can bend locally.
    const count = Math.max(2, Math.min(600, Math.ceil(original.length / 3)));
    const points: paper.Point[] = [];
    for (let i = 0; i <= count; i++) {
      const p = original.getPointAt(original.length * i / count);
      if (p) points.push(p);
    }
    const rest = new vector!.Path({ segments: points, closed: original.closed, insert: false });
    original.remove();
    value = { rest, working: rest.clone({ insert: false }), targets: new Map() };
    elements.set(element, value);
  }
  return value;
}

export function actorPath(element: SceneElement, actor: SceneActor, poses: readonly ActionPose[]): string {
  if (!vector || poses.length === 0) return elementPath(element);
  const { rest, working, targets } = geometry(actor, element);
  poses.forEach(({ action, amount }, index) => {
    const key = `${action.kind}:${action.strength}`;
    let target = targets.get(key);
    if (!target) {
      target = rest.clone({ insert: false });
      target.segments.forEach((segment) => {
        const [x, y] = deformActorPoint([segment.point.x, segment.point.y], actor, action);
        segment.point.set(x, y);
      });
      targets.set(key, target);
    }
    if (index === 0) working.interpolate(rest, target, amount);
    else working.segments.forEach((segment, segmentIndex) => {
      const origin = rest.segments[segmentIndex].point;
      const end = target!.segments[segmentIndex].point;
      segment.point.x += (end.x - origin.x) * amount;
      segment.point.y += (end.y - origin.y) * amount;
    });
  });
  return working.pathData;
}
