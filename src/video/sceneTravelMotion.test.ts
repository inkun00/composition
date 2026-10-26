import { describe, expect, it } from "vitest";
import { sampleSceneTravelMotion, type TravelBounds } from "./sceneTravelMotion";

const cases = [
  ["move-left", -1, 0], ["move-right", 1, 0], ["move-up", 0, -1], ["move-down", 0, 1],
  ["move-up-left", -1, -1], ["move-up-right", 1, -1],
  ["move-down-left", -1, 1], ["move-down-right", 1, 1],
  ["bounce-left", -1, 0], ["bounce-right", 1, 0]
] as const;
const ordinary: TravelBounds = { left: 100, right: 700, top: 100, bottom: 400 };

function assertInside(bounds: TravelBounds, pose: NonNullable<ReturnType<typeof sampleSceneTravelMotion>>) {
  const x = (bounds.left + bounds.right) / 2;
  const y = (bounds.top + bounds.bottom) / 2;
  const left = x + (bounds.left - x) * pose.scale + pose.dx;
  const right = x + (bounds.right - x) * pose.scale + pose.dx;
  const top = y + (bounds.top - y) * pose.scale + pose.dy;
  const bottom = y + (bounds.bottom - y) * pose.scale + pose.dy;
  expect(left).toBeGreaterThanOrEqual(-1e-8);
  expect(right).toBeLessThanOrEqual(960 + 1e-8);
  expect(top).toBeGreaterThanOrEqual(-1e-8);
  expect(bottom).toBeLessThanOrEqual(540 + 1e-8);
}

describe("한 방향으로 이동하는 장면 모션", () => {
  it.each(cases)("%s는 지정한 축으로 한 방향 이동하고 장면 동안 그림 크기를 유지한다", (motion, x, y) => {
    const start = sampleSceneTravelMotion(motion, ordinary, 0, 4, 120)!;
    const middle = sampleSceneTravelMotion(motion, ordinary, 2, 4, 120)!;
    const end = sampleSceneTravelMotion(motion, ordinary, 4, 4, 120)!;
    expect(end.dx - start.dx).toBe(x * 56);
    expect(end.dy - start.dy).toBeCloseTo(y * 36);
    expect(middle.dx).toBeCloseTo((start.dx + end.dx) / 2);
    expect(middle.dy).toBeCloseTo((start.dy + end.dy) / 2);
    expect(start.scale).toBe(1);
    expect(middle.scale).toBe(start.scale);
    expect(end.scale).toBe(start.scale);
  });

  it.each(cases)("%s는 화면보다 큰 굵은 그림을 먼저 맞춘 뒤 12% 이하 추가 축소로 이동한다", (motion, x, y) => {
    const full = { left: -30, right: 990, top: -30, bottom: 570 };
    const start = sampleSceneTravelMotion(motion, full, 0, 4, 180)!;
    const end = sampleSceneTravelMotion(motion, full, 4, 4, 180)!;
    const canvasFit = Math.min(1, 956 / (full.right - full.left), 536 / (full.bottom - full.top));
    expect(start.scale / canvasFit).toBeGreaterThanOrEqual(.88);
    expect(start.scale).toBeLessThan(1);
    expect(end.scale).toBe(start.scale);
    if (x) expect(Math.sign(end.dx - start.dx)).toBe(x);
    if (y) expect(Math.sign(end.dy - start.dy)).toBe(y);
    for (let index = 0; index <= 96; index += 1) {
      assertInside(full, sampleSceneTravelMotion(motion, full, index / 24, 4, 180)!);
    }
  });

  it.each(cases)("%s는 도화지 안에 들어가는 그림을 12%보다 많이 줄이지 않는다", (motion) => {
    const full = { left: 0, right: 960, top: 0, bottom: 540 };
    const pose = sampleSceneTravelMotion(motion, full, .6, 4, 180)!;
    expect(pose.scale).toBeGreaterThanOrEqual(.88);
    assertInside(full, pose);
  });

  it.each(cases)("%s는 해당 방향 끝에 붙어 있는 그림도 시작 위치를 보정해 잘리지 않고 움직인다", (motion, x, y) => {
    const edge = { left: 600, right: 960, top: 340, bottom: 540 };
    const start = sampleSceneTravelMotion(motion, edge, 0, 4, 120)!;
    const end = sampleSceneTravelMotion(motion, edge, 4, 4, 120)!;
    expect(start.scale).toBe(1);
    if (x) expect(Math.sign(end.dx - start.dx)).toBe(x);
    if (y) expect(Math.sign(end.dy - start.dy)).toBe(y);
    assertInside(edge, start);
    assertInside(edge, end);
    assertInside(edge, sampleSceneTravelMotion(motion, edge, .25, 4, 120)!);
  });

  it("통통 이동은 BPM 반 박자에서 가장 높고 매 박자 제자리 높이로 돌아온다", () => {
    const ground = sampleSceneTravelMotion("bounce-right", ordinary, 0, 4, 180)!;
    const peak = sampleSceneTravelMotion("bounce-right", ordinary, 1 / 6, 4, 180)!;
    const next = sampleSceneTravelMotion("bounce-right", ordinary, 1 / 3, 4, 180)!;
    expect(peak.dy).toBeCloseTo(ground.dy - 14);
    expect(next.dy).toBeCloseTo(ground.dy);
    expect(peak.dx).toBeGreaterThan(ground.dx);
    expect(next.dx).toBeGreaterThan(peak.dx);
    expect(sampleSceneTravelMotion("bounce-right", ordinary, 1 / 6, 4, 90)!.dy).not.toBeCloseTo(peak.dy);
  });

  it("이동은 재생 이력에 의존하지 않고 장면의 시작과 끝으로 시간을 제한한다", () => {
    const first = sampleSceneTravelMotion("move-up-right", ordinary, .6, 4, 120);
    sampleSceneTravelMotion("move-up-right", ordinary, 1.2, 4, 120);
    expect(sampleSceneTravelMotion("move-up-right", ordinary, .6, 4, 120)).toEqual(first);
    expect(sampleSceneTravelMotion("move-up-right", ordinary, -10, 4, 120))
      .toEqual(sampleSceneTravelMotion("move-up-right", ordinary, 0, 4, 120));
    expect(sampleSceneTravelMotion("move-up-right", ordinary, 100, 4, 120))
      .toEqual(sampleSceneTravelMotion("move-up-right", ordinary, 4, 4, 120));
    expect(sampleSceneTravelMotion("float", ordinary, .6, 4, 120)).toBeNull();
  });
});
