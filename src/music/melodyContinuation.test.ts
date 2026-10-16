import { describe, expect, it } from "vitest";
import { getCandidates } from "./candidates";
import { measureCapacity, SUPPORTED_METERS } from "./meter";
import { prioritizeMelodyContinuations } from "./melodyContinuation";
import { rational } from "./rational";
import { rankRecommendedCandidates } from "./recommendation";
import { prioritizeCandidatesForRhythm } from "./rhythmPreference";
import type { MelodyCandidate, NoteEvent } from "./types";

function notes(pitches: readonly (number | null)[], beats = 1): readonly NoteEvent[] {
  return pitches.map((pitch, index) => ({
    id: `note-${index}`, pitch, duration: rational(beats * 2, 2)
  }));
}

function candidate(id: string, pitches: readonly number[], beats = 1): MelodyCandidate {
  return { id, name: id, hint: id, harmony: "home", notes: notes(pitches, beats) };
}

describe("앞 마디와 이어지는 가락 추천", () => {
  it("리듬 순서가 앞서도 옥타브 도약보다 앞 마디에서 편하게 이어지는 가락을 먼저 보여준다", () => {
    const abrupt = candidate("abrupt", [76, 79, 76, 72]);
    const smooth = candidate("smooth", [64, 67, 64, 60]);
    const ranked = prioritizeMelodyContinuations([abrupt, smooth], notes([60, 64, 67, 64]), ["C"]);
    expect(ranked[0]).toBe(smooth);
  });

  it("마지막 음이 같아도 앞 마디 전체의 음역과 가락 모양에 따라 추천 순서가 바뀐다", () => {
    const ascending = candidate("ascending", [60, 64, 67, 64]);
    const returning = candidate("returning", [60, 55, 52, 64]);
    const available = [ascending, returning];
    expect(prioritizeMelodyContinuations(available, ascending.notes, ["C"])[0]).toBe(ascending);
    expect(prioritizeMelodyContinuations(available, returning.notes, ["C"])[0]).toBe(returning);
  });

  it("음역과 연결이 비슷할 때 앞 마디와 리듬을 주고받는 가락을 먼저 보여준다", () => {
    const busy = candidate("busy", [60, 64, 67, 64, 60, 64, 67, 64], .5);
    const matching = candidate("matching", [60, 64, 67, 64]);
    expect(prioritizeMelodyContinuations([busy, matching], matching.notes, ["C"])[0]).toBe(matching);
  });

  it("앞 마디와 닮아도 현재 화음에 오래 부딪치는 음은 우선하지 않는다", () => {
    const dissonant = candidate("dissonant", [64, 65, 66, 64]);
    const consonant = candidate("consonant", [64, 67, 64, 60]);
    expect(prioritizeMelodyContinuations([dissonant, consonant], dissonant.notes, ["C"])[0]).toBe(consonant);
  });

  it("한 음이 다음 화음까지 이어질 때도 각 화음과 겹치는 길이를 확인한다", () => {
    const heldE = candidate("held-e", [64], 4);
    const changing = candidate("changing", [64, 67, 71, 67]);
    expect(prioritizeMelodyContinuations([heldE, changing], notes([64], 4), ["C", "G"])[0])
      .toBe(changing);
  });

  it("쉼표를 실제 마지막 음으로 오해하지 않고 마지막으로 부른 음에서 이어 준다", () => {
    const low = candidate("low", [64, 67, 64, 60]);
    const high = candidate("high", [76, 79, 76, 72]);
    expect(prioritizeMelodyContinuations([high, low], notes([60, 64, 64, null]), ["C"])[0]).toBe(low);
  });

  it("앞 마디가 비어 있거나 쉼표뿐이면 기존 화음과 스타일 순서를 보존한다", () => {
    const available = [candidate("first", [76, 79, 76, 72]), candidate("second", [64, 67, 64, 60])];
    expect(prioritizeMelodyContinuations(available, [], ["C"])).toBe(available);
    expect(prioritizeMelodyContinuations(available, notes([null, null]), ["C"])).toBe(available);
  });

  it("후보를 수정하거나 지우지 않고 같은 입력에 같은 순서를 제공한다", () => {
    const available = [candidate("high", [76, 79, 76, 72]), candidate("low", [64, 67, 64, 60])];
    const previous = notes([60, 64, 67, 64]);
    const before = JSON.stringify({ available, previous });
    const ranked = prioritizeMelodyContinuations(available, previous, ["C"]);
    expect(new Set(ranked)).toEqual(new Set(available));
    expect(prioritizeMelodyContinuations(available, previous, ["C"])).toEqual(ranked);
    expect(JSON.stringify({ available, previous })).toBe(before);
  });

  it.each(SUPPORTED_METERS)("$beats/$beatUnit 실제 후보도 앞 마디 음역에 맞춰 각 느낌 안에서 재정렬한다", (meter) => {
    const available = getCandidates("home", meter, ["C"]);
    const baseline = prioritizeCandidatesForRhythm(
      rankRecommendedCandidates(available, ["C"], null, 1, 8), "children_song", 1);
    const previous = (pitch: number) => [{ id: "edited", pitch, duration: measureCapacity(meter) }];
    const low = prioritizeMelodyContinuations(baseline, previous(60), ["C"]);
    const high = prioritizeMelodyContinuations(baseline, previous(79), ["C"]);
    const opening = (items: readonly MelodyCandidate[]) =>
      items.find((item) => item.feelingId === "flowing")!.notes.find((note) => note.pitch !== null)!.pitch!;
    expect(opening(high)).toBeGreaterThan(opening(low));
    expect(new Set(low)).toEqual(new Set(available));
    expect(new Set(high)).toEqual(new Set(available));
  });
});
