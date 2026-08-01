import { describe, expect, it } from "vitest";
import { detectAudiverisTarget, findAudiverisAsset } from "./AudiverisInstaller";

describe("Audiveris 기기별 설치 도우미", () => {
  it("Windows, Mac, Linux와 모바일을 구분한다", () => {
    expect(detectAudiverisTarget("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectAudiverisTarget("Mozilla/5.0 (Macintosh; ARM64 Mac OS X)")).toBe("mac-arm");
    expect(detectAudiverisTarget("Mozilla/5.0 (Macintosh; Intel Mac OS X)", "MacIntel")).toBe("mac-unknown");
    expect(detectAudiverisTarget("Mozilla/5.0 (X11; Ubuntu; Linux x86_64)")).toBe("linux");
    expect(detectAudiverisTarget("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)")).toBe("mobile");
    expect(detectAudiverisTarget("Mozilla/5.0", "MacIntel", 5)).toBe("mobile");
  });

  it("최신 릴리스에서 선택한 기기에 맞는 일반 GUI 설치 파일만 고른다", () => {
    const assets = [
      { name: "Audiveris-5.11.0-windowsConsole-x86_64.msi", browser_download_url: "console" },
      { name: "Audiveris-5.11.0-windows-x86_64.msi", browser_download_url: "windows" },
      { name: "Audiveris-5.11.0-macosx-arm64.dmg", browser_download_url: "mac-arm" },
      { name: "Audiveris-5.11.0-macosx-x86_64.dmg", browser_download_url: "mac-intel" }
    ];

    expect(findAudiverisAsset(assets, "windows")?.browser_download_url).toBe("windows");
    expect(findAudiverisAsset(assets, "mac-arm")?.browser_download_url).toBe("mac-arm");
    expect(findAudiverisAsset(assets, "mac-intel")?.browser_download_url).toBe("mac-intel");
    expect(findAudiverisAsset(assets, "linux")).toBeNull();
  });
});
