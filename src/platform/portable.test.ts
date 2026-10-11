import { afterEach, describe, expect, it, vi } from "vitest";
import { publicAssetUrl } from "./portable";

afterEach(() => vi.unstubAllGlobals());

describe("portable public assets", () => {
  it("preserves public URLs in the regular web build", () => {
    expect(publicAssetUrl("/illustrations/guide-boy-v1.webp"))
      .toBe("/illustrations/guide-boy-v1.webp");
  });

  it("uses embedded bytes for images and audio in an extracted file build", () => {
    vi.stubGlobal("__PORTABLE_ASSETS__", {
      "/notation/rests/quarter.png": "data:image/png;base64,aW1hZ2U=",
      "/beat-samples/kick.wav": "data:audio/wav;base64,YXVkaW8="
    });

    expect(publicAssetUrl("/notation/rests/quarter.png"))
      .toBe("data:image/png;base64,aW1hZ2U=");
    expect(publicAssetUrl("/beat-samples/kick.wav"))
      .toBe("data:audio/wav;base64,YXVkaW8=");
    expect(publicAssetUrl("https://example.com/sound.mp3"))
      .toBe("https://example.com/sound.mp3");
    expect(publicAssetUrl("blob:recording"))
      .toBe("blob:recording");
  });
});
