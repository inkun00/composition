// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { createPracticeMeasures } from "./practiceModel";
import {
  PRACTICE_STORAGE_KEY,
  emptyPracticeDraft,
  readPracticeDraft,
  writePracticeDraft,
  type PracticeDraft
} from "./practiceStorage";

function storedExample(): PracticeDraft {
  const draft = emptyPracticeDraft();
  draft.title = "친구에게 부르는 노래";
  draft.bpm = 120;
  draft.melodyInstrumentId = "flute";
  draft.rhythmInstrumentId = "beat:triangle";
  draft.measures[0] = {
    id: "original-first",
    lyric: "안 녕, 친구!",
    chord: "F",
    notes: [
      { id: "first", pitch: 60, duration: rational(3, 2), dotted: true, lyric: "안" },
      { id: "breath", pitch: null, duration: rational(1, 2) },
      { id: "second", pitch: 65, duration: rational(1, 2), lyric: "녕" },
      { id: "third", pitch: 69, duration: rational(1, 2), lyric: "친" },
      { id: "fourth", pitch: 72, duration: rational(1), lyric: "구" }
    ]
  };
  draft.measures[1] = {
    id: "original-second",
    lyric: "",
    chord: "Am",
    notes: [{ id: "next", pitch: 64, duration: rational(4) }]
  };
  return draft;
}

function saveRaw(value: unknown) {
  localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(value));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("연습 초안 저장과 복원", () => {
  it("다양한 7화음과 연결 가능한 화음 선택을 새로고침 후에도 복원한다", () => {
    const draft = storedExample();
    draft.measures = ["Cmaj7", "Fmaj7", "Dm7", "G7"].map((chord, index) => ({
      ...draft.measures[index % 2], id: `expanded-${index}`, chord,
      notes: draft.measures[index % 2].notes.map((note) => ({ ...note, id: `${note.id}-${index}` }))
    }));
    writePracticeDraft(draft);
    expect(readPracticeDraft().measures.map((measure) => measure.chord)).toEqual(["Cmaj7", "Fmaj7", "Dm7", "G7"]);
  });

  it("후보에서 벗어난 저장 화음만 복구하고 음표·가사·길이는 그대로 둔다", () => {
    const draft = storedExample();
    draft.measures[0].chord = "Dm";
    draft.measures[1].chord = "F";
    draft.rhythmLayers = [{ id: "harmony-layer", instrumentId: "beat:clap", measures: draft.measures.map((measure) => ({
      ...measure, notes: measure.notes.map((note) => ({ ...note, id: `${note.id}-layer` }))
    })) }];
    writePracticeDraft(draft);
    const restored = readPracticeDraft();
    expect(restored.measures.map((measure) => measure.chord)).toEqual(["Dm", "G"]);
    expect(restored.rhythmLayers[0].measures.map((measure) => measure.chord)).toEqual(["Dm", "G"]);
    const noteContent = (notes: readonly NoteEvent[]) => notes.map((note) => ({
      id: note.id, pitch: note.pitch, duration: note.duration,
      dotted: Boolean(note.dotted), lyric: note.lyric ?? ""
    }));
    expect(restored.measures.map((measure) => noteContent(measure.notes))).toEqual(draft.measures.map((measure) => noteContent(measure.notes)));
    expect(restored.measures.map((measure) => measure.lyric)).toEqual(draft.measures.map((measure) => measure.lyric));
  });

  it("처음 방문하면 두 마디와 사용할 수 있는 기본 악기를 준비한다", () => {
    const draft = readPracticeDraft();
    expect(draft.measures).toHaveLength(2);
    expect(draft.measures.every((measure) => measure.notes.length === 0)).toBe(true);
    expect(draft.meter).toEqual({ beats: 4, beatUnit: 4 });
    expect(draft.melodyInstrumentId).toBe("acoustic_grand_piano");
    expect(draft.rhythmInstrumentId).toBe("beat:woodblock");
  });

  it("점음표의 실제 길이, 쉼표, 음높이, 음표 순서와 가사 원문을 복원한다", () => {
    const original = storedExample();
    expect(writePracticeDraft(original)).toBe(true);
    const restored = readPracticeDraft();
    expect(restored.title).toBe(original.title);
    expect(restored.bpm).toBe(120);
    expect(restored.melodyInstrumentId).toBe("flute");
    expect(restored.rhythmInstrumentId).toBe("beat:triangle");
    expect(restored.measures.map((measure) => measure.chord)).toEqual(["F", "Am"]);
    expect(restored.measures[0].lyric).toBe("안 녕, 친구!");
    expect(restored.measures[0].notes.map((note) => ({
      id: note.id,
      pitch: note.pitch,
      duration: note.duration,
      dotted: Boolean(note.dotted),
      lyric: note.lyric ?? ""
    }))).toEqual(original.measures[0].notes.map((note) => ({
      id: note.id,
      pitch: note.pitch,
      duration: note.duration,
      dotted: Boolean(note.dotted),
      lyric: note.lyric ?? ""
    })));
    expect(restored.measures[1].notes[0]).toMatchObject({ id: "next", pitch: 64, duration: rational(4) });
    expect(new Set(restored.measures.map((measure) => measure.id)).size).toBe(2);
  });

  it("가사가 음표보다 길어도 원문을 버리지 않아 다음 마디로 옮길 수 있다", () => {
    const draft = emptyPracticeDraft();
    draft.measures[0].lyric = "가나다라마바사아자";
    draft.measures[0].notes = [{ id: "only", pitch: 60, duration: rational(4), lyric: "가" }];
    writePracticeDraft(draft);
    const restored = readPracticeDraft();
    expect(restored.measures[0].lyric).toBe("가나다라마바사아자");
    expect(restored.measures[0].notes).toHaveLength(1);
    expect(restored.measures[0].notes[0].lyric).toBe("가");
  });

  it("음표마다 넣은 가사의 빈칸을 새로고침 후에도 같은 위치에 복원한다", () => {
    const draft = emptyPracticeDraft();
    draft.measures[0].lyric = "짝별아";
    draft.measures[0].notes = ["", "짝", "별", "아"].map((lyric, index) => ({
      id: `placed-${index}`, pitch: 60, duration: rational(1), lyric
    }));
    writePracticeDraft(draft);
    expect(readPracticeDraft().measures[0].notes.map((note) => note.lyric)).toEqual(["", "짝", "별", "아"]);
  });

  it("음표별 가사가 없는 이전 초안에는 원문을 차례대로 붙인다", () => {
    const draft = emptyPracticeDraft();
    draft.measures[0].lyric = "안녕";
    draft.measures[0].notes = [0, 1].map((index) => ({
      id: `legacy-${index}`, pitch: 60, duration: rational(2)
    }));
    writePracticeDraft(draft);
    expect(readPracticeDraft().measures[0].notes.map((note) => note.lyric)).toEqual(["안", "녕"]);
  });

  it("중간 음표 삭제 후 새 음표에 붙인 가사를 기존 음표 위치와 함께 복원한다", () => {
    const draft = emptyPracticeDraft();
    draft.measures[0].lyric = "반짝별아";
    draft.measures[0].notes = ["반", "별", "아", "짝"].map((lyric, index) => ({
      id: `replaced-${index}`, pitch: 60, duration: rational(1), lyric
    }));
    writePracticeDraft(draft);
    expect(readPracticeDraft().measures[0].notes.map((note) => note.lyric)).toEqual(["반", "별", "아", "짝"]);
  });

  it.each(["woodblock", "beat:woodblock"])("리듬 악기 %s의 선율 또는 타악기 구분을 유지한다", (id) => {
    const draft = storedExample();
    draft.rhythmInstrumentId = id;
    saveRaw(draft);
    expect(readPracticeDraft().rhythmInstrumentId).toBe(id);
  });

  it("리듬용 선율 악기와 가락용 옛 악기 이름을 함께 복원한다", () => {
    const draft = storedExample();
    draft.rhythmInstrumentId = "marimba";
    draft.melodyInstrumentId = "guitar";
    saveRaw(draft);
    expect(readPracticeDraft()).toMatchObject({
      rhythmInstrumentId: "marimba",
      melodyInstrumentId: "acoustic_guitar_nylon"
    });
  });

  it.each(["{broken", "null", "[]", "42", '{"version":2,"measures":[]}'])("손상된 저장값 %s를 새 초안으로 복구한다", (raw) => {
    localStorage.setItem(PRACTICE_STORAGE_KEY, raw);
    expect(readPracticeDraft()).toEqual(emptyPracticeDraft());
  });

  it.each([
    { numerator: 1, denominator: 0 },
    { numerator: -1, denominator: 2 },
    { numerator: 1, denominator: 3 },
    { numerator: 1.5, denominator: 1 }
  ])("음표 길이가 잘못 저장되면 재생 가능한 새 초안으로 복구한다", (duration) => {
    const draft = storedExample();
    draft.measures[0].notes = [{ id: "bad", pitch: 60, duration }];
    saveRaw(draft);
    expect(readPracticeDraft()).toEqual(emptyPracticeDraft());
  });

  it("악보에서 만든 반음과 샤프·플랫·제자리표를 가사 및 리듬과 함께 복원한다", () => {
    const draft = storedExample();
    draft.measures[0].lyric = "도레미";
    draft.measures[0].notes = [
      { id: "sharp", pitch: 61, accidental: "sharp", duration: rational(1), lyric: "도" },
      { id: "flat", pitch: 63, accidental: "flat", duration: rational(1), lyric: "레" },
      { id: "natural", pitch: 64, accidental: "natural", duration: rational(2), lyric: "미" }
    ];
    writePracticeDraft(draft);
    expect(readPracticeDraft().measures[0].notes).toEqual(draft.measures[0].notes.map((note) => ({ ...note, dotted: undefined })));
  });

  it.each([59, 73, 60.5, 999, undefined])("연습 음역에 없는 음높이 %s를 손상값으로 판단한다", (pitch) => {
    const draft = storedExample();
    draft.measures[0].notes = [{ id: "bad", pitch, duration: rational(1) } as NoteEvent];
    saveRaw(draft);
    expect(readPracticeDraft()).toEqual(emptyPracticeDraft());
  });

  it("다른 마디에 중복된 음표 ID가 있으면 잘못된 선택이나 재생을 방지한다", () => {
    const draft = storedExample();
    draft.measures[1].notes = [{ id: "first", pitch: 67, duration: rational(4) }];
    saveRaw(draft);
    expect(readPracticeDraft()).toEqual(emptyPracticeDraft());
  });

  it("박자나 마디 수가 손상되면 복구하고 빠르기와 악기 오류는 사용 가능한 값으로 바꾼다", () => {
    const unsupported = { ...storedExample(), meter: { beats: 7, beatUnit: 8 } };
    saveRaw(unsupported);
    expect(readPracticeDraft()).toEqual(emptyPracticeDraft());
    saveRaw({ ...storedExample(), measures: [] });
    expect(readPracticeDraft()).toEqual(emptyPracticeDraft());
    saveRaw({ ...storedExample(), bpm: 900, melodyInstrumentId: "missing", rhythmInstrumentId: "beat:missing" });
    const restored = readPracticeDraft();
    expect(restored.bpm).toBe(emptyPracticeDraft().bpm);
    expect(restored.melodyInstrumentId).toBe("acoustic_grand_piano");
    expect(restored.rhythmInstrumentId).toBe("acoustic_grand_piano");
    expect(restored.measures[0].lyric).toBe("안 녕, 친구!");
  });

  it("저장 공간을 읽거나 쓰지 못해도 예외 없이 초안을 사용할 수 있다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readPracticeDraft()).toEqual(emptyPracticeDraft());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(writePracticeDraft(storedExample())).toBe(false);
  });

  it("추가 악보 필드가 없는 이전 초안은 첫 악보를 보존하고 빈 추가 목록으로 복원한다", () => {
    const { rhythmLayers, ...legacy } = storedExample();
    void rhythmLayers;
    saveRaw(legacy);
    const restored = readPracticeDraft();
    expect(restored.rhythmLayers).toEqual([]);
    expect(restored.measures[0].lyric).toBe("안 녕, 친구!");
    expect(restored.measures[0].notes[0].id).toBe("first");
  });

  it("추가 악보의 악기와 음표별 빈 가사칸을 다른 악보와 독립적으로 복원한다", () => {
    const draft = storedExample();
    const measures = createPracticeMeasures(2);
    measures[0] = {
      ...measures[0], lyric: "짝", notes: [
        { id: "extra-empty", pitch: 60, duration: rational(2), lyric: "" },
        { id: "extra-word", pitch: 60, duration: rational(2), lyric: "짝" }
      ]
    };
    draft.rhythmLayers = [{ id: "layer-two", instrumentId: "beat:clap", measures }];
    writePracticeDraft(draft);
    const restored = readPracticeDraft();
    expect(restored.rhythmLayers).toHaveLength(1);
    expect(restored.rhythmLayers[0].instrumentId).toBe("beat:clap");
    expect(restored.rhythmLayers[0].measures[0].notes.map((note) => note.lyric)).toEqual(["", "짝"]);
    expect(restored.measures[0].notes[0].lyric).toBe("안");
    expect(restored.rhythmLayers[0].measures[0].id).not.toBe(restored.measures[0].id);
  });

  it.each([
    { id: "bad", instrumentId: "beat:missing", measures: createPracticeMeasures(2) },
    { id: "bad", instrumentId: "flute", measures: createPracticeMeasures(1) },
    { id: "primary", instrumentId: "flute", measures: createPracticeMeasures(2) },
    { id: "bad", instrumentId: "flute", measures: [null, null] },
    null
  ])("손상된 추가 악보를 버리면서 첫 악보와 다른 추가 악보는 보존한다", (broken) => {
    const draft = storedExample();
    saveRaw({ ...draft, rhythmLayers: [broken, { id: "good", instrumentId: "marimba", measures: createPracticeMeasures(2) }] });
    const restored = readPracticeDraft();
    expect(restored.measures[0].notes[0].id).toBe("first");
    expect(restored.rhythmLayers).toHaveLength(1);
    expect(restored.rhythmLayers[0]).toMatchObject({ id: "good", instrumentId: "marimba" });
  });

  it("다른 악보와 중복된 음표 ID를 가진 추가 악보만 제외한다", () => {
    const draft = storedExample();
    const duplicate = createPracticeMeasures(2);
    duplicate[0].notes = [{ id: "first", pitch: 60, duration: rational(4) }];
    saveRaw({ ...draft, rhythmLayers: [
      { id: "duplicate", instrumentId: "beat:clap", measures: duplicate },
      { id: "good", instrumentId: "beat:shaker", measures: createPracticeMeasures(2) }
    ] });
    const restored = readPracticeDraft();
    expect(restored.measures[0].notes[0].id).toBe("first");
    expect(restored.rhythmLayers.map((layer) => layer.id)).toEqual(["good"]);
  });

  it("최대 두 개의 추가 악보만 복원하고 동일한 추가 악보 ID를 중복시키지 않는다", () => {
    const draft = storedExample();
    const layer = { id: "extra", instrumentId: "beat:clap", measures: createPracticeMeasures(2) };
    saveRaw({ ...draft, rhythmLayers: [layer, { ...layer, id: "third" }, { ...layer, id: "fourth" }] });
    expect(readPracticeDraft().rhythmLayers.map((score) => score.id)).toEqual(["extra", "third"]);
    saveRaw({ ...draft, rhythmLayers: [layer, layer] });
    expect(readPracticeDraft().rhythmLayers.map((score) => score.id)).toEqual(["extra"]);
  });
});
