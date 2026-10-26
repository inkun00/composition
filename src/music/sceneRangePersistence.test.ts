import { describe, expect, it } from "vitest";
import { encodeCloudDraft, decodeCloudDraft } from "../firebase/cloudDraft";
import { parseDraft, writeDraft, DRAFT_STORAGE_KEY, type SavedDraft } from "./draft";
import { getSceneRangeIssue } from "../video/musicVideoSceneRanges";
import { getMusicVideoMeasures } from "../video/musicVideoMeasures";

const draft: SavedDraft = {
  version: 1, updatedAt: 123, sourceHash: "", title: "구간 편집 중", creator: "작곡가", originalCreator: "작곡가",
  presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano",
  lyrics: Array(8).fill("별"), showArrangement: true,
  measures: Array.from({ length: 8 }, (_, index) => ({ candidateId: "custom", candidateName: "가락",
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "별" }] })),
  musicVideoScenes: [
    { id: "first", background: "#ffffff", motion: "move-right", startMeasureIndex: 0, endMeasureIndex: 4,
      endLyric: null, elements: [{ id: "line", tool: "line", color: "#123456", width: 8,
        points: [[10, 20, .5], [30, 40, .75]] }] },
    { id: "second", background: "#ffffff", motion: "bounce", startMeasureIndex: 3, endMeasureIndex: 7,
      endLyric: null, elements: [{ id: "line-2", tool: "line", color: "#abcdef", width: 8,
        points: [[30, 20, .5], [80, 40, .75]] }] }
  ]
};

describe("수정 중인 장면 겹침의 저장과 재개", () => {
  it("겹침이 있어도 브라우저 작품 저장은 받아들이고 다시 읽을 때 범위를 그대로 보존한다", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(writeDraft(storage, draft)).toBe(true);
    const loaded = parseDraft(values.get(DRAFT_STORAGE_KEY)!);
    expect(loaded?.musicVideoScenes).toEqual(draft.musicVideoScenes);
    const cues = getMusicVideoMeasures(draft.measures.map((measure) => ({ notes: measure.notes! })), 96);
    expect(getSceneRangeIssue(loaded!.musicVideoScenes!, cues)).toMatch(/4.*5.*겹|겹.*4.*5/);
  });

  it("프로젝트 클라우드의 JSON 인코딩도 충돌 장면이나 시작 마디를 버리지 않는다", () => {
    const encoded = encodeCloudDraft(draft);
    const loaded = decodeCloudDraft(encoded);
    expect(loaded?.musicVideoScenes).toEqual(draft.musicVideoScenes);
    expect(loaded?.musicVideoScenes?.map((scene) => scene.startMeasureIndex)).toEqual([0, 3]);
  });

  it("노래 끝을 넘는 시작 마디는 유효한 작품 기록으로 오인하지 않는다", () => {
    const invalid = { ...draft, musicVideoScenes: [{ ...draft.musicVideoScenes![0], startMeasureIndex: 64 }] };
    expect(parseDraft(JSON.stringify(invalid))).toBeNull();
  });
});
