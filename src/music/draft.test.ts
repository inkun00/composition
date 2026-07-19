import { describe, expect, it } from "vitest";
import { DRAFT_STORAGE_KEY, readDraft, writeDraft, type SavedDraft } from "./draft";

const draft: SavedDraft = {
  version: 1,
  updatedAt: 123,
  sourceHash: "#song=sample",
  title: "구름 산책",
  creator: "새봄",
  originalCreator: "첫봄",
  presetId: "H001",
  meter: { beats: 6, beatUnit: 8 },
  songLength: 8,
  instrumentId: "acoustic_grand_piano",
  accompanimentStyleId: "folk",
  accompanimentInstrumentIds: ["guitar", "violin"],
  bpm: 82,
  lyrics: Array(8).fill("랄라"),
  measures: Array.from({ length: 8 }, (_, index) => ({
    candidateId: "custom",
    candidateName: "가사 가락",
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 3, denominator: 1 }, lyric: "랄" }],
    effects: [{ id: `effect-${index}`, effectId: "clock", offsetBeats: 0.5 }]
  })),
  showArrangement: false
};

describe("브라우저 임시 저장", () => {
  it("작업 중인 곡을 저장하고 다시 읽는다", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); }
    };
    expect(writeDraft(storage, draft)).toBe(true);
    expect(readDraft(storage)).toEqual(draft);
  });

  it("깨졌거나 규칙에 맞지 않는 저장 데이터는 불러오지 않는다", () => {
    expect(readDraft({ getItem: () => "not-json" })).toBeNull();
    expect(readDraft({ getItem: () => JSON.stringify({ ...draft, songLength: 7 }) })).toBeNull();
  });

  it("반주 악기 10개는 저장하고 11개는 거부한다", () => {
    const tenInstruments = ["acoustic_grand_piano", "bright_acoustic_piano", "xylophone", "glockenspiel",
      "acoustic_guitar_nylon", "electric_bass_finger", "violin", "cello", "flute", "trumpet"];
    const storage = { getItem: () => JSON.stringify({ ...draft, accompanimentInstrumentIds: tenInstruments }) };
    expect(readDraft(storage)?.accompanimentInstrumentIds).toEqual(tenInstruments);
    expect(readDraft({ getItem: () => JSON.stringify({
      ...draft,
      accompanimentInstrumentIds: [...tenInstruments, "trombone"]
    }) })).toBeNull();
  });

  it("저장 공간 오류를 앱 오류로 번지게 하지 않는다", () => {
    expect(writeDraft({ setItem: () => { throw new Error("quota"); } }, draft)).toBe(false);
    expect(DRAFT_STORAGE_KEY).toContain("draft");
  });
});
