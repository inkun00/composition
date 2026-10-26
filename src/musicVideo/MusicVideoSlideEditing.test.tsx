// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { isMusicVideoScenes, validateMusicVideoScenes, getMusicVideoMeasures } from "../video/musicVideoModel";
import { currentScenes, mount, open, byTestId, byLabel, click, canvasClick, canvasPointer,
  setupFeatureHarness, cleanupFeatureHarness, measures } from "./MusicVideoFeature.testHarness";

const { exporter } = vi.hoisted(() => ({ exporter: vi.fn() }));
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({ default: () => <div /> }));

function fixture(): readonly MusicVideoScene[] {
  return [0, 1, 3].map((endMeasureIndex, index) => ({ id: `slide-${index}`, motion: "still", background: "#ffffff",
    endLyric: null, endMeasureIndex, elements: [
      { id: `rectangle-${index}`, tool: "rectangle", color: "#ff3366", width: 8, motion: "bounce",
        motionGroupId: `group-${index}`, points: [[100, 100, .5], [240, 240, .5]] },
      { id: `ellipse-${index}`, tool: "ellipse", color: "#3366ff", width: 6, motion: "bounce",
        motionGroupId: `group-${index}`, points: [[350, 100, .5], [490, 240, .5]] }
    ] }));
}

function key(value: string, control = true, target: Element | null = document.querySelector(".mv-paint-canvas")) {
  const event = new KeyboardEvent("keydown", { key: value, ctrlKey: control, bubbles: true, cancelable: true });
  act(() => target!.dispatchEvent(event));
  return event;
}

function selectedIds(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="scene-selection-outline"] [data-element-id]')]
    .map((element) => element.dataset.elementId!);
}

function selectFirst() {
  click(byTestId("scene-select-tool"));
  canvasClick(150, 150);
}

beforeEach(() => setupFeatureHarness(exporter));
afterEach(cleanupFeatureHarness);

describe("슬라이드 사이 삽입과 삭제의 스튜디오 연결", () => {
  it("선택한 장면 앞에 빈 슬라이드를 넣고 원본 그림 순서와 마지막 마디를 유지한다", () => {
    const original = fixture();
    mount({ initialScenes: original });
    open();
    click(byLabel("2번 장면 선택"));
    click(byTestId("insert-music-video-scene-before"));
    expect(currentScenes).toHaveLength(4);
    expect(currentScenes.map((scene) => scene.endMeasureIndex)).toEqual([0, 1, 2, 3]);
    expect(currentScenes.filter((scene) => scene.elements.length).map((scene) => scene.id)).toEqual(original.map((scene) => scene.id));
    expect(currentScenes[1].elements).toEqual([]);
    expect(byLabel("2번 장면 선택").getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("insert-music-video-scene-before").disabled).toBe(false);
    expect(byTestId("create-music-video").disabled).toBe(true);
    for (const source of original) expect(currentScenes.find((scene) => scene.id === source.id)?.elements).toBe(source.elements);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(original);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes).toHaveLength(4);
  });

  it("선택한 장면 뒤에도 넣고 타임라인 삭제로 원래 장면 순서를 복원한다", () => {
    const original = fixture();
    mount({ initialScenes: original });
    open();
    click(byLabel("1번 장면 선택"));
    click(byTestId("insert-music-video-scene-after"));
    expect(currentScenes[0].id).toBe(original[0].id);
    expect(currentScenes[1].elements).toEqual([]);
    expect(currentScenes[2].id).toBe(original[1].id);
    click(byTestId("delete-storyboard-scene"));
    expect(currentScenes.map((scene) => scene.id)).toEqual(original.map((scene) => scene.id));
    expect(validateMusicVideoScenes(currentScenes, getMusicVideoMeasures(measures, 120), 120)).toBeNull();
  });

  it("마지막 장면 삭제 후 앞 장면이 노래 끝을 이어받고 되돌리기로 그림과 구간을 복원한다", () => {
    const original = fixture();
    mount({ initialScenes: original });
    open();
    click(byLabel("3번 장면 선택"));
    click(byTestId("delete-storyboard-scene"));
    expect(currentScenes.map((scene) => scene.endMeasureIndex)).toEqual([0, 3]);
    expect(currentScenes[1].elements).toBe(original[1].elements);
    expect(byTestId("create-music-video").disabled).toBe(false);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(original);
  });

  it("전주가 있어도 마지막 본곡 하나는 남기고 전주 자체는 삭제할 수 있다", () => {
    const original = fixture();
    const intro: MusicVideoScene = { id: "intro", section: "intro", background: "#ffffff", motion: "still", endLyric: null, elements: [] };
    mount({ initialScenes: [intro, { ...original[0], endMeasureIndex: 3 }] });
    open();
    click(byLabel("2번 장면 선택"));
    expect(byTestId("delete-storyboard-scene").disabled).toBe(true);
    click(byLabel("1번 장면 선택"));
    expect(byTestId("insert-music-video-scene-before").disabled).toBe(true);
    expect(byTestId("delete-storyboard-scene").disabled).toBe(false);
    click(byTestId("delete-storyboard-scene"));
    expect(currentScenes).toHaveLength(1);
    expect(currentScenes[0].section).toBeUndefined();
  });

  it("그리는 중 삽입해도 마지막 획 보존이 새 마디 경계를 덮거나 빈 실행 취소를 만들지 않는다", () => {
    mount({ initialScenes: [{ ...fixture()[0], elements: [], endMeasureIndex: 3 }] });
    open();
    canvasPointer("pointerdown", 100, 100);
    canvasPointer("pointermove", 180, 130);
    click(byTestId("insert-music-video-scene-after"));
    expect(currentScenes.map((scene) => scene.endMeasureIndex)).toEqual([1, 3]);
    expect(currentScenes[0].elements[0].points).toHaveLength(2);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toHaveLength(1);
    expect(currentScenes[0].endMeasureIndex).toBe(3);
    expect(currentScenes[0].elements[0].points).toHaveLength(2);
  });
});

describe("선택한 그림을 장면 사이에 복사하고 붙여넣기", () => {
  it("선택 개체만 버튼으로 복사하고 다른 슬라이드에 Ctrl+V로 독립 복제한다", () => {
    const original = fixture();
    mount({ initialScenes: original });
    open();
    expect(byTestId("scene-copy-elements").disabled).toBe(true);
    expect(byTestId("scene-paste-elements").disabled).toBe(true);
    selectFirst();
    expect(selectedIds()).toEqual(["rectangle-0"]);
    click(byTestId("scene-copy-elements"));
    click(byLabel("2번 장면 선택"));
    expect(selectedIds()).toEqual([]);
    expect(byTestId("scene-paste-elements").disabled).toBe(false);
    expect(key("v").defaultPrevented).toBe(true);
    expect(currentScenes[0]).toBe(original[0]);
    expect(currentScenes[1].elements).toHaveLength(3);
    const pasted = currentScenes[1].elements[2];
    expect(pasted.id).not.toBe("rectangle-0");
    expect(pasted.motionGroupId).not.toBe("group-0");
    expect(pasted).toMatchObject({ tool: "rectangle", color: "#ff3366", width: 8, motion: "bounce" });
    expect(pasted.points[0]).toEqual([116, 116, .5]);
    expect(selectedIds()).toEqual([pasted.id]);
    expect(isMusicVideoScenes(currentScenes)).toBe(true);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(original);
    expect(byTestId("scene-paste-elements").disabled).toBe(false);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes[1].elements[2]).toEqual(pasted);
  });

  it("Ctrl+A·Ctrl+C로 여러 개체를 복사하고 같은 그룹을 새 그룹으로 붙여넣는다", () => {
    const original = fixture();
    mount({ initialScenes: original });
    open();
    click(byTestId("scene-select-tool"));
    expect(key("a").defaultPrevented).toBe(true);
    expect(selectedIds()).toHaveLength(2);
    expect(key("c").defaultPrevented).toBe(true);
    click(byLabel("3번 장면 선택"));
    click(byTestId("scene-paste-elements"));
    const pasted = currentScenes[2].elements.slice(2);
    expect(pasted).toHaveLength(2);
    expect(new Set(pasted.map((element) => element.motionGroupId)).size).toBe(1);
    expect(pasted[0].motionGroupId).not.toBe("group-0");
    expect(selectedIds()).toEqual(pasted.map((element) => element.id));
    click(byTestId("scene-clear-selection"));
    click(byLabel("2번 장면 선택"));
    click(byTestId("scene-paste-elements"));
    expect(currentScenes[1].elements).toHaveLength(4);
    expect(currentScenes[1].elements[2].motionGroupId).not.toBe(pasted[0].motionGroupId);
    expect(currentScenes[0]).toBe(original[0]);
  });

  it("원본 슬라이드를 삭제해도 복사한 그림은 다른 슬라이드에 붙여넣을 수 있다", () => {
    mount({ initialScenes: fixture() });
    open();
    selectFirst();
    click(byTestId("scene-copy-elements"));
    click(byTestId("delete-storyboard-scene"));
    click(byTestId("scene-paste-elements"));
    expect(currentScenes.map((scene) => scene.id)).toEqual(["slide-1", "slide-2"]);
    expect(currentScenes[0].elements).toHaveLength(3);
    expect(currentScenes[0].elements[2].color).toBe("#ff3366");
  });

  it("입력칸의 Ctrl+C·Ctrl+V는 기본 텍스트 동작을 유지한다", () => {
    mount({ initialScenes: fixture() });
    open();
    selectFirst();
    click(byTestId("scene-copy-elements"));
    const input = document.createElement("input");
    document.querySelector(".mv-studio")!.append(input);
    const before = currentScenes;
    expect(key("c", true, input).defaultPrevented).toBe(false);
    expect(key("v", true, input).defaultPrevented).toBe(false);
    expect(currentScenes).toBe(before);
    input.remove();
  });
});
