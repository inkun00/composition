import { describe, expect, it } from "vitest";
import { karaokeGuideSettings } from "./karaokeGuide";

describe("녹음 가락 도움", () => {
  it("기본 도움은 마디 첫 음만 또렷하게 들려준다", () => {
    expect(karaokeGuideSettings("first-note")).toEqual({
      includeMelody: true,
      melodyMode: "first-note",
      volume: .42
    });
  });

  it("도움 없이 부르면 가락을 재생하지 않는다", () => {
    expect(karaokeGuideSettings("off").includeMelody).toBe(false);
  });

  it("작게 듣기는 전체 가락을 첫 음 도움보다 작게 재생한다", () => {
    const soft = karaokeGuideSettings("soft");
    expect(soft.melodyMode).toBe("all");
    expect(soft.volume).toBeLessThan(karaokeGuideSettings("first-note").volume);
  });
});
