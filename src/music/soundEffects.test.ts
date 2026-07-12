import { describe, expect, it } from "vitest";
import { findSoundEffect, isSoundEffectId, SOUND_EFFECTS } from "./soundEffects";

describe("sound effect library", () => {
  it("provides unique real CC0 sample effects", () => {
    expect(SOUND_EFFECTS.length).toBe(200);
    expect(new Set(SOUND_EFFECTS.map((effect) => effect.id)).size).toBe(SOUND_EFFECTS.length);
    expect(new Set(SOUND_EFFECTS.map((effect) => effect.source)).size).toBe(SOUND_EFFECTS.length);
    expect(SOUND_EFFECTS.every((effect) => effect.source?.endsWith(".ogg"))).toBe(true);
    expect(SOUND_EFFECTS.every((effect) => effect.license === "CC0")).toBe(true);
  });

  it("keeps old shared scores compatible without showing duplicate aliases in the picker", () => {
    expect(isSoundEffectId("bell")).toBe(true);
    expect(findSoundEffect("bell").source).toBe("/sound-effects/cc0/bell_01.ogg");
    expect(SOUND_EFFECTS.some((effect) => effect.id === "bell")).toBe(false);
  });

  it("recognizes new open sample IDs", () => {
    expect(isSoundEffectId("cc0-bell-01")).toBe(true);
    expect(findSoundEffect("cc0-bell-01").name).toBe("종 1");
  });
});
