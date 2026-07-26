import { describe, expect, it } from "vitest";
import { SOUND_EFFECTS, soundEffectIconForName } from "./soundEffects";

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
