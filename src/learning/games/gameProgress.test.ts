import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GAME_PROGRESS_KEY, mergeGameResult, readGameProgress, useGameProgress, writeGameProgress,
  type GameId, type GameResult
} from "./gameProgress";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let current: ReturnType<typeof useGameProgress>;

function Probe() {
  current = useGameProgress();
  return null;
}

function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(createElement(StrictMode, null, createElement(Probe))));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("music game records", () => {
  it("restores known games and validates every saved star and score", () => {
    localStorage.setItem(GAME_PROGRESS_KEY, JSON.stringify({
      bridge: { stars: 3, score: 1250, extra: "ignored" },
      train: { stars: 4, score: 500 },
      memory: { stars: 2, score: -1 },
      dynamics: { stars: 1, score: 50.5 },
      unknown: { stars: 3, score: 90_000 }
    }));
    expect(readGameProgress()).toEqual({ records: { bridge: { stars: 3, score: 1250 } }, saved: true });
    localStorage.setItem(GAME_PROGRESS_KEY, JSON.stringify({
      bridge: { stars: "3", score: 1 }, train: { stars: 1, score: 0.5 }, memory: { stars: 1, score: 100_001 }
    }));
    expect(readGameProgress().records).toEqual({});
  });

  it("ignores broken JSON, arrays, null and inherited game entries", () => {
    for (const raw of ["not-json", "[]", "null", "42"]) {
      localStorage.setItem(GAME_PROGRESS_KEY, raw);
      expect(readGameProgress()).toEqual({ records: {}, saved: true });
    }
    const inherited = Object.create({ bridge: { stars: 3, score: 1500 } });
    expect(writeGameProgress(inherited)).toBe(true);
    expect(readGameProgress().records).toEqual({});
  });

  it("keeps best stars and best score independently when replaying", () => {
    const first = mergeGameResult({}, "bridge", { stars: 3, score: 500 });
    const improvedScore = mergeGameResult(first, "bridge", { stars: 1, score: 1000 });
    const worse = mergeGameResult(improvedScore, "bridge", { stars: 2, score: 200 });
    expect(worse).toEqual({ bridge: { stars: 3, score: 1000 } });
    expect(first).toEqual({ bridge: { stars: 3, score: 500 } });
  });

  it("rejects untrusted results without erasing the existing record", () => {
    const records = { train: { stars: 2, score: 800 } };
    const invalid = [
      { stars: 0, score: 10 }, { stars: 1.5, score: 10 }, { stars: NaN, score: 10 },
      { stars: 3, score: Infinity }, { stars: 3, score: -1 }, { stars: 3, score: 1.5 },
      { stars: 3, score: 100_001 }, null, [], "bad"
    ];
    for (const result of invalid) {
      expect(mergeGameResult(records, "train", result as GameResult)).toEqual(records);
    }
    expect(mergeGameResult(records, "unknown" as GameId, { stars: 3, score: 900 })).toEqual(records);
  });

  it("retains session records and totals when browser storage is denied", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    mount();
    expect(current.saved).toBe(false);
    act(() => {
      current.recordResult("bridge", { stars: 3, score: 900 });
      current.recordResult("train", { stars: 2, score: 600 });
      current.recordResult("bridge", { stars: 1, score: 1000 });
    });
    expect(current.saved).toBe(false);
    expect(current.records.bridge).toEqual({ stars: 3, score: 1000 });
    expect(current.totalStars).toBe(5);
    expect(current.totalScore).toBe(1600);
  });

  it("persists canonical records across visits and does not write rejected results", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    mount();
    act(() => current.recordResult("dynamics", { stars: 2, score: 750 }));
    expect(current.saved).toBe(true);
    expect(readGameProgress().records).toEqual({ dynamics: { stars: 2, score: 750 } });
    expect(write).toHaveBeenCalledTimes(1);
    act(() => current.recordResult("dynamics", { stars: 0, score: 1000 }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(current.records.dynamics).toEqual({ stars: 2, score: 750 });
  });

  it("preserves retired memory records through new results without crediting current missions", () => {
    const previous = {
      bridge: { stars: 3, score: 1250 },
      train: { stars: 2, score: 600 },
      memory: { stars: 3, score: 9999 }
    };
    localStorage.setItem(GAME_PROGRESS_KEY, JSON.stringify(previous));
    mount();
    expect(current.records).toEqual(previous);
    expect(current.records.dynamics).toBeUndefined();
    expect(current.totalStars).toBe(5);
    expect(current.totalScore).toBe(1850);

    act(() => current.recordResult("dynamics", { stars: 2, score: 450 }));
    expect(readGameProgress().records).toEqual({ ...previous, dynamics: { stars: 2, score: 450 } });
    expect(current.totalStars).toBe(7);
    expect(current.totalScore).toBe(2300);

    act(() => current.recordResult("bridge", { stars: 1, score: 1500 }));
    expect(readGameProgress().records).toEqual({
      ...previous, bridge: { stars: 3, score: 1500 }, dynamics: { stars: 2, score: 450 }
    });
    expect(current.totalStars).toBe(7);
    expect(current.totalScore).toBe(2550);
  });

  it("keeps legacy-only storage but rejects attempts to record new memory results", () => {
    const legacy = { memory: { stars: 2, score: 750 } };
    expect(writeGameProgress(legacy)).toBe(true);
    mount();
    expect(current.records).toEqual(legacy);
    expect(current.totalStars).toBe(0);
    expect(current.totalScore).toBe(0);

    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() => current.recordResult("memory" as GameId, { stars: 3, score: 1000 }));
    expect(write).not.toHaveBeenCalled();
    expect(mergeGameResult(legacy, "memory" as GameId, { stars: 3, score: 1000 })).toEqual(legacy);
    expect(readGameProgress().records).toEqual(legacy);
  });
});
