import { describe, expect, it } from "vitest";
import type { SavedDraft } from "./draft";
import type { NoteEvent } from "./types";
import { buildPublishedSongLyrics, findPublishedSongLyricPosition } from "./publishedSongLyrics";

function note(id: string, lyric?: string, numerator = 1, denominator = 1, pitch: number | null = 60): NoteEvent {
  return { id, lyric, pitch, duration: { numerator, denominator } };
}

function draft(firstNotes: readonly NoteEvent[], changes: Partial<SavedDraft> = {}): SavedDraft {
  return {
    version: 1,
    updatedAt: 1,
    sourceHash: "",
    title: "우리의 노래",
    creator: "작곡가",
    originalCreator: "",
    presetId: "H001",
    songLength: 8,
    meter: { beats: 4, beatUnit: 4 },
    instrumentId: "piano",
    bpm: 120,
    lyrics: Array(8).fill(""),
    showArrangement: true,
    measures: Array.from({ length: 8 }, (_, index) => ({
      candidateId: null,
      candidateName: null,
      notes: index === 0 ? firstNotes : [note(`bar-${index}`, undefined, 4)]
    })),
    ...changes
  };
}

describe("공유 노래의 가사와 재생 위치", () => {
  it("쉼표와 가사 없는 음표의 시간도 포함해 다음 가사와 마디를 맞춘다", () => {
    const lyrics = buildPublishedSongLyrics(draft([
      note("a", "안", 1, 2),
      note("b", "녕", 1, 2),
      note("c", "해요", 1),
      note("rest", "무시", 1, 1, null),
      note("blank", undefined, 1)
    ]));
    expect(lyrics.lines).toHaveLength(8);
    expect(lyrics.lines[0].text).toBe("안녕해요");
    expect(lyrics.lines[0].segments.map(({ text, startSeconds, endSeconds }) =>
      [text, startSeconds, endSeconds])).toEqual([
      ["안", 0, .25], ["녕", .25, .5], ["해요", .5, 1]
    ]);
    expect(lyrics.lines[0].endSeconds).toBe(2);
    expect(lyrics.lines[1].startSeconds).toBe(2);
    expect(lyrics.durationSeconds).toBe(16);
    expect(lyrics.hasLyrics).toBe(true);
    expect(findPublishedSongLyricPosition(lyrics, 1.2)).toEqual({ measureIndex: 0, activeSegmentIndex: null });
    expect(findPublishedSongLyricPosition(lyrics, 1.8)).toEqual({ measureIndex: 0, activeSegmentIndex: null });
  });

  it("정확한 음표와 마디의 끝 경계를 다음 구간에 배정한다", () => {
    const lyrics = buildPublishedSongLyrics(draft([
      note("a", "하", 1), note("b", "나", 1), note("c", "둘", 2)
    ]));
    expect(findPublishedSongLyricPosition(lyrics, 0)).toEqual({ measureIndex: 0, activeSegmentIndex: 0 });
    expect(findPublishedSongLyricPosition(lyrics, .499999)).toEqual({ measureIndex: 0, activeSegmentIndex: 0 });
    expect(findPublishedSongLyricPosition(lyrics, .5)).toEqual({ measureIndex: 0, activeSegmentIndex: 1 });
    expect(findPublishedSongLyricPosition(lyrics, 1)).toEqual({ measureIndex: 0, activeSegmentIndex: 2 });
    expect(findPublishedSongLyricPosition(lyrics, 2)).toEqual({ measureIndex: 1, activeSegmentIndex: null });
  });

  it("BPM과 분수 박자 길이에 맞추며 저장되지 않은 BPM은 재생기의 96을 쓴다", () => {
    const source = draft([note("a", "셋", 1, 3), note("b", "잇", 2, 3)]);
    const slow = buildPublishedSongLyrics({ ...source, bpm: 60 });
    const fast = buildPublishedSongLyrics(source);
    expect(slow.lines[0].segments[1].startSeconds).toBeCloseTo(1 / 3);
    expect(fast.lines[0].segments[1].startSeconds).toBeCloseTo(1 / 6);
    expect(slow.durationSeconds).toBe(fast.durationSeconds * 2);
    expect(findPublishedSongLyricPosition(slow, 1 / 3)).toEqual({ measureIndex: 0, activeSegmentIndex: 1 });
    const fallback = buildPublishedSongLyrics({ ...source, bpm: undefined });
    expect(fallback.lines[0].endSeconds).toBe(60 / 96);
  });

  it("옛 문장형 가사를 실제 재생과 같은 규칙으로 유성 음표에 배분한다", () => {
    const source = draft([
      note("a"), note("rest", undefined, 1, 1, null), note("b"), note("c")
    ], { lyrics: [" 가 나\n다 ", ...Array(7).fill("")] });
    const lyrics = buildPublishedSongLyrics({ draft: source });
    expect(lyrics.lines[0].text).toBe("가나다");
    expect(lyrics.lines[0].segments.map(({ noteId, noteIndex, text, startSeconds }) =>
      [noteId, noteIndex, text, startSeconds])).toEqual([
      ["a", 0, "가", 0], ["b", 2, "나", 1], ["c", 3, "다", 1.5]
    ]);
    expect(source.measures[0].notes?.[0].lyric).toBeUndefined();
  });

  it("이미 음표별 가사가 있으면 오래된 문장 가사로 덮어쓰지 않는다", () => {
    const lyrics = buildPublishedSongLyrics(draft([
      note("a", "새"), note("b", "봄", 3)
    ], { lyrics: ["옛 가사", ...Array(7).fill("")] }));
    expect(lyrics.lines[0].text).toBe("새봄");
  });

  it("가사의 간격을 표시하고 공백만 부르는 구간은 강조하지 않는다", () => {
    const lyrics = buildPublishedSongLyrics(draft([
      note("a", "안 "), note("space", "\n\t"), note("b", " 녕"), note("c", "해")
    ]));
    expect(lyrics.lines[0].text).toBe("안   녕해");
    expect(lyrics.lines[0].text).toBe(lyrics.lines[0].segments.map((segment) => segment.text).join(""));
    expect(findPublishedSongLyricPosition(lyrics, .75)).toEqual({ measureIndex: 0, activeSegmentIndex: null });
    expect(findPublishedSongLyricPosition(lyrics, 1)).toEqual({ measureIndex: 0, activeSegmentIndex: 2 });
  });

  it("가사 없는 노래도 마디 시간과 현재 마디는 제공한다", () => {
    const lyrics = buildPublishedSongLyrics(draft([
      note("space", " "), note("rest", "가사", 1, 1, null), note("blank", undefined, 2)
    ]));
    expect(lyrics.hasLyrics).toBe(false);
    expect(lyrics.durationSeconds).toBe(16);
    expect(findPublishedSongLyricPosition(lyrics, 4.1)).toEqual({ measureIndex: 2, activeSegmentIndex: null });
  });

  it("재생 시작 전과 악보 종료 후 반주 여운에는 가사를 강조하지 않는다", () => {
    const lyrics = buildPublishedSongLyrics(draft([note("a", "끝", 4)]));
    expect(findPublishedSongLyricPosition(lyrics, -.08)).toBeNull();
    expect(findPublishedSongLyricPosition(lyrics, Number.NaN)).toBeNull();
    expect(findPublishedSongLyricPosition(lyrics, Number.POSITIVE_INFINITY)).toBeNull();
    expect(findPublishedSongLyricPosition(lyrics, lyrics.durationSeconds)).toBeNull();
    expect(findPublishedSongLyricPosition(lyrics, lyrics.durationSeconds + .25)).toBeNull();
  });

  it("박자표나 마디 빈칸으로 실제 음표 길이를 늘리거나 다른 마디 번호로 당기지 않는다", () => {
    const source = draft([note("short", "짧", 1)], { meter: { beats: 3, beatUnit: 4 } });
    const lyrics = buildPublishedSongLyrics({
      ...source,
      measures: source.measures.map((measure, index) => index === 1 ? { ...measure, notes: null } : measure)
    });
    expect(lyrics.lines[0].endSeconds).toBe(.5);
    expect(lyrics.lines[1]).toMatchObject({ measureIndex: 1, startSeconds: .5, endSeconds: .5, segments: [] });
    expect(findPublishedSongLyricPosition(lyrics, .5)).toEqual({ measureIndex: 2, activeSegmentIndex: null });
  });
});
