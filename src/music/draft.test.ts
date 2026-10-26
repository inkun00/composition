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
  structureTemplateId: "repeat",
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
    expect(readDraft({ getItem: () => JSON.stringify({ ...draft, structureTemplateId: "aaba" }) })).toBeNull();
    expect(readDraft({ getItem: () => JSON.stringify({ ...draft, structureTemplateId: undefined }) })?.songLength).toBe(8);
  });

  it("직접 설정한 21마디와 기존 20마디를 모두 다시 읽는다", () => {
    for (const length of [20, 21, 48]) {
      const saved = { ...draft, songLength: length, structureTemplateId: undefined,
        lyrics: Array(length).fill("랄라"), measures: Array.from({ length }, (_, index) => draft.measures[index % 8]) };
      expect(readDraft({ getItem: () => JSON.stringify(saved) })?.songLength).toBe(length);
    }
  });

  it("가져온 마디의 음표가 32개를 넘어도 다시 읽는다", () => {
    const manyNotes = Array.from({ length: 64 }, (_, index) => ({
      id: `note-${index}`, pitch: 60, duration: { numerator: 1, denominator: 16 }
    }));
    const imported = { ...draft, measures: draft.measures.map((measure, index) =>
      index === 0 ? { ...measure, notes: manyNotes } : measure) };
    expect(readDraft({ getItem: () => JSON.stringify(imported) })?.measures[0].notes).toHaveLength(64);
  });

  it("가져온 악보의 화음과 조표·임시표를 저장하고 다시 읽는다", () => {
    const imported = { ...draft, measures: draft.measures.map((measure, index) => index === 0 ? {
      ...measure, chords: ["F#m7"], keyFifths: 1,
      notes: [{ id: "imported-note", pitch: 66, accidental: "sharp" as const,
        duration: { numerator: 3, denominator: 1 }, lyric: "랄" }]
    } : measure) };
    expect(readDraft({ getItem: () => JSON.stringify(imported) })?.measures[0]).toMatchObject({
      chords: ["F#m7"], keyFifths: 1, notes: [expect.objectContaining({ accidental: "sharp" })]
    });
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

  it("뮤직비디오의 그림과 가사 끝 위치를 작품에 함께 저장하고 복원한다", () => {
    const scenes: SavedDraft["musicVideoScenes"] = [{
      id: "scene-one", background: "#ffffff", motion: "auto",
      endLyric: { measureIndex: 0, noteId: "note-0" },
      elements: [{ id: "sun", tool: "ellipse", color: "#ffcc00", width: 5,
        points: [[120, 80, .5], [240, 180, .5]] }]
    }];
    let saved = "";
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
    expect(writeDraft(storage, { ...draft, musicVideoScenes: scenes })).toBe(true);
    expect(readDraft(storage)?.musicVideoScenes).toEqual(scenes);
    expect(readDraft({ getItem: () => JSON.stringify(draft) })?.musicVideoScenes).toBeUndefined();
  });

  it("잘못된 그림이나 지나치게 많은 장면이 포함된 작품 파일은 거부한다", () => {
    const scene = { id: "scene-one", background: "#ffffff", motion: "auto", endLyric: null,
      elements: [{ id: "stroke", tool: "brush", color: "#123456", width: 4, points: [[-1, 30, .5]] }] };
    expect(readDraft({ getItem: () => JSON.stringify({ ...draft, musicVideoScenes: [scene] }) })).toBeNull();
    const manyScenes = Array.from({ length: 25 }, (_, index) => ({ ...scene, id: `scene-${index}`, elements: [] }));
    expect(readDraft({ getItem: () => JSON.stringify({ ...draft, musicVideoScenes: manyScenes }) })).toBeNull();
  });

  it("부분 동작의 대상·제어점·가사 박자를 브라우저 저장에서 복원한다", () => {
    const scene = { id: "scene", background: "#ffffff", motion: "auto", endLyric: null, endMeasureIndex: 0,
      elements: [{ id: "hand", tool: "brush", color: "#123456", width: 4, points: [[10, 30, .5]] }],
      choreography: { version: 1, description: "손으로 누르기", actors: [{ id: "actor", name: "손", elementIds: ["hand"],
        fixedPoint: [10, 30], movingPoint: [20, 40], endPoint: [30, 50] }], actions: [{ id: "action", actorId: "actor",
        kind: "press", startMeasureIndex: 0, startBeat: .5, durationBeats: 1, strength: .8 }] } };
    const stored = { ...draft, musicVideoScenes: [scene] };
    expect(readDraft({ getItem: () => JSON.stringify(stored) })?.musicVideoScenes).toEqual([scene]);
    const invalid = { ...scene, choreography: { ...scene.choreography,
      actors: [{ ...scene.choreography.actors[0], elementIds: ["deleted"] }] } };
    expect(readDraft({ getItem: () => JSON.stringify({ ...stored, musicVideoScenes: [invalid] }) })).toBeNull();
  });
});
