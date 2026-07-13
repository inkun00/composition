import { describe, expect, it } from "vitest";
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

describe("compact share encoding", () => {
  it("round-trips compact compressed share data", () => {
    expect(decodeSharedComposition(encodeSharedComposition(compactSample))).toEqual(compactSample);
  });

  it("keeps QR payloads below the guarded render limit", () => {
    expect(encodeSharedComposition(compactSample).length).toBeLessThan(2900);
  });

  it("continues to decode legacy base64url share data", () => {
    expect(decodeSharedComposition(legacyEncode(compactSample))).toEqual(compactSample);
  });
});
