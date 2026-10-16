// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { getCandidates } from "../music/candidates";
import { rational } from "../music/rational";
import { rankRecommendedCandidates } from "../music/recommendation";
import { prioritizeCandidatesForRhythm } from "../music/rhythmPreference";
import type { MelodyCandidate, NoteEvent } from "../music/types";
import { useMelodyCandidatePriority } from "./useMelodyCandidatePriority";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let current: readonly MelodyCandidate[] = [];

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function notes(pitches: readonly number[]): readonly NoteEvent[] {
  return pitches.map((pitch, index) => ({ id: `edited-${index}`, pitch, duration: rational(1) }));
}

const low: MelodyCandidate = {
  id: "low", name: "low", hint: "low", harmony: "home", feelingId: "flowing", notes: notes([64, 67, 64, 60])
};
const high: MelodyCandidate = {
  ...low, id: "high", name: "high", notes: notes([76, 79, 76, 72])
};

function Harness({ previous, activeIndex = 1, candidates = [low, high] }: Readonly<{
  previous: readonly NoteEvent[] | null;
  activeIndex?: number;
  candidates?: readonly MelodyCandidate[];
}>) {
  const measures = Array.from({ length: 4 }, (_, index) => ({
    story: "home" as const,
    chords: ["C"],
    candidateId: index === 0 ? "original-candidate" : null,
    notes: index === 0 ? previous : null
  }));
  current = useMelodyCandidatePriority(candidates, measures, activeIndex, "children_song");
  return <div>{current.map((candidate) => <span key={candidate.id}>{candidate.id}</span>)}</div>;
}

function render(element: ReactNode) {
  if (!container) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  act(() => root?.render(element));
}

describe("마디 선택 화면의 가락 추천", () => {
  it("앞 마디의 후보 ID가 같아도 직접 바꾼 음높이와 되돌리기에 맞춰 즉시 순서를 바꾼다", () => {
    const original = notes([60, 64, 67, 64]);
    render(<Harness previous={original} />);
    expect(current[0]).toBe(low);
    render(<Harness previous={notes([72, 76, 79, 76])} />);
    expect(current[0]).toBe(high);
    render(<Harness previous={original} />);
    expect(current[0]).toBe(low);
  });

  it("다른 느낌 탭에서도 전체 후보를 유지하며 같은 느낌 안에서 어울리는 가락이 먼저 온다", () => {
    const available = [low, { ...high, id: "high-gentle", feelingId: "gentle" }, high,
      { ...low, id: "low-gentle", feelingId: "gentle" }];
    render(<Harness previous={notes([60, 64, 67, 64])} candidates={available} />);
    expect(current.filter((candidate) => candidate.feelingId === "flowing")[0]).toBe(low);
    expect(current.filter((candidate) => candidate.feelingId === "gentle")[0].id).toBe("low-gentle");
    expect(new Set(current)).toEqual(new Set(available));
  });

  it("아직 앞 마디를 고르지 않았으면 기존 첫 마디 스타일 추천을 그대로 유지한다", () => {
    const available = getCandidates("home", { beats: 4, beatUnit: 4 }, ["C"]);
    const expected = prioritizeCandidatesForRhythm(
      rankRecommendedCandidates(available, ["C"], null, 0, 4), "children_song", 0);
    render(<Harness previous={null} activeIndex={0} candidates={available} />);
    expect(current).toEqual(expected);
  });

  it("바로 앞 마디가 비어 있으면 더 이전 마디의 음높이로 추천하지 않는다", () => {
    render(<Harness previous={notes([60, 64, 67, 64])} activeIndex={2} />);
    const before = [...current];
    render(<Harness previous={notes([84, 88, 91, 88])} activeIndex={2} />);
    expect(current).toEqual(before);
  });
});
