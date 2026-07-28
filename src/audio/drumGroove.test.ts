import { describe, expect, it } from "vitest";
import { createDrumGroove } from "./drumGroove";

describe("사용자가 만드는 반주 비트", () => {
  it("악기를 고르지 않으면 자동으로 드럼을 넣지 않는다", () => {
    expect(createDrumGroove("kpop", 4, { beats: 4, beatUnit: 4 }, [])).toHaveLength(0);
  });

  it("한 겹은 사용자가 고른 악기 하나만 연주한다", () => {
    const hits = createDrumGroove("children_song", 4, { beats: 4, beatUnit: 4 }, ["clap"]);
    expect(new Set(hits.map((hit) => hit.instrumentId))).toEqual(new Set(["clap"]));
    expect(hits.map((hit) => hit.offsetBeats)).toEqual([.5, 1.5, 2.5, 3.5]);
  });

  it("열아홉 악기는 같은 반주에서도 서로 다른 박자 문장을 연주한다", () => {
    const instruments = [
      "kick", "soft-kick", "snare", "clap", "woodblock", "shaker", "tambourine", "hihat",
      "floor-tom", "djembe", "conga", "cowbell", "triangle",
      "timpani", "cajon", "bongo", "claves", "ride", "guiro"
    ] as const;
    const patterns = instruments.map((instrumentId) =>
      createDrumGroove("children_song", 4, { beats: 4, beatUnit: 4 }, [instrumentId])
        .map((hit) => hit.offsetBeats).join(","));
    expect(new Set(patterns).size).toBe(instruments.length);
  });

  it("모든 반주 스타일에서 열아홉 악기의 기본 박자가 서로 구별된다", () => {
    const styles = [
      "comping", "arpeggio", "folk", "children_song", "kpop",
      "shuffle", "animation_ost", "bossa", "musical", "opera"
    ] as const;
    const instruments = [
      "kick", "soft-kick", "snare", "clap", "woodblock", "shaker", "tambourine", "hihat",
      "floor-tom", "djembe", "conga", "cowbell", "triangle",
      "timpani", "cajon", "bongo", "claves", "ride", "guiro"
    ] as const;
    styles.forEach((styleId) => {
      const patterns = instruments.map((instrumentId) =>
        createDrumGroove(styleId, 4, { beats: 4, beatUnit: 4 }, [instrumentId])
          .map((hit) => hit.offsetBeats).join(","));
      expect(new Set(patterns).size, styleId).toBe(instruments.length);
    });
  });

  it("비슷한 역할의 악기도 박자와 강약이 함께 달라진다", () => {
    const snare = createDrumGroove("children_song", 4, { beats: 4, beatUnit: 4 }, ["snare"]);
    const clap = createDrumGroove("children_song", 4, { beats: 4, beatUnit: 4 }, ["clap"]);
    expect(snare.map((hit) => hit.offsetBeats)).toEqual([1, 3]);
    expect(clap.map((hit) => hit.offsetBeats)).toEqual([.5, 1.5, 2.5, 3.5]);
    expect(snare.map((hit) => hit.velocity)).not.toEqual(clap.map((hit) => hit.velocity));
  });

  it("세 겹은 낮은 박자·가운데 박자·잔박자를 나눠 연주한다", () => {
    const hits = createDrumGroove(
      "kpop", 4, { beats: 4, beatUnit: 4 }, ["kick", "clap", "hihat"]);
    expect(new Set(hits.map((hit) => hit.instrumentId)))
      .toEqual(new Set(["kick", "clap", "hihat"]));
    expect(hits.filter((hit) => hit.instrumentId === "kick").length).toBeGreaterThan(1);
    expect(hits.filter((hit) => hit.instrumentId === "hihat").length)
      .toBeGreaterThan(hits.filter((hit) => hit.instrumentId === "clap").length);
  });

  it("4마디 끝에는 고른 가운데 악기로 전환 연주를 더한다", () => {
    const selected = ["soft-kick", "woodblock"] as const;
    expect(createDrumGroove("folk", 4, undefined, selected, true).length)
      .toBeGreaterThan(createDrumGroove("folk", 4, undefined, selected).length);
  });

  it("6/8박자에서도 모든 소리가 마디 안에 놓인다", () => {
    const hits = createDrumGroove(
      "bossa", 3, { beats: 6, beatUnit: 8 }, ["soft-kick", "snare", "shaker"]);
    expect(hits.every((hit) => hit.offsetBeats >= 0 && hit.offsetBeats < 3)).toBe(true);
    expect(hits.some((hit) => hit.offsetBeats === 1.5)).toBe(true);
  });
});
