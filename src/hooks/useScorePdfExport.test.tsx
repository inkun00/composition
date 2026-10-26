// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SharedComposition } from "../music/share";
import { useScorePdfExport } from "./useScorePdfExport";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), pages: vi.fn(), qr: vi.fn(), vex: vi.fn(), status: vi.fn() }));
vi.mock("../music/scorePdf", () => ({ loadScorePdfLibraries: mocks.load, saveScorePdf: mocks.save, waitForScorePdfPages: mocks.pages }));
vi.mock("../music/vexflow", () => ({ loadVexFlow: mocks.vex }));
vi.mock("../firebase/qrSongs", () => ({ saveQrSong: mocks.qr }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const song: SharedComposition = {
  version: 1, title: "별빛 노래", creator: "작곡가", originalCreator: "작곡가", presetId: "H001",
  songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "piano",
  lyrics: Array(8).fill("별"), measures: Array.from({ length: 8 }, (_, index) => ({ candidateName: "가락",
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 }, lyric: "별" }], chords: ["C"] }))
};
let root: Root;
let host: HTMLDivElement;
let controller: ReturnType<typeof useScorePdfExport>;
const page = document.createElement("div");
const libraries = { html2canvas: vi.fn(), jsPDF: vi.fn() };

function Harness({ ready = false, title = song.title, complete = true }: { ready?: boolean; title?: string; complete?: boolean }) {
  controller = useScorePdfExport({ title, creator: song.creator, ready, composition: () => complete ? song : null, onStatus: mocks.status });
  return null;
}
function render(props: Parameters<typeof Harness>[0] = {}) { act(() => root.render(<Harness {...props} />)); }
async function exportPdf(include = false) { await act(async () => { await controller.exportPdf(include); }); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.load.mockResolvedValue(libraries);
  mocks.pages.mockResolvedValue([page]);
  mocks.save.mockResolvedValue(undefined);
  mocks.qr.mockResolvedValue("qr-song-id");
  mocks.vex.mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("악보 PDF 만들기와 모듈 복구", () => {
  it("필수 PDF 모듈을 먼저 준비하고 QR·악보 렌더를 마친 뒤 선택한 레이아웃을 저장한다", async () => {
    render();
    await exportPdf(true);
    expect(mocks.load.mock.invocationCallOrder[0]).toBeLessThan(mocks.qr.mock.invocationCallOrder[0]);
    expect(mocks.vex.mock.invocationCallOrder[0]).toBeLessThan(mocks.pages.mock.invocationCallOrder[0]);
    expect(mocks.save).toHaveBeenCalledWith(libraries, [page], song.title, true);
    expect(controller.pdfIncludeAccompaniment).toBe(true);
    expect(controller.pdfPlaybackUrl).toContain("song=qr-song-id");
    expect(controller.exportingPdf).toBe(false);
    expect(controller.recoveryOpen).toBe(false);
  });

  it("필수 PDF 파일 404는 QR 요청 전에 복구 안내를 열고 재생성 잠금을 해제한다", async () => {
    mocks.load.mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module: /assets/jspdf-old.js"));
    render();
    await exportPdf();
    expect(mocks.qr).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(controller.recoveryOpen).toBe(true);
    expect(controller.exportingPdf).toBe(false);
    act(() => controller.closeRecovery());
    expect(controller.recoveryOpen).toBe(false);
  });

  it("오래된 QR 파일 오류를 임베디드 QR 길이 오류로 바꾸지 않는다", async () => {
    mocks.qr.mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module: /assets/qrSongs-old.js"));
    render();
    await exportPdf();
    expect(controller.recoveryOpen).toBe(true);
    expect(controller.pdfPlaybackUrl).toBe("");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.status.mock.lastCall![0]).toContain("최신 화면");
  });

  it("일반 QR 서비스 실패에는 노래 데이터가 담긴 QR로 PDF를 계속 만든다", async () => {
    mocks.qr.mockRejectedValueOnce(new Error("permission-denied"));
    render();
    await exportPdf();
    expect(controller.pdfPlaybackUrl).toContain("play=qr");
    expect(controller.pdfPlaybackUrl).not.toContain("song=qr-song-id");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(controller.recoveryOpen).toBe(false);
  });

  it("CSS preload 오류 원본을 유지하고 최신화 안내를 한다", async () => {
    mocks.load.mockRejectedValueOnce(new Error("Unable to preload CSS for /assets/export-old.css"));
    render();
    await exportPdf();
    expect(controller.recoveryOpen).toBe(true);
    expect(controller.exportingPdf).toBe(false);
  });

  it("Vite 오류 이벤트의 reject를 막지 않고 현재 PDF 실패와 연결한다", async () => {
    mocks.load.mockImplementationOnce(() => {
      const event = new Event("vite:preloadError", { cancelable: true });
      expect(window.dispatchEvent(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
      return Promise.reject(new Error("asset preload failed"));
    });
    render();
    await exportPdf();
    expect(controller.recoveryOpen).toBe(true);
  });

  it("미리 불러오기에 실패해도 사용자 요청 전에는 복구 창이나 다운로드가 뜨지 않는다", async () => {
    mocks.load.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
    await act(async () => { render({ ready: true }); });
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(controller.recoveryOpen).toBe(false);
    expect(mocks.status).not.toHaveBeenCalled();
    await exportPdf();
    expect(controller.recoveryOpen).toBe(true);
  });

  it("일반 렌더 오류는 새 버전 오류로 잘못 분류하지 않는다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("canvas render failed"));
    render();
    await exportPdf();
    expect(controller.recoveryOpen).toBe(false);
    expect(mocks.status.mock.lastCall![0]).toContain("다시 시도");
    expect(controller.exportingPdf).toBe(false);
  });

  it("악보가 준비되지 않았으면 성공으로 처리하거나 빈 PDF를 만들지 않는다", async () => {
    mocks.pages.mockRejectedValueOnce(new Error("pdf-pages-missing"));
    render();
    await exportPdf();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.status.mock.lastCall![0]).toContain("악보 화면을 준비하지 못했어요");
  });

  it("중복 클릭은 한 번만 생성하고 제목·마디가 없으면 시작하지 않는다", async () => {
    render({ title: " " });
    await exportPdf();
    expect(mocks.load).not.toHaveBeenCalled();
    render({ complete: false });
    await exportPdf();
    expect(mocks.load).not.toHaveBeenCalled();
    render();
    await act(async () => { await Promise.all([controller.exportPdf(), controller.exportPdf()]); });
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
