import { describe, expect, it } from "vitest";
import {
  buildQrPlaybackUrl,
  buildShareUrl,
  decodeQrPlaybackComposition,
  decodeSharedComposition,
  encodeQrPlaybackComposition,
  encodeSharedComposition,
  type SharedComposition
} from "./share";

const sample: SharedComposition = {
  version: 1,
  title: "햇살 노래",
  creator: "새봄",
  originalCreator: "새봄",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 32,
  instrumentId: "piano",
  accompanimentStyleId: "arpeggio",
  accompanimentInstrumentIds: ["piano", "violin"],
  beatInstrumentIds: ["kick", "clap", "hihat"],
  beatPattern: [
    { id: "beat-1", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 },
    { id: "beat-2", instrumentId: "clap", measureIndex: 3, offsetBeats: 2 }
  ],
  beatVolume: 125,
  bpm: 124,
  lyrics: Array(32).fill("라라라"),
  measures: Array.from({ length: 32 }, (_, index) => ({
    candidateName: "햇살 계단",
    notes: [{
      id: `note-${index}`,
      pitch: 61,
      accidental: "sharp",
      duration: { numerator: 3, denominator: 2 },
      dotted: true,
      beamGroup: "beam-a",
      lyric: "라"
    }],
    chords: [index % 2 === 0 ? "C" : "G7"],
    keyFifths: 2,
    effects: [{ id: `effect-${index}`, effectId: "bird", offsetBeats: 1.5 }]
  }))
};

function normalizeTransientIds(composition: SharedComposition | null): unknown {
  if (!composition) return composition;
  const normalized = {
    ...composition,
    beatPattern: composition.beatPattern?.map(({ id: _id, ...event }) => event),
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

  it("QR 재생 주소는 전용 재생 화면과 곡 데이터를 함께 연다", () => {
    const url = buildQrPlaybackUrl("AbCdEfGhIjKlMnOpQrSt", { origin: "https://example.com", pathname: "/song" });
    expect(url).toBe("https://example.com/song?play=qr&song=AbCdEfGhIjKlMnOpQrSt");
    expect(url.length).toBeLessThan(100);
  });

  it("QR 전용 데이터는 가락과 반주에 필요한 내용만 작게 복원한다", () => {
    const encoded = encodeQrPlaybackComposition(sample);
    const restored = decodeQrPlaybackComposition(encoded);
    expect(restored).not.toBeNull();
    expect(restored?.title).toBe(sample.title);
    expect(restored?.instrumentId).toBe("acoustic_grand_piano");
    expect(restored?.accompanimentStyleId).toBe(sample.accompanimentStyleId);
    expect(restored?.accompanimentInstrumentIds).toEqual(["acoustic_grand_piano", "violin"]);
    expect(restored?.beatPattern?.map(({ instrumentId, measureIndex, offsetBeats }) =>
      ({ instrumentId, measureIndex, offsetBeats }))).toEqual(sample.beatPattern?.map(
      ({ instrumentId, measureIndex, offsetBeats }) => ({ instrumentId, measureIndex, offsetBeats })));
    expect(restored?.measures[0].notes[0]).toMatchObject({
      pitch: 61,
      duration: { numerator: 3, denominator: 2 },
      dotted: true
    });
    expect(restored?.measures[0].chords).toEqual(["C"]);
    expect(restored?.measures[0].effects).toBeUndefined();
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
