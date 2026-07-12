import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("악기 샘플 파일", () => {
  it("MuseScore General SoundFont와 라이선스를 보관한다", () => {
    const soundfont = path.join(process.cwd(), "public", "soundfonts", "musescore-general", "MuseScore_General.sf2");
    const license = path.join(process.cwd(), "public", "soundfonts", "musescore-general", "MuseScore_General_License.md");
    const readme = path.join(process.cwd(), "public", "soundfonts", "musescore-general", "MuseScore_General_Readme.md");
    expect(existsSync(soundfont)).toBe(true);
    expect(statSync(soundfont).size).toBeGreaterThan(200_000_000);
    expect(readFileSync(license, "utf8")).toContain("MIT license");
    expect(readFileSync(readme, "utf8")).toContain("MuseScore_General");
  });
});
