// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { focusKaraokePlaybackPosition } from "./useKaraokeAutoFocus";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("노래 연습·녹음 화면 자동 포커스", () => {
  it("현재 연주 마디를 화면 중앙으로 옮기고 키보드 포커스를 준다", () => {
    const intro = document.createElement("div");
    intro.dataset.karaokeSection = "intro";
    intro.dataset.karaokeMeasureIndex = "2";
    intro.tabIndex = -1;
    const song = document.createElement("div");
    song.dataset.karaokeSection = "song";
    song.dataset.karaokeMeasureIndex = "2";
    song.tabIndex = -1;
    const scrollIntoView = vi.fn();
    song.scrollIntoView = scrollIntoView;
    document.body.append(intro, song);

    const target = focusKaraokePlaybackPosition({ section: "song", measureIndex: 2 });

    expect(target).toBe(song);
    expect(document.activeElement).toBe(song);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });
  });

  it("마디 시작 전에는 현재 연주 구역의 시작으로 이동한다", () => {
    const panel = document.createElement("section");
    panel.dataset.karaokeSectionPanel = "intro";
    const scrollIntoView = vi.fn();
    panel.scrollIntoView = scrollIntoView;
    document.body.append(panel);

    focusKaraokePlaybackPosition({ section: "intro", measureIndex: null });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
      inline: "nearest"
    });
  });
});
