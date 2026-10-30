import { describe, expect, it, vi } from "vitest";
import { KaraokeStemCache } from "./karaokeStemCache";

function audio(bytes = 16): AudioBuffer {
  return { length: bytes / 4, numberOfChannels: 1 } as AudioBuffer;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("준비된 반주와 가락의 메모리 캐시", () => {
  it("같은 키는 새 렌더링 없이 같은 오디오 버퍼를 재사용한다", async () => {
    const cache = new KaraokeStemCache(64);
    const buffer = audio();
    const render = vi.fn(async () => buffer);
    expect(await cache.load("song", "backing", render)).toBe(buffer);
    expect(await cache.load("song", "backing", render)).toBe(buffer);
    expect(render).toHaveBeenCalledOnce();
    expect(cache.stats).toEqual({ bytes: 16, entries: 1, pending: 0 });
  });

  it("준비 중인 같은 키도 한 번만 만들고 각 요청에 전달한다", async () => {
    const cache = new KaraokeStemCache(64);
    const next = deferred<AudioBuffer>();
    const render = vi.fn(() => next.promise);
    const first = cache.load("song", "backing", render);
    const second = cache.load("song", "backing", render);
    await Promise.resolve();
    expect(render).toHaveBeenCalledOnce();
    const buffer = audio();
    next.resolve(buffer);
    expect(await first).toBe(buffer);
    expect(await second).toBe(buffer);
    expect(cache.stats.pending).toBe(0);
  });

  it("한 요청을 취소해도 기다리는 다른 요청의 반주는 취소하지 않는다", async () => {
    const cache = new KaraokeStemCache(64);
    const next = deferred<AudioBuffer>();
    const controller = new AbortController();
    let rendererSignal: AbortSignal | undefined;
    const render = (signal: AbortSignal) => {
      rendererSignal = signal;
      return next.promise;
    };
    const first = cache.load("song", "backing", render, controller.signal);
    const second = cache.load("song", "backing", render);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(rendererSignal?.aborted).toBe(false);
    const buffer = audio();
    next.resolve(buffer);
    expect(await second).toBe(buffer);
    expect(cache.stats.entries).toBe(1);
  });

  it("마지막 요청이 취소되면 렌더링을 중단하고 늦은 결과는 보관하지 않는다", async () => {
    const cache = new KaraokeStemCache(64);
    const next = deferred<AudioBuffer>();
    const controller = new AbortController();
    let rendererSignal: AbortSignal | undefined;
    const pending = cache.load("song", "backing", (signal) => {
      rendererSignal = signal;
      return next.promise;
    }, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await rejected;
    expect(rendererSignal?.aborted).toBe(true);
    expect(cache.stats).toEqual({ bytes: 0, entries: 0, pending: 0 });
    next.resolve(audio());
    await next.promise;
    await Promise.resolve();
    expect(cache.stats.entries).toBe(0);
  });

  it("취소된 준비가 아직 끝나지 않아도 같은 키로 즉시 다시 준비할 수 있다", async () => {
    const cache = new KaraokeStemCache(64);
    const old = deferred<AudioBuffer>();
    const controller = new AbortController();
    const first = cache.load("song", "backing", () => old.promise, controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await rejected;
    const fresh = audio(24);
    expect(await cache.load("song", "backing", async () => fresh)).toBe(fresh);
    old.resolve(audio(16));
    await old.promise;
    await Promise.resolve();
    expect(await cache.load("song", "backing", async () => audio(32))).toBe(fresh);
    expect(cache.stats.bytes).toBe(24);
  });

  it("실패한 결과는 저장하지 않고 다음 요청에서 다시 시도한다", async () => {
    const cache = new KaraokeStemCache(64);
    const error = new Error("sample unavailable");
    await expect(cache.load("song", "backing", async () => { throw error; })).rejects.toBe(error);
    const fresh = audio();
    expect(await cache.load("song", "backing", async () => fresh)).toBe(fresh);
    expect(cache.stats.pending).toBe(0);
  });

  it("메모리 한도보다 큰 반주는 반환하되 기존 캐시를 지우거나 보관하지 않는다", async () => {
    const cache = new KaraokeStemCache(32);
    const retained = audio(16);
    await cache.load("small", "backing", async () => retained);
    const render = vi.fn(async () => audio(64));
    await cache.load("large", "backing", render);
    await cache.load("large", "backing", render);
    expect(render).toHaveBeenCalledTimes(2);
    expect(cache.stats).toEqual({ bytes: 16, entries: 1, pending: 0 });
    expect(await cache.load("small", "backing", async () => audio())).toBe(retained);
  });

  it("스테레오 채널과 float 샘플의 실제 바이트 수로 메모리 한도를 계산한다", async () => {
    const cache = new KaraokeStemCache(64);
    const stereo = () => ({ length: 8, numberOfChannels: 2 }) as AudioBuffer;
    await cache.load("first", "backing", async () => stereo());
    await cache.load("second", "backing", async () => stereo());
    expect(cache.stats).toEqual({ bytes: 64, entries: 1, pending: 0 });
  });

  it("가락을 저장하려고 비싼 반주를 밀어내지 않는다", async () => {
    const cache = new KaraokeStemCache(64);
    const backing = audio(48);
    await cache.load("backing", "backing", async () => backing);
    const guide = vi.fn(async () => audio(32));
    await cache.load("guide", "guide", guide);
    await cache.load("guide", "guide", guide);
    expect(guide).toHaveBeenCalledTimes(2);
    expect(await cache.load("backing", "backing", async () => audio())).toBe(backing);
    expect(cache.stats.bytes).toBe(48);
  });

  it("새 반주는 오래된 가락을 먼저 지우고 최근 반주는 재사용한다", async () => {
    const cache = new KaraokeStemCache(64);
    const backing = audio(32);
    await cache.load("backing", "backing", async () => backing);
    await cache.load("old-guide", "guide", async () => audio(16));
    await cache.load("new-guide", "guide", async () => audio(16));
    await cache.load("next-backing", "backing", async () => audio(32));
    expect(cache.stats).toEqual({ bytes: 64, entries: 2, pending: 0 });
    expect(await cache.load("backing", "backing", async () => audio())).toBe(backing);
    const render = vi.fn(async () => audio(16));
    await cache.load("old-guide", "guide", render);
    expect(render).toHaveBeenCalledOnce();
    expect(cache.stats.bytes).toBeLessThanOrEqual(64);
  });

  it("같은 우선순위에서는 최근 사용한 버퍼를 남기는 LRU로 보관한다", async () => {
    const cache = new KaraokeStemCache(48);
    const first = audio(24);
    await cache.load("first", "backing", async () => first);
    await cache.load("second", "backing", async () => audio(24));
    await cache.load("first", "backing", async () => audio());
    await cache.load("third", "backing", async () => audio(24));
    expect(await cache.load("first", "backing", async () => audio())).toBe(first);
    const render = vi.fn(async () => audio(24));
    await cache.load("second", "backing", render);
    expect(render).toHaveBeenCalledOnce();
    expect(cache.stats.bytes).toBe(48);
  });

  it("clear는 대기 요청을 종료하고 이전 작업의 늦은 결과를 남기지 않는다", async () => {
    const cache = new KaraokeStemCache(64);
    await cache.load("ready", "backing", async () => audio());
    const next = deferred<AudioBuffer>();
    const pending = cache.load("pending", "backing", () => next.promise);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    cache.clear();
    await rejected;
    next.resolve(audio());
    await next.promise;
    await Promise.resolve();
    expect(cache.stats).toEqual({ bytes: 0, entries: 0, pending: 0 });
  });

  it("시작 전에 취소된 요청은 렌더러나 캐시를 건드리지 않는다", async () => {
    const cache = new KaraokeStemCache(64);
    const controller = new AbortController();
    controller.abort();
    const render = vi.fn(async () => audio());
    await expect(cache.load("song", "backing", render, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(render).not.toHaveBeenCalled();
    expect(cache.stats.pending).toBe(0);
  });
});
