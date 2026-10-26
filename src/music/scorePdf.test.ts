// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadScorePdfLibraries, saveScorePdf, waitForScorePdfPages } from "./scorePdf";

vi.mock("html2canvas", () => ({ default: vi.fn() }));
vi.mock("jspdf", () => ({ jsPDF: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(performance.now()));
    return 1;
  });
  document.body.innerHTML = "";
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

function sheet(ready: boolean) {
  document.body.innerHTML = `<div class="pdf-document" aria-hidden="true"><section data-pdf-page>
    <svg data-vex-score="true" data-vex-ready="${ready}"></svg></section></div>
    <div class="pdf-document" aria-hidden="false"><section data-pdf-page>다른 악보 미리보기</section></div>`;
}

describe("실제 악보 PDF 페이지 준비", () => {
  it("이미 준비한 PDF 모듈은 새 배포 후에도 같은 Promise로 재사용한다", async () => {
    const first = loadScorePdfLibraries();
    expect(loadScorePdfLibraries()).toBe(first);
    expect(await first).toHaveProperty("jsPDF");
  });

  it("다른 악보 미리보기를 제외하고 숨겨진 내보내기 페이지를 사용한다", async () => {
    sheet(true);
    const pages = await waitForScorePdfPages();
    expect(pages).toHaveLength(1);
    expect(pages[0].parentElement?.getAttribute("aria-hidden")).toBe("true");
  });

  it("페이지가 없는 상태를 성공으로 처리하지 않는다", async () => {
    await expect(waitForScorePdfPages()).rejects.toThrow("pdf-pages-missing");
  });

  it("악보 렌더가 끝나지 않은 페이지를 빈 PDF로 저장하지 않는다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    sheet(false);
    const pending = expect(waitForScorePdfPages(100)).rejects.toThrow("pdf-score-not-ready");
    await vi.runAllTimersAsync();
    await pending;
  });

  it("여러 페이지를 A4 크기로 저장하고 파일명의 특수 문자를 정리한다", async () => {
    const addPage = vi.fn();
    const addImage = vi.fn();
    const save = vi.fn();
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,image");
    const html2canvas = vi.fn(async () => ({ toDataURL }));
    const modules = {
      html2canvas,
      jsPDF: vi.fn(function () { return { addPage, addImage, save }; })
    } as unknown as Parameters<typeof saveScorePdf>[0];
    const pages = [document.createElement("section"), document.createElement("section")];
    await saveScorePdf(modules, pages, "별/빛", true);
    expect(html2canvas).toHaveBeenCalledTimes(2);
    expect(addPage).toHaveBeenCalledWith("a4", "portrait");
    expect(addImage).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith("별_빛-반주포함.pdf");
  });
});
