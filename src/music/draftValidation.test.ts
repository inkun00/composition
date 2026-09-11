import { describe, expect, it } from "vitest";
import type { SavedDraft } from "./draft";
import { cloudSaveIssue, findDraftSaveIssues } from "./draftValidation";

function validDraft(): SavedDraft {
  return {
    version: 1,
    updatedAt: Date.now(),
    sourceHash: "",
    title: "햇살 노래",
    description: "산책하며 만든 곡",
    creator: "민준",
    originalCreator: "",
    presetId: "H001",
    meter: { beats: 4, beatUnit: 4 },
    songLength: 8,
    instrumentId: "piano",
    bpm: 96,
    lyrics: Array.from({ length: 8 }, () => ""),
    measures: Array.from({ length: 8 }, (_, index) => ({
      candidateId: `candidate-${index}`,
      candidateName: "가락",
      notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 1, denominator: 1 } }],
      effects: []
    })),
    showArrangement: true
  };
}

describe("악보 저장 진단", () => {
  it("정상 악보는 저장 문제를 만들지 않는다", () => {
    expect(findDraftSaveIssues(validDraft())).toEqual([]);
  });

  it("문제가 있는 마디 번호와 이유를 알려준다", () => {
    const draft = validDraft();
    const measures = [...draft.measures];
    measures[2] = { ...measures[2], notes: Array.from({ length: 33 }, (_, index) => ({
      id: `note-${index}`, pitch: 60, duration: { numerator: 1, denominator: 4 }
    })) };
    const issues = findDraftSaveIssues({ ...draft, measures });
    expect(issues).toContainEqual(expect.objectContaining({ target: "measure", measureIndex: 2 }));
    expect(issues.some((issue) => issue.message.includes("3마디"))).toBe(true);
  });

  it("Firebase 오류를 사용자가 해결할 수 있는 원인으로 바꾼다", () => {
    expect(cloudSaveIssue({ code: "firestore/permission-denied" }).message).toContain("권한");
    expect(cloudSaveIssue({ code: "firestore/unavailable" }).message).toContain("인터넷 연결");
  });
});
