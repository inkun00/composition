import { describe, expect, it } from "vitest";
import type { SharedComposition } from "../music/share";
import { activeQrLyrics, buildQrLyricLines } from "./qrSongLyrics";

function compositionWithLyrics(): SharedComposition {
  return {
    version: 1,
    title: "가사 노래",
    creator: "새봄",
    originalCreator: "새봄",
    presetId: "H001",
    meter: { beats: 4, beatUnit: 4 },
    songLength: 8,
    instrumentId: "piano",
    bpm: 60,
    lyrics: ["마음 노래", ...Array(7).fill("")],
    measures: Array.from({ length: 8 }, (_, measureIndex) => ({
      candidateName: `${measureIndex + 1}마디`,
      notes: measureIndex === 0 ? [
        { id: "one", pitch: 60, duration: { numerator: 1, denominator: 1 } },
        { id: "rest", pitch: null, duration: { numerator: 1, denominator: 1 } },
        { id: "two", pitch: 62, duration: { numerator: 1, denominator: 1 } },
        { id: "three", pitch: 64, duration: { numerator: 1, denominator: 1 } }
      ] : [{ id: `empty-${measureIndex}`, pitch: null, duration: { numerator: 4, denominator: 1 } }]
    }))
  };
}

describe("QR 노래 가사 진행", () => {
  it("이전 형식의 마디 가사를 음표 순서와 박자에 맞춘다", () => {
    const lines = buildQrLyricLines(compositionWithLyrics(), 60);

    expect(lines).toHaveLength(1);
    expect(lines[0].tokens.map((token) => token.text)).toEqual(["마", "음", "노"]);
    expect(lines[0].tokens.map((token) => token.startSeconds)).toEqual([0, 2, 3]);
  });

  it("음표에 직접 적힌 가사를 우선한다", () => {
    const source = compositionWithLyrics();
    const first = source.measures[0];
    const withNoteLyrics: SharedComposition = {
      ...source,
      measures: [{
        ...first,
        notes: first.notes.map((note, index) => ({ ...note, lyric: note.pitch === null ? undefined : ["빛", "나", "요"][index] }))
      }, ...source.measures.slice(1)]
    };

    expect(buildQrLyricLines(withNoteLyrics, 60)[0].tokens.map((token) => token.text))
      .toEqual(["빛", "요"]);
  });

  it("현재 시간에 맞는 마디와 음절을 찾는다", () => {
    const lines = buildQrLyricLines(compositionWithLyrics(), 60);

    expect(activeQrLyrics(lines, 2.2)).toEqual({
      measureIndex: 0,
      tokenId: "qr-lyric-0-2"
    });
    expect(activeQrLyrics(lines, 5)).toEqual({ measureIndex: null, tokenId: null });
  });
});
