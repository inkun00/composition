import { describe, expect, it } from "vitest";
import { getCandidates } from "./candidates";
import { HARMONY_PRESETS } from "./harmonyPresets";
import { SUPPORTED_METERS, validateMeasure } from "./meter";
import { SONG_STRUCTURES, availableSongStructures, fillStructuredRepeats, songStructurePlan } from "./songStructure";
import type { NoteEvent } from "./types";

describe("선택형 노래 구조", () => {
  it("모든 템플릿의 블록 길이 합계가 노래 길이와 같다", () => {
    for (const length of [8, 12, 16, 20, 24, 28, 32]) {
      expect(availableSongStructures(length).length).toBeGreaterThan(0);
      for (const definition of availableSongStructures(length)) {
        const plan = songStructurePlan(definition.id, length)!;
        expect(plan.blocks.reduce((sum, block) => sum + block.bars, 0)).toBe(length);
        plan.blocks.forEach((block) => {
          if (block.reuse === "new") return;
          expect(plan.blocks.some((earlier) => earlier.start < block.start && earlier.family === block.family &&
            earlier.bars === block.bars && earlier.reuse === "new")).toBe(true);
        });
      }
    }
    expect(songStructurePlan("aaba", 8)).toBeNull();
    expect(SONG_STRUCTURES).toHaveLength(9);
  });

  it("처음 구간을 채우면 같은 가락과 끝만 바꾼 가락이 자동으로 들어간다", () => {
    const empty = Array.from({ length: 16 }, (_, index) => ({
      story: "home" as const,
      chords: [index % 4 === 0 ? "C" : "G"],
      candidateId: null as string | null,
      candidateName: null as string | null,
      notes: null as ReturnType<typeof getCandidates>[number]["notes"] | null
    }));
    const first = getCandidates("home", { beats: 4, beatUnit: 4 }, ["C"])[0];
    empty[0] = { ...empty[0], candidateId: first.id, candidateName: first.name, notes: first.notes };
    const filled = fillStructuredRepeats(empty, "aaba", 0);
    expect(filled[4].notes?.map((note) => note.pitch)).toEqual(first.notes.map((note) => note.pitch));
    expect(filled[12].notes?.map((note) => note.pitch)).toEqual(first.notes.map((note) => note.pitch));
    expect(filled[8].notes).toBeNull();
    expect(validateMeasure(filled[4].notes ?? [], { beats: 4, beatUnit: 4 }).state).toBe("exact");

    const last = getCandidates("home", { beats: 4, beatUnit: 4 }, ["G"])[0];
    filled[3] = { ...filled[3], candidateId: last.id, candidateName: last.name, notes: last.notes };
    const ending = fillStructuredRepeats(filled, "aaba", 3);
    expect(ending[7].notes?.map((note) => note.pitch)).toEqual(last.notes.map((note) => note.pitch));
    expect(ending[15].notes?.at(-1)?.pitch).not.toBe(last.notes.at(-1)?.pitch);
    expect(validateMeasure(ending[15].notes ?? [], { beats: 4, beatUnit: 4 }).state).toBe("exact");
  });

  it("다시 나오는 부분을 직접 고쳤다면 자동 복사로 덮어쓰지 않는다", () => {
    const notes = getCandidates("home", { beats: 4, beatUnit: 4 }, ["C"])[0].notes;
    const measures = Array.from({ length: 8 }, (_, index) => ({
      story: "home" as const, chords: ["C"],
      candidateId: index === 0 ? "source" : index === 4 ? "custom" : null,
      candidateName: null, notes: index === 0 || index === 4 ? notes : null
    }));
    expect(fillStructuredRepeats(measures, "repeat", 0)[4].candidateId).toBe("custom");
    expect(fillStructuredRepeats(measures, null, 0)).toEqual(measures);
  });

  it("모든 길이와 박자에서 템플릿의 반복 구간을 빠짐없이 채운다", () => {
    const preset = HARMONY_PRESETS[0];
    for (const meter of SUPPORTED_METERS) {
      for (const length of [8, 12, 16, 20, 24, 28, 32]) {
        for (const definition of availableSongStructures(length)) {
          const plan = songStructurePlan(definition.id, length)!;
          let measures = Array.from({ length }, (_, index) => ({
            story: preset.roles[index % 4], chords: preset.bars[index % 4],
            candidateId: null as string | null, candidateName: null as string | null,
            notes: null as readonly NoteEvent[] | null
          }));
          for (const block of plan.blocks.filter((part) => part.reuse === "new")) {
            for (let offset = 0; offset < block.bars; offset += 1) {
              const index = block.start + offset;
              const candidate = getCandidates(measures[index].story, meter, measures[index].chords)[0];
              measures[index] = { ...measures[index], candidateId: candidate.id,
                candidateName: candidate.name, notes: candidate.notes };
              measures = fillStructuredRepeats(measures, plan.id, index);
            }
          }
          expect(measures.every((measure) => measure.notes !== null)).toBe(true);
          measures.forEach((measure) => expect(validateMeasure(measure.notes ?? [], meter).state).toBe("exact"));
        }
      }
    }
  });
});
