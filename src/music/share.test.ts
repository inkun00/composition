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

function normalizeTransientIds(composition: SharedComposition | null): unknown {
  if (!composition) return composition;
  const normalized = {
    ...composition,
    measures: composition.measures.map((measure) => {
      const beamGroups = new Map<string, number>();
      return {
        ...measure,
        notes: measure.notes.map(({ id: _id, beamGroup, ...note }) => {
          if (beamGroup && !beamGroups.has(beamGroup)) beamGroups.set(beamGroup, beamGroups.size);
          return { ...note, beamGroup: beamGroup ? beamGroups.get(beamGroup) : undefined };
        }),
        effects: measure.effects?.map(({ id: _id, ...effect }) => effect)
      };
    })
  };
  return JSON.parse(JSON.stringify(normalized));
}

describe("공유 링크", () => {
  it("한글과 악보를 손실 없이 저장하고 복원한다", () => {
    expect(normalizeTransientIds(decodeSharedComposition(encodeSharedComposition(sample))))
      .toEqual(normalizeTransientIds(sample));
  });

  it("공유 주소에 곡 데이터를 넣는다", () => {
    expect(buildShareUrl(sample, { origin: "https://example.com", pathname: "/song" }))
      .toMatch(/^https:\/\/example\.com\/song#song=/);
  });

  it("공유 링크는 반주 악기 10개까지 복원한다", () => {
    const tenInstruments = ["acoustic_grand_piano", "bright_acoustic_piano", "xylophone", "glockenspiel",
      "acoustic_guitar_nylon", "electric_bass_finger", "violin", "cello", "flute", "trumpet"];
    const shared = { ...sample, accompanimentInstrumentIds: tenInstruments };
    expect(decodeSharedComposition(encodeSharedComposition(shared))?.accompanimentInstrumentIds)
      .toEqual(tenInstruments);
    expect(decodeSharedComposition(encodeSharedComposition({
      ...shared,
      accompanimentInstrumentIds: [...tenInstruments, "trombone"]
    }))).toBeNull();
  });

  it("손상된 데이터는 열지 않는다", () => {
    expect(decodeSharedComposition("broken-data")).toBeNull();
  });
});
