// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { MusicVideoExportOptions } from "../video/exportMusicVideoMp4";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { currentScenes, onScenesChange, mount, open, byTestId, byLabel, click, choosePreset,
  setupFeatureHarness, cleanupFeatureHarness } from "./MusicVideoFeature.testHarness";

const { exporter, preview } = vi.hoisted(() => ({
  exporter: vi.fn(),
  preview: { options: null as MusicVideoExportOptions | null }
}));
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: () => <div /> }));
vi.mock("./StudioPlaybackPreview", () => ({ default: ({ options, onClose }: {
  options: MusicVideoExportOptions; onClose: () => void;
}) => {
  preview.options = options;
  return <section role="dialog" aria-modal="true" data-testid="music-video-preview-dialog">
    <button type="button" data-testid="music-video-preview-close" onClick={onClose}>닫기</button>
  </section>;
} }));

function fixture(): readonly MusicVideoScene[] {
  return [1, 3].map((endMeasureIndex, index) => ({
    id: `preview-scene-${index}`, background: "#fff8ed", motion: index ? "pulse" : "move-up",
    endLyric: null, endMeasureIndex,
    elements: [{ id: `preview-element-${index}`, tool: "rectangle", color: "#4285f4", width: 8,
      points: [[150, 160, .5], [550, 370, .5]] }]
  }));
}

beforeEach(() => {
  setupFeatureHarness(exporter);
  preview.options = null;
});
afterEach(cleanupFeatureHarness);

describe("음악과 모션 전체 미리보기 진입", () => {
  it("MP4 생성 없이 모든 장면과 현재 음악 설정을 재생창에 전달한다", () => {
    const scenes = fixture();
    mount({ initialScenes: scenes });
    open();
    click(byTestId("music-video-preview-open"));
    expect(preview.options).toMatchObject({ scenes, title: "별빛 이야기", instrumentId: "violin", bpm: 120,
      animated: true, accompaniment: { styleId: "arpeggio", instrumentIds: ["piano"] } });
    expect(preview.options!.measures).toHaveLength(4);
    expect(document.querySelector(".mv-studio")?.hasAttribute("inert")).toBe(true);
    expect(exporter).not.toHaveBeenCalled();
    expect(onScenesChange).not.toHaveBeenCalled();
    click(byTestId("music-video-preview-close"));
    expect(document.querySelector('[data-testid="music-video-preview-dialog"]')).toBeNull();
    expect(document.querySelector(".mv-studio")?.hasAttribute("inert")).toBe(false);
    expect(document.querySelector('[aria-label="장면 그리기 닫기"]')).not.toBeNull();
  });

  it("준비 중 부모가 갱신돼도 재생 스냅샷을 유지하고 다시 열면 최신 그림을 사용한다", () => {
    const scenes = fixture();
    mount({ initialScenes: scenes });
    open();
    click(byTestId("music-video-preview-open"));
    const snapshot = preview.options;
    mount({ initialScenes: scenes, busy: true, bpm: 180 });
    expect(preview.options).toBe(snapshot);
    click(byTestId("music-video-preview-close"));
    mount({ initialScenes: scenes, busy: false, bpm: 180 });
    choosePreset("bounce-right");
    const edited = currentScenes;
    click(byTestId("music-video-preview-open"));
    expect(preview.options).not.toBe(snapshot);
    expect(preview.options!.scenes).toBe(edited);
    expect(preview.options!.scenes[0].motion).toBe("bounce-right");
    expect(preview.options!.bpm).toBe(180);
    expect(exporter).not.toHaveBeenCalled();
  });

  it.each(["incomplete", "invalid-range", "busy"])("%s 상태에서는 재생창을 열지 않는다", (kind) => {
    const scenes = fixture().map((scene, index) => kind === "invalid-range" && index === 1
      ? { ...scene, endMeasureIndex: 0 } : scene);
    mount({ initialScenes: scenes, complete: kind !== "incomplete" });
    open();
    if (kind === "busy") mount({ initialScenes: scenes, busy: true });
    expect(byTestId("music-video-preview-open").disabled).toBe(true);
    click(byTestId("music-video-preview-open"));
    expect(preview.options).toBeNull();
    expect(exporter).not.toHaveBeenCalled();
  });

  it("미리보기 열기와 닫기는 그림 실행 취소 기록을 만들지 않는다", () => {
    mount({ initialScenes: fixture() });
    open();
    choosePreset("float");
    const edited = currentScenes;
    click(byTestId("music-video-preview-open"));
    click(byTestId("music-video-preview-close"));
    expect(currentScenes).toBe(edited);
    expect(onScenesChange).toHaveBeenCalledTimes(1);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0].motion).toBe("move-up");
    expect(byLabel("그림 되돌리기").disabled).toBe(true);
  });

  it("재생창을 닫은 뒤 편집 화면의 미리보기 버튼으로 초점을 복귀한다", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    mount({ initialScenes: fixture() });
    open();
    const trigger = byTestId("music-video-preview-open");
    trigger.focus();
    click(trigger);
    mount({ initialScenes: fixture(), busy: true });
    byTestId("music-video-preview-close").focus();
    click(byTestId("music-video-preview-close"));
    expect(document.querySelector(".mv-studio")?.hasAttribute("inert")).toBe(false);
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(trigger.disabled).toBe(true);
    expect(document.activeElement).not.toBe(trigger);
    mount({ initialScenes: fixture(), busy: false });
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(document.activeElement).toBe(trigger);
  });
});
