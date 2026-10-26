import { describe, expect, it, vi } from "vitest";
import { ensureSceneVectorEngine } from "./sceneVectorEngine";

const pending = vi.hoisted(() => {
  let release!: () => void;
  return { gate: new Promise<void>((resolve) => { release = resolve; }),
    release: () => release(), setup: vi.fn() };
});
vi.mock("paper", async () => {
  await pending.gate;
  return { default: { setup: pending.setup, Size: class {}, view: { autoUpdate: true } } };
});

describe("벡터 도구의 비동기 준비", () => {
  it("도구 다운로드 대기 중 취소하면 즉시 끝나며 다음 작업은 준비된 도구를 재사용한다", async () => {
    const controller = new AbortController();
    const canceled = ensureSceneVectorEngine(controller.signal);
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    expect(pending.setup).not.toHaveBeenCalled();
    const next = ensureSceneVectorEngine();
    pending.release();
    await expect(next).resolves.toBeUndefined();
    expect(pending.setup).toHaveBeenCalledOnce();
    await expect(ensureSceneVectorEngine()).resolves.toBeUndefined();
    expect(pending.setup).toHaveBeenCalledOnce();
    await expect(ensureSceneVectorEngine(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
