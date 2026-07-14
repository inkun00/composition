import { describe, expect, it } from "vitest";
import { getCandidates, MELODY_CANDIDATE_COUNT } from "./candidates";
import { chordPitchClasses } from "./chord";
import { SUPPORTED_METERS, validateMeasure } from "./meter";

describe("M0 가락 후보", () => {
  it.each(["home", "journey", "wonder"] as const)("각 화음 이야기에 6개 후보가 있다", (story) => {
    expect(getCandidates(story)).toHaveLength(MELODY_CANDIDATE_COUNT);
  });

  it("4개 박자의 모든 후보가 정확히 한 마디를 채운다", () => {
    for (const meter of SUPPORTED_METERS) {
      for (const story of ["home", "journey", "wonder"] as const) {
        const candidates = getCandidates(story, meter);
        expect(candidates).toHaveLength(MELODY_CANDIDATE_COUNT);
        for (const candidate of candidates) {
          expect(validateMeasure(candidate.notes, meter).state).toBe("exact");
        }
      }
    }
  });

  it("학생용 후보 이름에는 전문용어가 없다", () => {
    const forbidden = /재즈|모달|감화음|증화음|도미넌트|마이너|메이저|dim|aug|sus|ii.?V.?I/i;
    const allCandidates = (["home", "journey", "wonder"] as const).flatMap((story) => getCandidates(story));
    for (const candidate of allCandidates) {
      expect(candidate.name + " " + candidate.hint).not.toMatch(forbidden);
    }
  });

  it("같은 모양도 화음이 달라지면 화음 구성음에 맞춰 바뀐다", () => {
    const cMelody = getCandidates("home", { beats: 4, beatUnit: 4 }, ["C"])[0];
    const flatMelody = getCandidates("home", { beats: 4, beatUnit: 4 }, ["D♭"])[0];
    expect(cMelody.notes.map((note) => note.pitch)).not.toEqual(flatMelody.notes.map((note) => note.pitch));
  });

  it("각 화음 이야기와 박자마다 쉼표가 들어간 후보를 보여준다", () => {
    for (const meter of SUPPORTED_METERS) {
      for (const story of ["home", "journey", "wonder"] as const) {
        expect(getCandidates(story, meter).some((candidate) =>
          candidate.notes.some((note) => note.pitch === null))).toBe(true);
      }
    }
  });

  it("각 화음에는 클라이맥스에 쓸 높은 가락 후보도 있다", () => {
    for (const story of ["home", "journey", "wonder", "shadow"] as const) {
      const highCandidates = getCandidates(story, { beats: 4, beatUnit: 4 }, ["C"]).slice(-4);
      expect(highCandidates.map((candidate) => candidate.name)).toEqual([
        "하늘 높이", "별빛 점프", "힘찬 외침", "마지막 햇살"
      ]);
      expect(highCandidates.every((candidate) =>
        candidate.notes.some((note) => (note.pitch ?? 0) >= 72))).toBe(true);
    }
  });

  it("화음 음 사이를 살짝 스쳤다가 돌아오는 가락도 들려준다", () => {
    const cTones = chordPitchClasses("C");
    for (const story of ["home", "journey", "wonder"] as const) {
      const candidates = getCandidates(story, { beats: 4, beatUnit: 4 }, ["C"]);
      const passingCandidates = candidates.filter((candidate) => candidate.hint.includes("살짝 스쳤다가"));
      expect(passingCandidates.length).toBeGreaterThan(0);
      expect(passingCandidates.every((candidate) => candidate.notes.some((note) =>
        note.pitch !== null && !cTones.includes(((note.pitch % 12) + 12) % 12)))).toBe(true);
    }
  });
});
