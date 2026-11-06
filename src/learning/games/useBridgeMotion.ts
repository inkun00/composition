import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  BRIDGE_CROSSING_MS, BRIDGE_TILE_MOTION_MS, bridgeCrossingPose, bridgeMistakeOffset,
  bridgeTilePose, type BridgeMotionPose
} from "./bridgeMotion";

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function animate(duration: number, update: (elapsed: number) => void) {
  let frame = 0;
  let cancelled = false;
  const start = performance.now();
  update(0);
  function tick(now: number) {
    if (cancelled) return;
    const elapsed = Math.min(duration, now - start);
    update(elapsed);
    if (elapsed < duration) frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => { cancelled = true; cancelAnimationFrame(frame); };
}

function setPose(element: HTMLElement, pose: BridgeMotionPose, distance = 0, liftScale = 1) {
  element.style.transform = `translate3d(${pose.progress * distance}px, ${-pose.lift * liftScale}px, 0) rotate(${pose.angle}deg) scale(${pose.scaleX}, ${pose.scaleY})`;
}

export function useBridgeTileMotion() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const tile = ref.current;
    if (!tile) return;
    if (reduced) { tile.style.transform = "none"; return; }
    return animate(BRIDGE_TILE_MOTION_MS, (elapsed) => setPose(tile, bridgeTilePose(elapsed)));
  }, [reduced]);
  return ref;
}

export function useBridgeSceneMotion(cleared: boolean, mistakes: number, levelId: string) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const travelerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    const traveler = travelerRef.current;
    if (!scene || !traveler) return;
    let width = scene.clientWidth;
    let elapsed = cleared ? BRIDGE_CROSSING_MS : 0;
    const draw = () => setPose(traveler, cleared ? bridgeCrossingPose(elapsed) : bridgeCrossingPose(0),
      width * .52, Math.min(1, width / 600));
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      width = scene.clientWidth;
      draw();
    }) : null;
    observer?.observe(scene);
    let cancel: (() => void) | undefined;
    if (cleared && !reduced) cancel = animate(BRIDGE_CROSSING_MS, (time) => { elapsed = time; draw(); });
    else draw();
    return () => { cancel?.(); observer?.disconnect(); };
  }, [cleared, levelId, reduced]);

  useMistakeMotion(trackRef, mistakes, levelId, reduced);
  return { sceneRef, travelerRef, trackRef };
}

function useMistakeMotion(ref: RefObject<HTMLDivElement | null>, mistakes: number, levelId: string, reduced: boolean) {
  useLayoutEffect(() => {
    const track = ref.current;
    if (!track) return;
    if (reduced || mistakes === 0) { track.style.transform = "none"; return; }
    return animate(360, (elapsed) => {
      track.style.transform = `translate3d(${bridgeMistakeOffset(elapsed)}px, 0, 0)`;
    });
  }, [mistakes, levelId, reduced, ref]);
}
