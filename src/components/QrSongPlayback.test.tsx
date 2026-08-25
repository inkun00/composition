// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedComposition } from "../music/share";
import QrSongPlayback from "./QrSongPlayback";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { playComposition, stopPlayback, loadQrSong } = vi.hoisted(() => ({
  playComposition: vi.fn(),
  stopPlayback: vi.fn(),
  loadQrSong: vi.fn()
}));

vi.mock("../audio/player", () => ({
  playComposition,
  stopPlayback
}));

vi.mock("../firebase/qrSongs", () => ({ loadQrSong }));

const composition: SharedComposition = {
  version: 1,
  title: "QR 노래",
  creator: "새봄",
  originalCreator: "새봄",
  presetId: "H001",
  meter: { beats: 4, beatUnit: 4 },
  songLength: 8,
  instrumentId: "piano",
  accompanimentStyleId: "arpeggio",
  accompanimentInstrumentIds: ["acoustic_grand_piano"],
  bpm: 96,
  lyrics: Array(8).fill("라"),
  measures: Array.from({ length: 8 }, (_, index) => ({
    candidateName: `가락 ${index + 1}`,
    chords: ["C"],
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 } }]
  }))
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  loadQrSong.mockResolvedValue(null);
  playComposition.mockResolvedValue(8);
  stopPlayback.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QR 악보 노래 재생", () => {
  it("연주 버튼을 누르면 가락과 반주를 실시간으로 연주한다", async () => {
    act(() => root?.render(<QrSongPlayback composition={composition} />));
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="qr-play-song"]')?.click();
    });

    expect(playComposition).toHaveBeenCalledWith(
      expect.any(Array), "acoustic_grand_piano", 96, expect.any(Object)
    );
    expect(container?.textContent).toContain("연주 멈추기");
    expect(container?.textContent).toContain("가락과 반주를 함께 연주하고 있어요.");
    expect(container?.textContent).not.toContain("MP3");
    expect(container?.querySelectorAll(".qr-playback-lyric-lines p")).toHaveLength(8);
    expect(container?.querySelector<HTMLImageElement>(".qr-playback-art")?.src)
      .toContain("/illustrations/qr-song-playback-v1.png");
  });

  it("연주 중 버튼을 다시 누르면 바로 멈춘다", async () => {
    act(() => root?.render(<QrSongPlayback composition={composition} />));
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="qr-play-song"]')?.click();
    });
    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="qr-play-song"]')?.click();
    });

    expect(stopPlayback).toHaveBeenCalled();
    expect(container?.textContent).toContain("노래 연주하기");
  });

  it("곡 데이터가 없으면 QR을 다시 스캔하라고 안내한다", () => {
    act(() => root?.render(<QrSongPlayback composition={null} />));
    expect(container?.textContent).toContain("QR 코드를 다시 스캔");
  });

  it("짧은 Firebase 곡 번호로 저장된 노래를 불러온다", async () => {
    loadQrSong.mockResolvedValue(composition);
    await act(async () => {
      root?.render(<QrSongPlayback composition={null} songId="AbCdEfGhIjKlMnOpQrSt" />);
    });
    expect(loadQrSong).toHaveBeenCalledWith("AbCdEfGhIjKlMnOpQrSt");
    expect(container?.textContent).toContain("QR 노래");
    expect(container?.textContent).toContain("노래 연주하기");
  });
});
