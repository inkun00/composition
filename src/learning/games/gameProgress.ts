import { useRef, useState } from "react";

export type GameId = "bridge" | "train" | "memory";
export type GameResult = { stars: number; score: number };
export type GameRecords = Partial<Record<GameId, GameResult>>;

export const GAME_PROGRESS_KEY = "maeum-melody:games:v1";
const GAME_IDS: GameId[] = ["bridge", "train", "memory"];

function isGameId(id: unknown): id is GameId {
  return typeof id === "string" && GAME_IDS.includes(id as GameId);
}

function validResult(value: unknown): value is GameResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.stars === "number" && Number.isInteger(result.stars) &&
    result.stars >= 1 && result.stars <= 3 &&
    typeof result.score === "number" && Number.isInteger(result.score) &&
    result.score >= 0 && result.score <= 100_000;
}

function cleanRecords(value: unknown): GameRecords {
  const records: GameRecords = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return records;
  const source = value as Record<string, unknown>;
  for (const id of GAME_IDS) {
    if (!Object.prototype.hasOwnProperty.call(source, id) || !validResult(source[id])) continue;
    const result = source[id];
    records[id] = { stars: result.stars, score: result.score };
  }
  return records;
}

export function readGameProgress(): { records: GameRecords; saved: boolean } {
  let raw: string | null;
  try {
    raw = localStorage.getItem(GAME_PROGRESS_KEY);
  } catch {
    return { records: {}, saved: false };
  }
  try {
    return { records: cleanRecords(JSON.parse(raw ?? "{}")), saved: true };
  } catch {
    // Corrupt data can be replaced on the next completed game; storage works.
    return { records: {}, saved: true };
  }
}

export function writeGameProgress(records: GameRecords): boolean {
  try {
    localStorage.setItem(GAME_PROGRESS_KEY, JSON.stringify(cleanRecords(records)));
    return true;
  } catch {
    return false;
  }
}

export function mergeGameResult(records: GameRecords, id: GameId, result: GameResult): GameRecords {
  const next = cleanRecords(records);
  if (!isGameId(id) || !validResult(result)) return next;
  const previous = next[id];
  next[id] = {
    stars: Math.max(previous?.stars ?? 0, result.stars),
    score: Math.max(previous?.score ?? 0, result.score)
  };
  return next;
}

export function useGameProgress() {
  const [initial] = useState(readGameProgress);
  const [records, setRecords] = useState(initial.records);
  const [saved, setSaved] = useState(initial.saved);
  const recordsRef = useRef(records);

  function recordResult(id: GameId, result: GameResult) {
    if (!isGameId(id) || !validResult(result)) return;
    const next = mergeGameResult(recordsRef.current, id, result);
    recordsRef.current = next;
    setRecords(next);
    setSaved(writeGameProgress(next));
  }

  const totals = Object.values(records).reduce((sum, result) => ({
    stars: sum.stars + result.stars,
    score: sum.score + result.score
  }), { stars: 0, score: 0 });

  return { records, saved, recordResult, totalStars: totals.stars, totalScore: totals.score };
}
