import { describe, expect, it } from "vitest";
import {
  findSoundEffect,
  isSoundEffectId,
  SOUND_EFFECTS,
  soundEffectIconForName
} from "./soundEffects";

describe("효과음 이름 아이콘", () => {
  it.each([
    ["발걸음 1", "👣"],
    ["기계 1", "⚙️"],
    ["이어지는 공사장 장소", "🚧"],
    ["문 닫기 1", "🚪"],
    ["냄비 1", "🍲"],
    ["유리 1", "🪟"],
    ["종 1", "🔔"],
    ["바람 1", "🌬️"],
    ["천둥 1", "⚡"]
  ])("%s에 어울리는 아이콘을 고른다", (name, icon) => {
    expect(soundEffectIconForName(name, "❓")).toBe(icon);
  });

  it("화면에 제공하는 효과음 목록에도 이름별 아이콘을 반영한다", () => {
    const iconOf = (name: string) => SOUND_EFFECTS.find((effect) => effect.name === name)?.icon;

    expect(iconOf("발걸음 1")).toBe("👣");
    expect(iconOf("기계 1")).toBe("⚙️");
    expect(iconOf("문 1")).toBe("🚪");
  });
});

describe("효과음 목록 다양성", () => {
  it("반복 변형을 줄이고 서로 다른 장면의 소리를 제공한다", () => {
    expect(SOUND_EFFECTS).toHaveLength(197);
    expect(new Set(SOUND_EFFECTS.map((effect) => effect.id)).size).toBe(SOUND_EFFECTS.length);
    expect(new Set(SOUND_EFFECTS.map((effect) => `${effect.category}|${effect.name}`)).size)
      .toBe(SOUND_EFFECTS.length);

    const categories = new Set(SOUND_EFFECTS.map((effect) => effect.category));
    expect(categories).toEqual(new Set([
      "nature", "animal", "home", "school", "city",
      "body", "weather", "magic", "vehicle", "percussion"
    ]));
  });

  it("같은 이름 계열은 세 가지까지만 보여 준다", () => {
    const familyCounts = new Map<string, number>();
    for (const effect of SOUND_EFFECTS) {
      const familyName = effect.name.replace(/\s+\d+$/, "");
      const key = `${effect.category}|${familyName}`;
      familyCounts.set(key, (familyCounts.get(key) ?? 0) + 1);
    }

    for (const [family, count] of familyCounts) {
      expect(count, family).toBeLessThanOrEqual(family.endsWith("|놀이 소리") ? 4 : 3);
    }
  });

  it("새 음원은 CC0 출처 페이지를 기록한다", () => {
    const curated = SOUND_EFFECTS.filter((effect) => effect.source?.includes("/curated/"));
    expect(curated).toHaveLength(91);
    expect(curated.every((effect) =>
      effect.license === "CC0" && effect.credit && effect.sourcePage
    )).toBe(true);
  });

  it("삭제된 소리 ID가 든 예전 작품도 같은 계열의 대표 소리로 연다", () => {
    const retiredId = "cc0-sfx100v2-misc-37";
    expect(isSoundEffectId(retiredId)).toBe(true);
    expect(findSoundEffect(retiredId).id).not.toBe(retiredId);
    expect(findSoundEffect(retiredId).name).toContain("놀이 소리");
  });
});
