import { describe, expect, it } from "vitest";
import { compressToEncodedURIComponent } from "lz-string";
import { decodeSharedComposition, encodeSharedComposition, type SharedComposition } from "./share";

const compactSample: SharedComposition = {
  version: 1,
  title: "QR test song",
  creator: "maker",
  originalCreator: "maker",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 16,
  instrumentId: "piano",
  accompanimentStyleId: "arpeggio",
  accompanimentInstrumentIds: ["piano", "violin", "flute"],
  bpm: 124,
  lyrics: Array(16).fill("la"),
  measures: Array.from({ length: 16 }, (_, measureIndex) => ({
    candidateName: `candidate-${measureIndex}`,
    notes: Array.from({ length: 12 }, (_, noteIndex) => ({
      id: `note-${measureIndex}-${noteIndex}`,
      pitch: noteIndex % 5 === 0 ? null : 60 + (noteIndex % 7),
      duration: { numerator: noteIndex % 3 === 0 ? 1 : 3, denominator: noteIndex % 3 === 0 ? 2 : 4 },
      dotted: noteIndex % 4 === 0,
      beamGroup: `beam-${Math.floor(noteIndex / 4)}`,
      lyric: noteIndex % 5 === 0 ? undefined : "라"
    })),
    effects: [{ id: `effect-${measureIndex}`, effectId: "bird", offsetBeats: 1.5 }]
  }))
};

function legacyEncode(composition: SharedComposition): string {
  const bytes = new TextEncoder().encode(JSON.stringify(composition));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function compactV1Encode(composition: SharedComposition): string {
  return compressToEncodedURIComponent(JSON.stringify([
    1,
    composition.title,
    composition.description,
    composition.creator,
    composition.originalCreator,
    composition.presetId,
    composition.meter.beats,
    composition.meter.beatUnit,
    composition.songLength,
    composition.instrumentId,
    composition.accompanimentStyleId,
    composition.accompanimentInstrumentIds,
    composition.bpm,
    composition.lyrics,
    composition.measures.map((measure) => [
      measure.candidateName,
      measure.notes.map((note) => [
        note.id, note.pitch, note.duration.numerator, note.duration.denominator, note.dotted,
        note.beamGroup, note.beamBreak, note.linkToNext, note.restY, note.lyric
      ]),
      measure.effects?.map((effect) => [effect.id, effect.effectId, effect.offsetBeats])
    ])
  ]));
}

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

describe("compact share encoding", () => {
  it("round-trips compact compressed share data", () => {
    expect(normalizeTransientIds(decodeSharedComposition(encodeSharedComposition(compactSample))))
      .toEqual(normalizeTransientIds(compactSample));
  });

  it("keeps QR payloads below the guarded render limit", () => {
    expect(encodeSharedComposition(compactSample).length).toBeLessThan(1800);
  });

  it("continues to decode legacy base64url share data", () => {
    expect(decodeSharedComposition(legacyEncode(compactSample))).toEqual(compactSample);
  });

  it("continues to decode version 1 compact share data", () => {
    expect(normalizeTransientIds(decodeSharedComposition(compactV1Encode(compactSample))))
      .toEqual(normalizeTransientIds(compactSample));
  });
});
