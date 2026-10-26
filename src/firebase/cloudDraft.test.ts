import { describe, expect, it, vi } from "vitest";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { SavedDraft } from "../music/draft";
import type { MusicVideoScene, ScenePoint } from "../video/musicVideoModel";
import { decodeCloudDraft, decodeCloudScenes, encodeCloudDraft, MAX_CLOUD_DRAFT_BYTES,
  MAX_CLOUD_EXPANDED_SCENE_BYTES, MAX_CLOUD_SCENE_BYTES } from "./cloudDraft";

vi.mock("lz-string", async (importOriginal) => {
  const original = await importOriginal<typeof import("lz-string")>();
  return { ...original, compressToEncodedURIComponent: original.compressToEncodedURIComponent,
    decompressFromEncodedURIComponent: vi.fn(original.decompressFromEncodedURIComponent) };
});

const scenes: readonly MusicVideoScene[] = [{
  id: "scene", background: "#ffffff", motion: "auto", endLyric: { measureIndex: 0, noteId: "note-0" },
  elements: [{ id: "stroke", tool: "brush", color: "#123456", width: 8,
    points: [[50, 50, .5], [100, 100, .75]] }]
}];
const draft: SavedDraft = {
  version: 1, updatedAt: 123, sourceHash: "", title: "장면 있는 노래", creator: "새봄", originalCreator: "새봄",
  presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano",
  lyrics: Array(8).fill("별"), showArrangement: true, musicVideoScenes: scenes,
  measures: Array.from({ length: 8 }, (_, index) => ({ candidateId: "custom", candidateName: "가락",
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "별" }] }))
};

function largeDrawing(): MusicVideoScene[] {
  const points: ScenePoint[] = Array.from({ length: 1200 }, (_, index) =>
    [123.12345678901234 + index / 10, 321.12345678901234 - index / 10, .1234567890123456]);
  return [{ ...scenes[0], elements: Array.from({ length: 20 }, (_, index) =>
    ({ ...scenes[0].elements[0], id: `element-${index}`, motion: "move-left", motionGroupId: "drawn-together", points })) }];
}

/** Construct a valid LZ stream whose phrase lengths grow 1, 2, 3, ... without allocating its expansion. */
function repeatedPhraseStream(phraseCount: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-";
  const output: string[] = [];
  let character = 0;
  let characterBits = 0;
  function writeBits(value: number, width: number) {
    for (let bit = 0; bit < width; bit++) {
      character = character * 2 + ((value >> bit) & 1);
      if (++characterBits === 6) {
        output.push(alphabet[character]);
        character = 0;
        characterBits = 0;
      }
    }
  }
  writeBits(0, 2);
  writeBits("x".charCodeAt(0), 8);
  let dictionarySize = 4;
  let enlargeIn = 4;
  let width = 3;
  for (let index = 0; index < phraseCount; index++) {
    writeBits(dictionarySize++, width);
    if (--enlargeIn === 0) {
      enlargeIn = 2 ** width;
      width++;
    }
  }
  writeBits(2, width);
  while (characterBits !== 0) writeBits(0, 1);
  return output.join("");
}

describe("클라우드 전용 그림 저장 형식", () => {
  it("악보 설정이 손상돼도 정상 그림만 별도로 추출하며 전체 악보는 허용하지 않는다", () => {
    const invalid = { ...draft, projectId: "saved-project", instrumentId: "removed-instrument", version: 99 };
    const { musicVideoScenes: _scenes, ...rest } = invalid;
    const sources = [invalid, { ...rest, musicVideoScenesJson: JSON.stringify(scenes) },
      { ...rest, musicVideoScenesLz: compressToEncodedURIComponent(JSON.stringify(scenes)) }];
    for (const source of sources) {
      expect(decodeCloudDraft(source)).toBeNull();
      expect(decodeCloudScenes(source)).toEqual(scenes);
    }
  });

  it("복구 그림 필드가 없는 자료와 정상적인 빈 그림을 구별한다", () => {
    expect(decodeCloudScenes({ version: 99 })).toBeNull();
    expect(decodeCloudScenes(null)).toBeNull();
    expect(decodeCloudScenes([])).toBeNull();
    expect(decodeCloudScenes({ musicVideoScenes: [] })).toEqual([]);
    expect(decodeCloudScenes({ musicVideoScenesJson: "[]" })).toEqual([]);
  });

  it("점 배열을 JSON 문자열로 바꾸고 읽을 때 원래 튜플을 복원한다", () => {
    const encoded = encodeCloudDraft({ ...draft, description: undefined });
    expect(encoded).not.toHaveProperty("musicVideoScenes");
    expect(encoded).not.toHaveProperty("description");
    expect(encoded.musicVideoScenesJson).toBe(JSON.stringify(scenes));
    expect(decodeCloudDraft(encoded)).toEqual(draft);
    expect(decodeCloudDraft(encoded)).not.toHaveProperty("musicVideoScenesJson");
    expect(draft.musicVideoScenes).toBe(scenes);
  });

  it("그림 필드가 없던 작품은 불필요한 필드 추가 없이 그대로 읽고 저장한다", () => {
    const { musicVideoScenes: _scenes, ...legacy } = draft;
    expect(encodeCloudDraft(legacy)).toEqual(legacy);
    expect(decodeCloudDraft(legacy)).toEqual(legacy);
    expect(decodeCloudDraft(legacy)).not.toHaveProperty("musicVideoScenes");
    expect(decodeCloudDraft({ ...legacy, musicVideoScenes: scenes })?.musicVideoScenes).toEqual(scenes);
  });

  it.each([
    "not-json", "null", "{}", JSON.stringify([{ ...scenes[0], motion: "invalid" }]),
    JSON.stringify([{ ...scenes[0], elements: [{ ...scenes[0].elements[0], points: [[-1, 50, .5]] }] }]),
    123, null
  ])("깨진 장면 데이터를 그림 없는 정상 작품으로 오인하지 않는다: %s", (encoded) => {
    const { musicVideoScenes: _scenes, ...legacy } = draft;
    expect(decodeCloudDraft({ ...legacy, musicVideoScenesJson: encoded })).toBeNull();
    expect(decodeCloudScenes({ ...legacy, musicVideoScenesJson: encoded })).toBeNull();
  });

  it("두 장면 저장 필드가 동시에 있는 모호한 문서는 거부한다", () => {
    expect(decodeCloudDraft({ ...draft, musicVideoScenesJson: JSON.stringify(scenes) })).toBeNull();
    expect(decodeCloudScenes({ ...draft, musicVideoScenesJson: JSON.stringify(scenes) })).toBeNull();
  });

  it("700KB가 넘는 그림은 압축하여 그룹 동작과 좌표를 손실 없이 복원한다", () => {
    const largeScenes = largeDrawing();
    const json = JSON.stringify(largeScenes);
    expect(new TextEncoder().encode(json).byteLength).toBeGreaterThan(MAX_CLOUD_SCENE_BYTES);
    const encoded = encodeCloudDraft({ ...draft, musicVideoScenes: largeScenes });
    expect(encoded).not.toHaveProperty("musicVideoScenesJson");
    expect(encoded).not.toHaveProperty("musicVideoScenes");
    expect(encoded.musicVideoScenesLz!.length).toBeLessThan(MAX_CLOUD_SCENE_BYTES);
    expect(decodeCloudDraft(encoded)?.musicVideoScenes).toEqual(largeScenes);
    expect(decodeCloudScenes({ ...encoded, instrumentId: "broken" })).toEqual(largeScenes);
    expect(decodeCloudDraft(encoded)).not.toHaveProperty("musicVideoScenesLz");
  });

  it("큰 그림을 압축하지 않은 기존 문자열이나 중첩 배열로 보낸 문서는 거부한다", () => {
    const largeScenes = largeDrawing();
    const json = JSON.stringify(largeScenes);
    const { musicVideoScenes: _scenes, ...legacy } = draft;
    expect(decodeCloudDraft({ ...legacy, musicVideoScenesJson: json })).toBeNull();
    expect(decodeCloudDraft({ ...legacy, musicVideoScenes: largeScenes })).toBeNull();
  });

  it("압축한 한글 개체 이름도 원문 그대로 복원한다", () => {
    const koreanScenes = [{ ...scenes[0], id: "빛나는 별", elements: [{ ...scenes[0].elements[0], id: "내가 그린 별" }] }];
    const { musicVideoScenes: _scenes, ...legacy } = draft;
    const encoded = { ...legacy, musicVideoScenesLz: compressToEncodedURIComponent(JSON.stringify(koreanScenes)) };
    expect(decodeCloudDraft(encoded)?.musicVideoScenes).toEqual(koreanScenes);
  });

  it("압축해도 문서 상한에 들어오지 않는 유효한 그림은 쓰기 전에 거부한다", () => {
    let seed = 1234;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const noisy = [{ ...scenes[0], elements: Array.from({ length: 20 }, (_, index) => ({ ...scenes[0].elements[0],
      id: `element-${index}`, points: Array.from({ length: 1200 }, (): ScenePoint => [next() * 960, next() * 540, next()]) })) }];
    expect(() => encodeCloudDraft({ ...draft, musicVideoScenes: noisy })).toThrow("클라우드에 저장할 수 없어요");
  });

  it.each(["", "not-json", "@invalid", "A".repeat(MAX_CLOUD_SCENE_BYTES + 1), null, 123])(
    "잘못되거나 너무 큰 압축 데이터는 복원하지 않는다 (%#)", (encoded) => {
      const { musicVideoScenes: _scenes, ...legacy } = draft;
      expect(decodeCloudDraft({ ...legacy, musicVideoScenesLz: encoded })).toBeNull();
      expect(decodeCloudScenes({ ...legacy, musicVideoScenesLz: encoded })).toBeNull();
    }
  );

  it.each(["not-json", "{}", JSON.stringify([{ ...scenes[0], motion: "invalid" }])])(
    "압축이 정상이더라도 잘못된 JSON 또는 장면은 거부한다 (%#)", (json) => {
      const { musicVideoScenes: _scenes, ...legacy } = draft;
      expect(decodeCloudDraft({ ...legacy, musicVideoScenesLz: compressToEncodedURIComponent(json) })).toBeNull();
    }
  );

  it("장면 필드가 압축 필드와 중복되거나 압축 스트림이 잘리면 거부한다", () => {
    const encoded = encodeCloudDraft({ ...draft, musicVideoScenes: largeDrawing() });
    expect(decodeCloudDraft({ ...encoded, musicVideoScenesJson: "[]" })).toBeNull();
    expect(decodeCloudDraft({ ...encoded, musicVideoScenes: [] })).toBeNull();
    expect(decodeCloudDraft({ ...encoded, musicVideoScenesLz: encoded.musicVideoScenesLz!.slice(0, -1) })).toBeNull();
    expect(decodeCloudDraft({ ...encoded, musicVideoScenesLz: `${encoded.musicVideoScenesLz}garbage` })).toBeNull();
  });

  it("과도하게 확장되는 압축 스트림은 실제 문자열 복원 전에 차단한다", () => {
    expect(decompressFromEncodedURIComponent(repeatedPhraseStream(2))).toBe("xxxxxx");
    const phraseCount = 4000;
    expect((phraseCount + 1) * (phraseCount + 2) / 2).toBeGreaterThan(MAX_CLOUD_EXPANDED_SCENE_BYTES);
    const bomb = repeatedPhraseStream(phraseCount);
    expect(bomb.length).toBeLessThan(MAX_CLOUD_SCENE_BYTES);
    vi.mocked(decompressFromEncodedURIComponent).mockClear();
    const { musicVideoScenes: _scenes, ...legacy } = draft;
    expect(decodeCloudDraft({ ...legacy, musicVideoScenesLz: bomb })).toBeNull();
    expect(decodeCloudScenes({ ...legacy, musicVideoScenesLz: bomb })).toBeNull();
    expect(decompressFromEncodedURIComponent).not.toHaveBeenCalled();
  });

  it("악보 본문까지 포함한 문서 용량도 Firestore 상한보다 작게 제한한다", () => {
    const hugeScore = { ...draft, description: "가".repeat(MAX_CLOUD_DRAFT_BYTES / 3) };
    expect(() => encodeCloudDraft(hugeScore)).toThrow("클라우드에 저장할 수 없어요");
    expect(decodeCloudDraft({ ...hugeScore, musicVideoScenes: undefined })).toBeNull();
  });

  it("새 쓰기 여유 용량보다 크던 이전 악보는 읽을 때 계속 지원한다", () => {
    const note = { ...draft.measures[0].notes![0], id: "n".repeat(120) };
    const noteCount = Math.ceil(930_000 / (JSON.stringify(note).length + 1));
    const legacy = { ...draft, measures: draft.measures.map((measure, index) =>
      index === 0 ? { ...measure, notes: Array(noteCount).fill(note) } : measure) };
    const bytes = new TextEncoder().encode(JSON.stringify(legacy)).byteLength;
    expect(bytes).toBeGreaterThan(MAX_CLOUD_DRAFT_BYTES);
    expect(bytes).toBeLessThan(1_048_576);
    expect(decodeCloudDraft(legacy)).toEqual(legacy);
  });

  it("동작 대상의 좌표 배열도 클라우드 JSON 안에서 손실 없이 저장하고 복원한다", () => {
    const planned: MusicVideoScene[] = [{ ...scenes[0], choreography: { version: 1, description: "손을 굽힌다.",
      actors: [{ id: "hand", name: "손", elementIds: ["stroke"],
        fixedPoint: [50, 50], movingPoint: [100, 100], endPoint: [120, 90] }],
      actions: [{ id: "bend", actorId: "hand", kind: "bend", startMeasureIndex: 0,
        startBeat: .5, durationBeats: 2, strength: 1 }] } }];
    const encoded = encodeCloudDraft({ ...draft, musicVideoScenes: planned });
    expect(typeof encoded.musicVideoScenesJson).toBe("string");
    expect(decodeCloudDraft(encoded)?.musicVideoScenes).toEqual(planned);
    const invalid = [{ ...planned[0], choreography: { ...planned[0].choreography!,
      actions: [{ ...planned[0].choreography!.actions[0], actorId: "missing" }] } }];
    expect(decodeCloudDraft({ ...encoded, musicVideoScenesJson: JSON.stringify(invalid) })).toBeNull();
    expect(() => encodeCloudDraft({ ...draft, musicVideoScenes: invalid })).toThrow("장면 정보");
  });
});
