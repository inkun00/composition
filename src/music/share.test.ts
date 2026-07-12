import { describe, expect, it } from "vitest";
import { buildShareUrl, decodeSharedComposition, encodeSharedComposition, type SharedComposition } from "./share";

const sample: SharedComposition = {
  version: 1,
  title: "햇살 노래",
  creator: "새봄",
  originalCreator: "새봄",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 8,
  instrumentId: "piano",
  accompanimentStyleId: "arpeggio",
  accompanimentInstrumentIds: ["piano", "violin"],
  bpm: 124,
  lyrics: Array(8).fill("라라라"),
  measures: Array.from({ length: 8 }, (_, index) => ({
    candidateName: "햇살 계단",
    notes: [{
      id: `note-${index}`,
      pitch: 60,
      duration: { numerator: 3, denominator: 2 },
      dotted: true,
      beamGroup: "beam-a",
      lyric: "라"
    }],
    effects: [{ id: `effect-${index}`, effectId: "bird", offsetBeats: 1.5 }]
  }))
};

describe("공유 링크", () => {
  it("한글과 악보를 손실 없이 저장하고 복원한다", () => {
    expect(decodeSharedComposition(encodeSharedComposition(sample))).toEqual(sample);
  });

  it("공유 주소에 곡 데이터를 넣는다", () => {
    expect(buildShareUrl(sample, { origin: "https://example.com", pathname: "/song" }))
      .toMatch(/^https:\/\/example\.com\/song#song=/);
  });

  it("손상된 데이터는 열지 않는다", () => {
    expect(decodeSharedComposition("broken-data")).toBeNull();
  });
});
