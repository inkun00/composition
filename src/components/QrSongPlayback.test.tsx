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

vi.mock("../audio/player", () => ({ playComposition, stopPlayback }));
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
  accompanimentInstrumentIds: ["piano"],
  beatPattern: [{ id: "beat-1", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 }],
  beatVolume: 120,
  bpm: 96,
  lyrics: Array(8).fill("라"),
  measures: Array.from({ length: 8 }, (_, index) => ({
    candidateName: `가락 ${index + 1}`,
    notes: [{ id: `note-${index}`, pitch: 60, duration: { numerator: 4, denominator: 1 } }]
  }))
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  playComposition.mockResolvedValue(3000);
  stopPlayback.mockResolvedValue(undefined);
  loadQrSong.mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe("QR 악보 노래 재생", () => {
  it("재생 버튼을 누르면 가락과 반주를 연주한다", async () => {
    act(() => root?.render(<QrSongPlayback composition={composition} />));
    await act(async () => container?.querySelector<HTMLButtonElement>('[data-testid="qr-create-play"]')?.click());

    expect(playComposition).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ chords: expect.any(Array) })]),
      "acoustic_grand_piano",
      96,
      expect.objectContaining({
        styleId: "arpeggio",
        meter: composition.meter,
        beatPattern: composition.beatPattern,
        beatVolume: 120
      })
    );
    expect(container?.textContent).toContain("재생 멈추기");
  });

  it("짧은 Firebase 곡 번호로 저장된 노래를 불러온다", async () => {
    loadQrSong.mockResolvedValue(composition);
    await act(async () => root?.render(<QrSongPlayback composition={null} songId="AbCdEfGhIjKlMnOpQrSt" />));
    expect(loadQrSong).toHaveBeenCalledWith("AbCdEfGhIjKlMnOpQrSt");
    expect(container?.textContent).toContain("QR 노래");
  });

  it("각 마디의 가사를 표시하고 실시간 연주 영역을 제공한다", async () => {
    act(() => root?.render(<QrSongPlayback composition={composition} />));
    expect(container?.textContent).toContain("가사 및 연주 위치");
    const firstMeasure = container?.querySelector('[data-testid="qr-measure-0"]');
    expect(firstMeasure).not.toBeNull();
    expect(firstMeasure?.textContent).toContain("1마디");
    expect(firstMeasure?.textContent).toContain("라");
  });

  it("가사가 비어 있는 경우 계이름으로 가락 위치를 보여준다", async () => {
    const noLyricSong: SharedComposition = {
      ...composition,
      lyrics: [],
      measures: [
        {
          candidateName: "가락 1",
          notes: [{ id: "n1", pitch: 60, duration: { numerator: 4, denominator: 1 } }]
        }
      ],
      songLength: 8
    };
    act(() => root?.render(<QrSongPlayback composition={noLyricSong} />));
    const firstMeasure = container?.querySelector('[data-testid="qr-measure-0"]');
    expect(firstMeasure?.textContent).toContain("도");
  });
});
