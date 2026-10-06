import { describe, expect, it } from "vitest";
import { getCandidates, MELODY_CANDIDATE_COUNT } from "./candidates";
import { chordPitchClasses } from "./chord";
import { HARMONY_PRESETS } from "./harmonyPresets";
import { MELODY_FEELING_GROUPS, melodyFeelingForNotes } from "./melodyFeelings";
import { SUPPORTED_METERS, validateMeasure } from "./meter";
import { toNumber } from "./rational";
import { rankRecommendedCandidates } from "./recommendation";
import { prioritizeCandidatesForRhythm } from "./rhythmPreference";

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

  it("화음의 성격에 따라 가락 모양과 리듬이 함께 달라진다", () => {
    const meter = { beats: 4, beatUnit: 4 } as const;
    const major = getCandidates("home", meter, ["C"])[0];
    const minor = getCandidates("home", meter, ["Am"])[0];
    const seventh = getCandidates("home", meter, ["Cmaj7"])[0];
    const rhythm = (candidate: typeof major) => candidate.notes.map((note) => toNumber(note.duration));

    expect(major.name).not.toBe(minor.name);
    expect(rhythm(major)).not.toEqual(rhythm(minor));
    expect(rhythm(major)).not.toEqual(rhythm(seventh));
  });

  it("100가지 화음 이야기의 첫 마디에 여러 리듬을 만든다", () => {
    const rhythms = new Set(HARMONY_PRESETS.map((preset) => {
      const candidate = getCandidates(preset.roles[0], { beats: 4, beatUnit: 4 }, preset.bars[0])[0];
      return candidate.notes.map((note) => toNumber(note.duration)).join(",");
    }));
    expect(rhythms.size).toBeGreaterThanOrEqual(8);
  });

  it("첫 느낌 탭의 맨 앞 가락도 화음 이야기에 따라 달라진다", () => {
    const rhythms = new Set<string>();
    const pitches = new Set<string>();
    for (const preset of HARMONY_PRESETS) {
      const chords = preset.bars[0];
      const candidates = getCandidates(preset.roles[0], { beats: 4, beatUnit: 4 }, chords);
      const ranked = rankRecommendedCandidates(candidates, chords, null, 0, 16);
      const first = prioritizeCandidatesForRhythm(ranked, "children_song")
        .find((candidate) => candidate.feelingId === "flowing");
      expect(first).toBeDefined();
      rhythms.add(first!.notes.map((note) => toNumber(note.duration)).join(","));
      pitches.add(first!.notes.map((note) => note.pitch).join(","));
    }
    expect(rhythms.size).toBeGreaterThanOrEqual(6);
    expect(pitches.size).toBeGreaterThanOrEqual(50);
  });

  it("느낌 탭은 후보 번호가 아니라 실제 음 길이와 움직임으로 분류한다", () => {
    const feelings = new Set<string>();
    for (const preset of HARMONY_PRESETS) {
      for (const meter of SUPPORTED_METERS) {
        preset.bars.forEach((chords, index) => {
          const candidates = getCandidates(preset.roles[index], meter, chords);
          candidates.forEach((candidate) => {
            expect(candidate.feelingId).toBe(melodyFeelingForNotes(candidate.notes));
            expect(candidate.notes.some((note) => note.pitch !== null)).toBe(true);
            feelings.add(candidate.feelingId ?? "");
          });
          expect(new Set(candidates.map((candidate) => candidate.feelingId)).size).toBe(5);
        });
      }
    }
    expect(feelings).toEqual(new Set(MELODY_FEELING_GROUPS.map((group) => group.id)));
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
