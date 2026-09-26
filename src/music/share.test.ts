import { describe, expect, it } from "vitest";
import { buildEmbeddedQrPlaybackUrl, buildQrPlaybackUrl, buildShareUrl, decodeSharedComposition,
  encodeSharedComposition, type SharedComposition } from "./share";

const sample: SharedComposition = {
  version: 1,
  title: "햇살 노래",
  creator: "새봄",
  originalCreator: "새봄",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 8,
  structureTemplateId: "repeat",
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

  it("직접 설정한 21마디 악보도 공유 링크에서 복원한다", () => {
    const custom = { ...sample, songLength: 21, structureTemplateId: undefined,
      lyrics: Array(21).fill("라"), measures: Array.from({ length: 21 }, (_, index) => sample.measures[index % 8]) };
    expect(decodeSharedComposition(encodeSharedComposition(custom))?.songLength).toBe(21);
  });

  it("가져온 48마디 악보를 공유 링크에서 복원한다", () => {
    const longScore = { ...sample, songLength: 48, structureTemplateId: undefined,
      lyrics: Array(48).fill("라"), measures: Array.from({ length: 48 }, (_, index) => sample.measures[index % 8]) };
    expect(decodeSharedComposition(encodeSharedComposition(longScore))?.songLength).toBe(48);
  });

  it("가져온 악보의 화음과 조표·임시표를 공유 후에도 보존한다", () => {
    const imported = { ...sample, measures: sample.measures.map((measure, index) => index === 0 ? {
      ...measure, chords: ["Bb"], keyFifths: -1,
      notes: measure.notes.map((note) => ({ ...note, pitch: 70, accidental: "flat" as const }))
    } : measure) };
    expect(decodeSharedComposition(encodeSharedComposition(imported))?.measures[0]).toMatchObject({
      chords: ["Bb"], keyFifths: -1, notes: [expect.objectContaining({ accidental: "flat" })]
    });
  });

  it("공유 주소에 곡 데이터를 넣는다", () => {
    expect(buildShareUrl(sample, { origin: "https://example.com", pathname: "/song" }))
      .toMatch(/^https:\/\/example\.com\/song#song=/);
  });

  it("QR 재생 주소는 전용 재생 화면을 연다", () => {
    expect(buildQrPlaybackUrl("AbCdEfGhIjKlMnOpQrSt", { origin: "https://example.com", pathname: "/song" }))
      .toBe("https://example.com/song?play=qr&song=AbCdEfGhIjKlMnOpQrSt");
    expect(buildEmbeddedQrPlaybackUrl(sample, { origin: "https://example.com", pathname: "/song" }))
      .toMatch(/^https:\/\/example\.com\/song\?play=qr#song=/);
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
