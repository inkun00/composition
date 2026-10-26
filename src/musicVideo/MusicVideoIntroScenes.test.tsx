// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoPlan, MusicVideoScene } from "../video/musicVideoModel";
import type { MusicVideoExportOptions } from "../video/exportMusicVideoMp4";
import { parseSceneFile, serializeSceneFile } from "./sceneFile";
import { currentScenes, mount, open, endpoint, byTestId, byLabel, click,
  setupFeatureHarness, cleanupFeatureHarness, measures } from "./MusicVideoFeature.testHarness";

const { exporter, motionPreview, playback } = vi.hoisted(() => ({ exporter: vi.fn(), motionPreview: vi.fn(),
  playback: { options: null as MusicVideoExportOptions | null } }));
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: (props: { plan: MusicVideoPlan }) => {
  motionPreview(props);
  return <div data-testid="motion-preview" />;
} }));
vi.mock("./StudioPlaybackPreview", () => ({ default: ({ options, onClose }: {
  options: MusicVideoExportOptions; onClose: () => void;
}) => {
  playback.options = options;
  return <section role="dialog" aria-modal="true"><button type="button" data-testid="close-intro-playback" onClick={onClose}>닫기</button></section>;
} }));

function fixture(): readonly MusicVideoScene[] {
  return [1, 3].map((endMeasureIndex, index) => ({ id: `normal-${index}`, motion: "bounce", background: "#ffffff",
    endLyric: null, endMeasureIndex, elements: [{ id: `line-${index}`, tool: "line", width: 8, color: "#3366dd",
      points: [[100, 100, .5], [300, 200, .5]] }] }));
}

function endSelect() {
  return document.querySelector<HTMLSelectElement>('[data-testid="scene-end-measure"]')!;
}

beforeEach(() => {
  setupFeatureHarness(exporter);
  playback.options = null;
});
afterEach(cleanupFeatureHarness);

describe("전주 장면 편집", () => {
  it("전주를 맨 앞에 추가하되 본곡 그림과 마디를 보존하고 빈 전주도 제작을 허용한다", () => {
    const normals = fixture();
    mount({ initialScenes: normals, composer: "김작곡" });
    open();
    click(byTestId("add-music-video-intro"));
    expect(currentScenes).toHaveLength(3);
    expect(currentScenes[0]).toMatchObject({ section: "intro", endLyric: null, elements: [] });
    expect(currentScenes[0].endMeasureIndex).toBeUndefined();
    expect(currentScenes[1]).toBe(normals[0]);
    expect(currentScenes[2]).toBe(normals[1]);
    expect(endSelect().value).toBe("intro");
    expect(document.querySelector('[data-testid="add-music-video-intro"]')).toBeNull();
    expect(document.querySelector(".mv-empty-hint .mv-intro-title-card")?.textContent).toContain("김작곡");
    expect(byTestId("create-music-video").disabled).toBe(false);
    expect(parseSceneFile(serializeSceneFile(currentScenes[0]))).toEqual(currentScenes[0]);
    click(byLabel("2번 장면 선택"));
    expect(endSelect().value).toBe("1");
    expect([...endSelect().options].some((option) => option.value === "intro")).toBe(false);
    expect(document.querySelector(".mv-range-summary")?.textContent).toContain("시작01마디");
    const preview = motionPreview.mock.lastCall![0].plan as MusicVideoPlan;
    expect(preview.introSeconds).toBe(0);
    expect(preview.scenes[0].startSeconds).toBe(0);
  });

  it("첫 장면을 전주로 바꿨다가 본곡 마디로 되돌릴 때 그림을 보존한다", () => {
    const normals = fixture();
    mount({ initialScenes: normals });
    open();
    endpoint("intro");
    expect(currentScenes[0]).toMatchObject({ section: "intro", endLyric: null, elements: normals[0].elements });
    expect(currentScenes[0].endMeasureIndex).toBeUndefined();
    expect(currentScenes[1]).toBe(normals[1]);
    endpoint("1");
    expect(currentScenes[0].section).toBeUndefined();
    expect(currentScenes[0].endMeasureIndex).toBe(1);
    expect(currentScenes[0].elements).toBe(normals[0].elements);
  });

  it("전주 하나만 남아도 본곡을 추가할 수 있고 한 마디에는 본곡 하나와 전주 하나를 둔다", () => {
    const only = { ...fixture()[0], endMeasureIndex: 0 };
    mount({ initialScenes: [only], measures: [measures[0]] });
    open();
    endpoint("intro");
    expect(byTestId("add-music-video-scene").disabled).toBe(false);
    expect(byTestId("create-music-video").disabled).toBe(true);
    click(byTestId("add-music-video-scene"));
    expect(currentScenes).toHaveLength(2);
    expect(currentScenes[0].section).toBe("intro");
    expect(currentScenes[1]).toMatchObject({ endMeasureIndex: 0, elements: [] });
    expect(byTestId("add-music-video-scene").disabled).toBe(true);
  });

  it("전주 초기화와 삭제를 되돌려도 본곡 구간과 section을 보존한다", () => {
    mount({ initialScenes: fixture() });
    open();
    endpoint("intro");
    click(byTestId("scene-reset"));
    const reset = currentScenes;
    expect(reset[0]).toMatchObject({ section: "intro", endLyric: null, elements: [] });
    click(byTestId("delete-music-video-intro"));
    expect(currentScenes).toEqual([reset[1]]);
    expect(document.querySelector('[data-testid="music-video-intro-scene"]')).toBeNull();
    expect(document.querySelector('[data-testid="add-music-video-intro"]')).not.toBeNull();
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(reset);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes).toEqual([reset[1]]);
  });

  it("미리보기와 MP4 제작에 작곡가와 전주를 함께 전달한다", async () => {
    mount({ initialScenes: fixture(), composer: "김작곡" });
    open();
    click(byTestId("add-music-video-intro"));
    const scenes = currentScenes;
    click(byTestId("music-video-preview-open"));
    expect(playback.options).toMatchObject({ scenes, composer: "김작곡", animated: true });
    click(byTestId("close-intro-playback"));
    click(byTestId("create-music-video"));
    await act(async () => byTestId("confirm-music-video").click());
    expect(exporter.mock.calls[0][0]).toMatchObject({ scenes, composer: "김작곡" });
  });

  it("녹음 음원의 실제 전주 길이를 가사 없는 전주 장면 미리보기에 사용한다", () => {
    mount({ initialScenes: fixture(), composer: "김작곡", recording: { audioUrl: "blob:recording", plan: {
      title: "녹음", hasLyrics: true, frames: [
        { startSeconds: 0, endSeconds: 2.75, syllables: [], activeSyllable: -1, measureIndex: null },
        { startSeconds: 2.75, endSeconds: 10.75, syllables: ["노래"], activeSyllable: 0, measureIndex: 0 }
      ] } } });
    open();
    click(byTestId("add-music-video-intro"));
    const preview = motionPreview.mock.lastCall![0].plan as MusicVideoPlan;
    expect(preview.introSeconds).toBe(2.75);
    expect(preview.composer).toBe("김작곡");
    expect(preview.scenes[0]).toMatchObject({ startSeconds: 0, endSeconds: 2.75, lyricText: "" });
    expect(preview.lyrics.frames).toEqual([]);
    expect(document.querySelector(".mv-inspector-badge")?.textContent).toContain("전주 · 2.8초");
  });
});
