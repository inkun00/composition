import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHomrStatus,
  installHomrRuntime,
  recognizeWithHomr
} from "./homrClient";

afterEach(() => vi.unstubAllGlobals());

describe("homr 로컬 클라이언트", () => {
  it("로컬 실행 상태를 읽는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      available: true,
      runner: "uvx",
      platform: "win32",
      detail: "ready"
    }), { status: 200 })));

    await expect(getHomrStatus()).resolves.toMatchObject({ available: true, runner: "uvx" });
  });

  it("한 번의 요청으로 uv 실행환경을 준비한다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      available: true,
      runner: "uvx",
      platform: "win32",
      detail: "installed"
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(installHomrRuntime()).resolves.toMatchObject({ available: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/homr/install", expect.objectContaining({ method: "POST" }));
  });

  it("이미지를 MusicXML 파일로 변환한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<score-partwise/>", {
      status: 200,
      headers: { "Content-Type": "application/vnd.recordare.musicxml+xml" }
    })));
    const image = new File([new Uint8Array([1, 2, 3])], "노래.png", { type: "image/png" });

    const result = await recognizeWithHomr(image);

    expect(result.name).toBe("노래.musicxml");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(result);
    });
    expect(text).toContain("score-partwise");
  });

  it("서버 오류 코드를 사용자 오류로 전달한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: "HOMR_NOT_READY",
      message: "homr 준비가 필요해요."
    }), { status: 503, headers: { "Content-Type": "application/json" } })));

    await expect(getHomrStatus()).rejects.toMatchObject({
      code: "HOMR_NOT_READY",
      message: "homr 준비가 필요해요."
    });
  });
});
