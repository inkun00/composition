import { describe, expect, it } from "vitest";
import {
  accompanimentTrackSettings,
  isValidAccompanimentTrackMix,
  normalizeAccompanimentTrackMix
} from "./accompanimentMix";
import { draftFingerprint, readDraft, type SavedDraft } from "./draft";
import { findDraftSaveIssues } from "./draftValidation";
import { decodeSharedComposition, encodeSharedComposition, type SharedComposition } from "./share";

const mix = {
  acoustic_grand_piano: { volume: 65, muted: false },
  flute: { volume: 0, muted: true }
};

const composition: SharedComposition = {
  version: 1, title: "악기 균형", creator: "새봄", originalCreator: "새봄", presetId: "H001",
  meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano",
  accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["acoustic_grand_piano", "flute"],
  accompanimentTrackMix: mix, lyrics: Array(8).fill(""),
  measures: Array.from({ length: 8 }, (_, index) => ({
    candidateName: "가락", notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 } }]
  }))
};

const draft: SavedDraft = {
  ...composition, updatedAt: 123, sourceHash: "", showArrangement: true,
  measures: composition.measures.map((measure) => ({ ...measure, candidateId: "custom" }))
};

describe("악기별 반주 믹스 저장과 복원", () => {
  it("옛 곡은 기본 음량으로 열고 별칭 악기의 설정도 같은 실제 악기에 적용한다", () => {
    expect(accompanimentTrackSettings(undefined, "piano")).toEqual({ volume: 100, muted: false });
    expect(accompanimentTrackSettings({ piano: { volume: 30, muted: true } }, "acoustic_grand_piano"))
      .toEqual({ volume: 30, muted: true });
    expect(normalizeAccompanimentTrackMix({ piano: mix.acoustic_grand_piano, flute: mix.flute }, ["piano"]))
      .toEqual({ acoustic_grand_piano: mix.acoustic_grand_piano });
  });

  it("영 음량과 음소거를 포함한 설정을 초안과 공유 링크에서 그대로 복원한다", () => {
    expect(readDraft({ getItem: () => JSON.stringify(draft) })?.accompanimentTrackMix).toEqual(mix);
    for (const structureTemplateId of [undefined, "repeat"] as const) {
      const shared = decodeSharedComposition(encodeSharedComposition({ ...composition, structureTemplateId }));
      expect(shared?.accompanimentTrackMix).toEqual(mix);
      expect(shared?.structureTemplateId).toBe(structureTemplateId);
    }
    const old = { ...composition, accompanimentTrackMix: undefined };
    expect(decodeSharedComposition(encodeSharedComposition(old))?.accompanimentTrackMix).toBeUndefined();
    expect(findDraftSaveIssues(draft)).toEqual([]);
    expect(draftFingerprint(draft)).not.toBe(draftFingerprint({ ...draft, accompanimentTrackMix: {} }));
  });

  it("오염된 음량·음소거·악기 데이터가 저장이나 공유로 흘러가지 않는다", () => {
    for (const settings of [
      { volume: -1, muted: false }, { volume: 151, muted: false },
      { volume: .5, muted: false }, { volume: NaN, muted: false },
      { volume: 100, muted: "false" }, { volume: 100 }
    ]) {
      const invalid = { flute: settings };
      expect(isValidAccompanimentTrackMix(invalid)).toBe(false);
      expect(readDraft({ getItem: () => JSON.stringify({ ...draft, accompanimentTrackMix: invalid }) })).toBeNull();
      expect(decodeSharedComposition(encodeSharedComposition({ ...composition,
        accompanimentTrackMix: invalid as typeof mix }))).toBeNull();
    }
    expect(isValidAccompanimentTrackMix({ nonexistent: { volume: 100, muted: false } })).toBe(false);
    expect(isValidAccompanimentTrackMix([])).toBe(false);
  });
});
