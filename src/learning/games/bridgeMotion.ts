export type BridgeMotionPose = {
  progress: number;
  lift: number;
  angle: number;
  scaleX: number;
  scaleY: number;
};

export const BRIDGE_TILE_MOTION_MS = 760;
export const BRIDGE_CROSSING_MS = 1860;

const restingPose: BridgeMotionPose = { progress: 0, lift: 0, angle: 0, scaleX: 1, scaleY: 1 };

/** A gravity drop followed by two progressively smaller rebounds. */
export function bridgeTilePose(elapsedMs: number): BridgeMotionPose {
  if (elapsedMs >= BRIDGE_TILE_MOTION_MS) return { ...restingPose };
  const gravity = 1500;
  const height = 72;
  const fallTime = Math.sqrt(2 * height / gravity);
  const time = Math.max(0, elapsedMs) / 1000;
  if (time < fallTime) {
    return { ...restingPose, lift: height - gravity * time * time / 2,
      angle: -5 * (1 - time / fallTime) };
  }
  let flightTime = time - fallTime;
  let velocity = gravity * fallTime * .28;
  let lift = 0;
  for (let bounce = 0; bounce < 2; bounce += 1) {
    const duration = 2 * velocity / gravity;
    if (flightTime < duration) {
      lift = velocity * flightTime - gravity * flightTime * flightTime / 2;
      break;
    }
    flightTime -= duration;
    velocity *= .28;
  }
  const impactTime = time - fallTime;
  const compression = .1 * Math.exp(-impactTime * 13) * Math.cos(impactTime * 35);
  return { ...restingPose, lift: Math.max(0, lift), scaleX: 1 + compression,
    scaleY: 1 - compression };
}

/** Four ballistic hops, with acceleration and braking along the bridge. */
export function bridgeCrossingPose(elapsedMs: number): BridgeMotionPose {
  const time = Math.max(0, elapsedMs);
  if (time >= BRIDGE_CROSSING_MS) return { ...restingPose, progress: 1 };
  const launchMs = 100;
  const travelMs = 1480;
  if (time < launchMs) {
    const compression = Math.sin(time / launchMs * Math.PI) * .12;
    return { ...restingPose, scaleX: 1 + compression, scaleY: 1 - compression };
  }
  if (time >= launchMs + travelMs) {
    const landing = (time - launchMs - travelMs) / (BRIDGE_CROSSING_MS - launchMs - travelMs);
    const compression = .13 * Math.exp(-landing * 5) * Math.cos(landing * Math.PI * 3);
    return { ...restingPose, progress: 1, scaleX: 1 + compression, scaleY: 1 - compression };
  }
  const travel = (time - launchMs) / travelMs;
  const hop = travel * 4;
  const phase = hop - Math.floor(hop);
  const height = [24, 37, 37, 24][Math.floor(hop)];
  const contact = phase < .12 ? .09 * (1 - phase / .12) : 0;
  return {
    progress: travel * travel * (3 - 2 * travel),
    lift: 4 * height * phase * (1 - phase),
    angle: -7 * Math.sin(phase * Math.PI * 2),
    scaleX: 1 + contact,
    scaleY: 1 - contact
  };
}

export function bridgeMistakeOffset(elapsedMs: number): number {
  const time = Math.max(0, elapsedMs) / 360;
  return time >= 1 ? 0 : Math.sin(time * Math.PI * 6) * 5 * (1 - time) ** 2;
}
