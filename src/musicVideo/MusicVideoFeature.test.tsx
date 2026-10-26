// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackMeasure } from "../audio/accompanimentScore";
import type { MusicVideoPlan, MusicVideoScene } from "../video/musicVideoModel";
import { serializeSceneFile } from "./sceneFile";
import { measures, currentScenes, onScenesChange, onBusyChange, mount, open, paint, endpoint,
  byTestId, byLabel, byText, click, choosePreset, setupFeatureHarness, cleanupFeatureHarness } from "./MusicVideoFeature.testHarness";

const exporter = vi.hoisted(() => vi.fn());
const preview = vi.hoisted(() => vi.fn());
vi.mock("../video/exportMusicVideoMp4", () => ({ exportMusicVideoMp4: exporter }));
vi.mock("./SceneMotionPreview", () => ({
  default: (props: { lyricText: string; bpm: number; plan: MusicVideoPlan }) => {
    preview(props);
    return <div data-testid="motion-preview">{props.lyricText}</div>;
  }
}));

beforeEach(() => setupFeatureHarness(exporter));
afterEach(cleanupFeatureHarness);

describe("장면 그리기와 뮤직비디오 제작 흐름", () => {
  it("처음 열면 마지막 마디까지 이어지는 빈 장면을 만들고 그림을 그리면 제작을 허용한다", () => {
    mount();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    open();
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(currentScenes).toHaveLength(1);
    expect(currentScenes[0]).toMatchObject({ endLyric: null, endMeasureIndex: 3, elements: [] });
    expect(currentScenes[0].motion).toBe("still");
    expect(document.querySelector('[data-testid="scene-action-mode"]')).toBeNull();
    expect(document.body.textContent).not.toContain("대상과 동작 편집");
    expect(byTestId("create-music-video").disabled).toBe(true);
    expect(document.body.textContent).toContain("장면에 그림을 그려 주세요");
    paint();
    expect(currentScenes[0].elements[0].points).toEqual([[100, 100, .5], [150, 130, .5], [200, 150, .5]]);
    expect(byTestId("create-music-video").disabled).toBe(false);
    expect(exporter).not.toHaveBeenCalled();
  });

  it("가사 없이도 마디를 선택하고 그림을 먼저 그리게 하며 영상 제작에는 가사 입력을 안내한다", () => {
    mount({ measures: [{ ...measures[0], notes: measures[0].notes.map((note) => ({ ...note, lyric: "" })) }] });
    open();
    expect(currentScenes[0].endLyric).toBeNull();
    expect(document.querySelector<HTMLSelectElement>('[data-testid="scene-end-measure"]')?.value).toBe("0");
    paint();
    expect(currentScenes[0].elements).toHaveLength(1);
    expect(byTestId("create-music-video").disabled).toBe(true);
    expect(exporter).not.toHaveBeenCalled();
  });

  it("박자가 미완성인 곡은 그린 장면을 유지하며 마디 완성 안내를 표시한다", () => {
    mount({ complete: false });
    open();
    paint();
    expect(currentScenes[0].elements).toHaveLength(1);
    expect(document.body.textContent).toContain("모든 마디의 박자를 완성하면");
    expect(byTestId("create-music-video").disabled).toBe(true);
    click(byTestId("create-music-video"));
    expect(document.querySelector('[data-testid="confirm-music-video"]')).toBeNull();
  });

  it("장면의 끝을 한 마디씩 선택하고 마지막 마디까지 덮는 설정에서만 제작을 허용한다", () => {
    mount();
    open();
    paint();
    click(byTestId("add-music-video-scene"));
    expect(currentScenes.map((scene) => scene.endMeasureIndex)).toEqual([1, 3]);
    expect(byLabel("2번 장면 선택").getAttribute("aria-pressed")).toBe("true");
    expect(byTestId("create-music-video").disabled).toBe(true);
    paint();
    expect(byTestId("create-music-video").disabled).toBe(false);
    endpoint("2");
    expect(byTestId("create-music-video").disabled).toBe(true);
    expect(document.body.textContent).toContain("마지막 마디까지");
    endpoint("3");
    expect(byTestId("create-music-video").disabled).toBe(false);
    click(byLabel("1번 장면 선택"));
    const allOptions = [...document.querySelector<HTMLSelectElement>('[data-testid="scene-end-measure"]')!.options];
    expect(allOptions[0].value).toBe("intro");
    const options = allOptions.filter((option) => option.value !== "intro");
    expect(options).toHaveLength(4);
    expect(options.map((option) => option.value)).toEqual(["0", "1", "2", "3"]);
    expect(options.every((option) => option.textContent?.includes("마디"))).toBe(true);
    expect(options.some((option) => option.textContent?.includes("번째 가사"))).toBe(false);
    expect(options.find((option) => option.value === "3")?.disabled).toBe(false);
  });

  it("가사가 없는 마지막 마디도 선택지와 영상의 필수 범위에 포함한다", () => {
    const instrumentalMeasures: PlaybackMeasure[] = [
      measures[0],
      { ...measures[1], notes: measures[1].notes.map((note, index) => ({
        ...note, lyric: "", pitch: index === 3 ? null : note.pitch
      })) }
    ];
    mount({ measures: instrumentalMeasures });
    open();
    paint();
    const select = document.querySelector<HTMLSelectElement>('[data-testid="scene-end-measure"]')!;
    expect([...select.options].map((option) => option.value)).toEqual(["intro", "0", "1"]);
    expect(select.value).toBe("1");
    expect(byTestId("create-music-video").disabled).toBe(false);
    endpoint("0");
    expect(byTestId("create-music-video").disabled).toBe(true);
    expect(document.body.textContent).toContain("마지막 마디까지");
  });

  it("한 마디 안에서 장면을 쪼개지 않고 마디 수만큼의 장면만 허용한다", () => {
    mount({ measures: [measures[0]] });
    open();
    paint();
    expect(byTestId("add-music-video-scene").disabled).toBe(true);
    click(byTestId("add-music-video-scene"));
    expect(currentScenes).toHaveLength(1);
    expect(currentScenes[0].endMeasureIndex).toBe(0);
    expect(byTestId("create-music-video").disabled).toBe(false);
  });

  it("기존 음절 기준 장면은 그림을 보존하며 같은 마디로 표시하고 변경 시 마디 기준으로 저장한다", () => {
    const initialScenes: MusicVideoScene[] = [0, 3].map((measureIndex) => ({
      id: `legacy-${measureIndex}`, background: "#ffffff", motion: "auto",
      elements: [{ id: `stroke-${measureIndex}`, tool: "brush", color: "#1e293b", width: 8,
        points: [[100, 100, .5], [150, 150, .5]] }],
      endLyric: { measureIndex, noteId: "note-0" }
    }));
    mount({ initialScenes });
    open();
    const select = document.querySelector<HTMLSelectElement>('[data-testid="scene-end-measure"]')!;
    expect(select.value).toBe("0");
    expect(currentScenes).toEqual(initialScenes);
    expect(onScenesChange).not.toHaveBeenCalled();
    endpoint("1");
    expect(currentScenes[0]).toMatchObject({ endLyric: null, endMeasureIndex: 1,
      elements: initialScenes[0].elements });
    expect(currentScenes[1]).toEqual({ ...initialScenes[1], startMeasureIndex: 1 });
  });

  it("구간을 늘려도 이웃 장면의 미리보기 범위는 보존하며 시작 마디로 겹침을 해소한다", () => {
    const rangeMeasures: PlaybackMeasure[] = ["옛날", "달려", "하늘"].map((text, measureIndex) => ({
      harmony: "home", measureIndex, chords: ["C"],
      notes: Array.from(text, (lyric, index) => ({ id: `syllable-${index}`, pitch: 60,
        duration: { numerator: 1, denominator: 1 }, lyric }))
    }));
    const initialScenes: MusicVideoScene[] = [0, 2].map((measureIndex, index) => ({
      id: `range-scene-${index}`, background: "#ffffff", elements: [], motion: "auto",
      endLyric: null, endMeasureIndex: measureIndex
    }));
    mount({ measures: rangeMeasures, initialScenes });
    open();
    expect(document.querySelector('[data-testid="motion-preview"]')?.textContent).toBe("옛날");
    click(byLabel("2번 장면 선택"));
    expect(document.querySelector('[data-testid="motion-preview"]')?.textContent).toBe("달려하늘");
    click(byLabel("1번 장면 선택"));
    endpoint("1");
    click(byLabel("2번 장면 선택"));
    expect(document.querySelector('[data-testid="motion-preview"]')?.textContent).toBe("달려하늘");
    expect(document.querySelector('[data-testid="scene-range-warning"]')?.textContent).toContain("2마디 겹침");
    const start = document.querySelector<HTMLSelectElement>('[data-testid="scene-start-measure"]')!;
    act(() => { start.value = "2"; start.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.querySelector('[data-testid="motion-preview"]')?.textContent).toBe("하늘");
  });

  it.each([true, false])("애니메이션 %s 선택과 현재 가사·그림·음악 설정을 제작 함수에 전달한다", async (animated) => {
    mount();
    open();
    paint();
    click(byTestId("create-music-video"));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    const label = [...document.querySelectorAll(".mv-animation-options label")]
      .find((item) => item.textContent?.includes(animated ? "애니메이션 있음" : "애니메이션 없음"))!;
    act(() => label.querySelector<HTMLInputElement>("input")!.click());
    await act(async () => { byTestId("confirm-music-video").click(); });
    expect(exporter).toHaveBeenCalledOnce();
    expect(exporter.mock.calls[0][0]).toMatchObject({
      animated, measures, scenes: currentScenes, title: "별빛 이야기", instrumentId: "violin", bpm: 120,
      accompaniment: { styleId: "arpeggio", instrumentIds: ["piano"] }
    });
    click(byTestId("music-video-result-open"));
    expect(document.querySelector<HTMLVideoElement>('video[aria-label="완성된 뮤직비디오"]')?.src)
      .toBe("blob:completed-music-video");
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("그림 비우기와 장면 삭제를 되돌리거나 다시 실행해도 장면 정보와 선을 보존한다", () => {
    mount();
    open();
    paint();
    const firstDrawing = currentScenes[0];
    click(byLabel("현재 장면 비우기"));
    expect(currentScenes[0].elements).toHaveLength(0);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0]).toEqual(firstDrawing);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes[0].elements).toHaveLength(0);
    click(byLabel("그림 되돌리기"));
    click(byTestId("add-music-video-scene"));
    paint();
    const beforeDeletion = currentScenes;
    click(byText("이 장면 삭제"));
    expect(currentScenes).toHaveLength(1);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual(beforeDeletion);
    click(byLabel("그림 다시 실행"));
    expect(currentScenes).toEqual([{ ...beforeDeletion[0], endLyric: null, endMeasureIndex: 3 }]);
  });

  it("제작 선택을 닫고 그림판을 다시 열어도 저장한 장면을 초기화하지 않는다", () => {
    mount();
    open();
    paint();
    click(byTestId("create-music-video"));
    click(byLabel("애니메이션 선택 닫기"));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    const saved = currentScenes;
    const changes = onScenesChange.mock.calls.length;
    click(byLabel("장면 그리기 닫기"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    open();
    expect(currentScenes).toBe(saved);
    expect(onScenesChange).toHaveBeenCalledTimes(changes);
    expect(byTestId("create-music-video").disabled).toBe(false);
    paint();
    expect(currentScenes[0].elements).toHaveLength(2);
    expect(exporter).not.toHaveBeenCalled();
  });

  it("선택한 장면만 그림·배경·동작을 초기화하고 마디를 유지하며 전체 설정을 되돌린다", () => {
    const first: MusicVideoScene = { id: "first", background: "#fff8ed", motion: "sway", endLyric: null,
      endMeasureIndex: 1, elements: [{ id: "hand", tool: "line", color: "#123456", width: 4,
        points: [[100, 100, .5], [200, 100, .5]] }], choreography: { version: 1, description: "누르기",
        actors: [{ id: "actor", name: "손", elementIds: ["hand"], fixedPoint: [100, 100],
          movingPoint: [200, 100], endPoint: [210, 120] }], actions: [{ id: "press", actorId: "actor",
          kind: "press", startMeasureIndex: 0, startBeat: 0, durationBeats: 2, strength: 1 }] } };
    const second: MusicVideoScene = { ...first, id: "second", endMeasureIndex: 3, choreography: undefined };
    mount({ initialScenes: [first, second] });
    open();
    click(byTestId("scene-reset"));
    expect(currentScenes[0]).toEqual({ id: "first", background: "#ffffff", elements: [], motion: "still",
      endLyric: null, endMeasureIndex: 1 });
    expect(currentScenes[1]).toEqual(second);
    expect(document.body.textContent).toContain("초기화했어요");
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual([first, second]);
    expect(document.body.textContent).toContain("장면 변경을 되돌렸어요");
    click(byLabel("그림 다시 실행"));
    expect(currentScenes[0].elements).toEqual([]);
    expect(currentScenes[1]).toEqual(second);
    expect(document.body.textContent).toContain("장면 변경을 다시 적용했어요");
  });

  it("저장한 장면을 선택 장면에 불러오되 기존 마디와 다른 장면을 유지하고 되돌릴 수 있다", async () => {
    const source: MusicVideoScene = { id: "source", background: "#fff8ed", elements: [{ id: "line", tool: "line",
      color: "#123456", width: 4, points: [[100, 100, .5], [200, 100, .5]] }],
      motion: "sway", endLyric: null, endMeasureIndex: 1 };
    const target: MusicVideoScene = { ...source, id: "target", elements: [], background: "#ffffff", endMeasureIndex: 3 };
    mount({ initialScenes: [source, target] });
    open();
    click(byLabel("2번 장면 선택"));
    const file = new File([serializeSceneFile(source)], "장면.scene.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => serializeSceneFile(source) });
    const input = document.querySelector<HTMLInputElement>('[data-testid="scene-import-file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(currentScenes[0]).toEqual(source);
    expect(currentScenes[1]).toEqual({ ...source, id: "target", endMeasureIndex: 3 });
    expect(document.body.textContent).toContain("불러왔어요");
    click(byLabel("그림 되돌리기"));
    expect(currentScenes).toEqual([source, target]);
  });

  it("다른 작업 중에는 그림판 진입을 잠그고 장면을 만들지 않는다", () => {
    mount({ busy: true });
    expect(byTestId("draw-music-video-scene").disabled).toBe(true);
    open();
    expect(currentScenes).toEqual([]);
    expect(onScenesChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each(["still", "draw-on", "fade", "slide", "zoom", "float", "bounce", "pulse",
    "pop-in", "iris", "curtain", "assemble", "sparkle", "confetti",
    "rotate-in", "flip-in", "diagonal-reveal", "zoom-out", "snow", "spotlight",
    "move-left", "move-right", "move-up", "move-down", "move-up-left", "move-up-right",
    "move-down-left", "move-down-right", "bounce-left", "bounce-right"] as const)(
    "%s 움직임을 한 번 고르면 그림·배경·마디를 유지하고 기존 대상별 연출을 교체한다", (motion) => {
      const original: MusicVideoScene = { id: "legacy-action", background: "#fff8ed", motion: "sway",
        endLyric: null, endMeasureIndex: 3, elements: [{ id: "drawing", tool: "line", color: "#123456", width: 4,
          points: [[100, 100, .5], [200, 100, .5]] }], choreography: { version: 1, description: "이전 연출",
          actors: [{ id: "actor", name: "그림", elementIds: ["drawing"], fixedPoint: [100, 100],
            movingPoint: [200, 100], endPoint: [200, 90] }], actions: [{ id: "jump", actorId: "actor",
            kind: "jump", startMeasureIndex: 0, startBeat: 0, durationBeats: 2, strength: 1 }] } };
      mount({ initialScenes: [original] });
      open();
      expect(document.querySelector('[role="tablist"][aria-label="움직임 종류"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="analyze-scene"]')).toBeNull();
      expect(document.querySelector('[data-testid="apply-scene-recommendation"]')).toBeNull();
      expect(document.querySelector("textarea")).toBeNull();
      choosePreset(motion);
      expect(currentScenes[0]).toEqual({ ...original, motion, choreography: undefined });
      expect(byTestId(`scene-motion-preset-${motion}`).getAttribute("aria-pressed")).toBe("true");
      expect(byTestId("scene-save").disabled).toBe(false);
      click(byLabel("그림 되돌리기"));
      expect(currentScenes[0]).toEqual(original);
      click(byLabel("그림 다시 실행"));
      expect(currentScenes[0]).toEqual({ ...original, motion, choreography: undefined });
    });

  it("장면마다 움직임을 따로 선택하고 저장한 선택을 영상 제작에 전달한다", async () => {
    mount();
    open();
    paint();
    choosePreset("draw-on");
    click(byTestId("add-music-video-scene"));
    paint();
    choosePreset("fade");
    expect(currentScenes.map((scene) => scene.motion)).toEqual(["draw-on", "fade"]);
    click(byLabel("1번 장면 선택"));
    expect(byTestId("scene-motion-preset-draw-on").getAttribute("aria-pressed")).toBe("true");
    choosePreset("pulse");
    expect(currentScenes.map((scene) => scene.motion)).toEqual(["pulse", "fade"]);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes.map((scene) => scene.motion)).toEqual(["draw-on", "fade"]);
    click(byLabel("그림 다시 실행"));
    click(byLabel("2번 장면 선택"));
    expect(byTestId("scene-motion-preset-fade").getAttribute("aria-pressed")).toBe("true");
    click(byTestId("create-music-video"));
    await act(async () => byTestId("confirm-music-video").click());
    expect(exporter.mock.calls[0][0].scenes).toEqual(currentScenes);
    expect(exporter.mock.calls[0][0].scenes.map((scene: MusicVideoScene) => scene.motion)).toEqual(["pulse", "fade"]);
  });

  it("같은 움직임을 다시 눌러도 실행 취소 기록에 중복된 장면을 쌓지 않는다", () => {
    mount();
    open();
    paint();
    const original = currentScenes[0];
    choosePreset("slide");
    const changes = onScenesChange.mock.calls.length;
    choosePreset("slide");
    expect(onScenesChange).toHaveBeenCalledTimes(changes);
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0]).toEqual(original);
  });

  it("끝 마디가 없는 그림도 분석 없이 움직임을 선택하고 마디는 별도로 정할 수 있다", () => {
    const unresolved: MusicVideoScene = { id: "unresolved", background: "#ffffff", motion: "still", endLyric: null,
      elements: [{ id: "stroke", tool: "line", color: "#123456", width: 4,
        points: [[100, 100, .5], [200, 150, .5]] }] };
    mount({ initialScenes: [unresolved] });
    open();
    expect(document.querySelector('[data-testid="analyze-scene"]')).toBeNull();
    click(byTestId("scene-motion-category-transition"));
    expect(byTestId("scene-motion-preset-zoom").disabled).toBe(false);
    choosePreset("zoom");
    expect(currentScenes[0].motion).toBe("zoom");
    endpoint("3");
    expect(currentScenes[0]).toMatchObject({ motion: "zoom", endMeasureIndex: 3 });
  });

  it.each([
    ["pop-in", "iris", true], ["pop-in", "iris", false],
    ["curtain", "assemble", true], ["curtain", "assemble", false],
    ["sparkle", "confetti", true], ["sparkle", "confetti", false],
    ["rotate-in", "flip-in", true], ["rotate-in", "flip-in", false],
    ["diagonal-reveal", "zoom-out", true], ["diagonal-reveal", "zoom-out", false],
    ["snow", "spotlight", true], ["snow", "spotlight", false],
    ["move-left", "move-right", true], ["move-left", "move-right", false],
    ["move-up", "move-down", true], ["move-up", "move-down", false],
    ["move-up-left", "move-up-right", true], ["move-up-left", "move-up-right", false],
    ["move-down-left", "move-down-right", true], ["move-down-left", "move-down-right", false],
    ["bounce-left", "bounce-right", true], ["bounce-left", "bounce-right", false]
  ] as const)("새 움직임 %s와 %s를 장면별로 저장하고 애니메이션 %s 제작에 전달한다", async (first, second, animated) => {
    mount();
    open();
    paint();
    choosePreset(first);
    click(byTestId("add-music-video-scene"));
    paint();
    choosePreset(second);
    const selected = currentScenes;
    expect(currentScenes.map((scene) => scene.motion)).toEqual([first, second]);
    expect(JSON.parse(serializeSceneFile(currentScenes[1])).scene.motion).toBe(second);
    click(byLabel("1번 장면 선택"));
    expect(byTestId(`scene-motion-preset-${first}`).getAttribute("aria-pressed")).toBe("true");
    click(byLabel("2번 장면 선택"));
    expect(byTestId(`scene-motion-preset-${second}`).getAttribute("aria-pressed")).toBe("true");
    click(byLabel("그림 되돌리기"));
    expect(currentScenes[0]).toEqual(selected[0]);
    expect(currentScenes[1].motion).toBe("still");
    click(byLabel("그림 다시 실행"));
    expect(currentScenes).toEqual(selected);
    click(byTestId("create-music-video"));
    const label = [...document.querySelectorAll(".mv-animation-options label")]
      .find((item) => item.textContent?.includes(animated ? "애니메이션 있음" : "애니메이션 없음"))!;
    act(() => label.querySelector<HTMLInputElement>("input")!.click());
    await act(async () => byTestId("confirm-music-video").click());
    expect(exporter.mock.calls[0][0]).toMatchObject({ animated, scenes: selected });
  });

  it("종류 탭은 저장된 움직임을 바꾸지 않고 해당 카드만 보여 준다", () => {
    mount();
    open();
    paint();
    choosePreset("iris");
    const selected = currentScenes;
    const changes = onScenesChange.mock.calls.length;
    click(byTestId("scene-motion-category-entrance"));
    expect(document.querySelector('[role="tablist"][aria-label="움직임 종류"]')).not.toBeNull();
    expect(byTestId("scene-motion-category-entrance").getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector('[role="tabpanel"][aria-label="등장 움직임"]')).not.toBeNull();
    expect(document.querySelectorAll('[role="tabpanel"] button[data-testid^="scene-motion-preset-"]')).toHaveLength(7);
    expect(document.querySelector('[data-testid="scene-motion-preset-iris"]')).toBeNull();
    expect(byTestId("scene-motion-preset-assemble")).toBeTruthy();
    click(byTestId("scene-motion-category-transition"));
    expect(document.querySelectorAll('[role="tabpanel"] button[data-testid^="scene-motion-preset-"]')).toHaveLength(5);
    expect(byTestId("scene-motion-preset-iris").getAttribute("aria-pressed")).toBe("true");
    click(byTestId("scene-motion-category-atmosphere"));
    expect(document.querySelectorAll('[role="tabpanel"] button[data-testid^="scene-motion-preset-"]')).toHaveLength(8);
    click(byTestId("scene-motion-category-travel"));
    expect(document.querySelectorAll('[role="tabpanel"] button[data-testid^="scene-motion-preset-"]')).toHaveLength(10);
    expect(document.querySelector('[role="tabpanel"][aria-label="이동 움직임"]')).not.toBeNull();
    expect(currentScenes).toBe(selected);
    expect(onScenesChange).toHaveBeenCalledTimes(changes);
  });

  it("BPM이 바뀌면 그림과 선택한 모션을 유지하고 새 박자 구간과 빠르기를 미리보기·영상에 전달한다", async () => {
    mount({ bpm: 90 });
    open();
    paint();
    choosePreset("bounce-left");
    const selected = currentScenes;
    const changes = onScenesChange.mock.calls.length;
    const slow = preview.mock.lastCall![0] as { bpm: number; plan: MusicVideoPlan };
    expect(slow.bpm).toBe(90);
    expect(slow.plan.bpm).toBe(90);
    mount({ bpm: 180 });
    const fast = preview.mock.lastCall![0] as { bpm: number; plan: MusicVideoPlan };
    expect(fast.bpm).toBe(180);
    expect(fast.plan.bpm).toBe(180);
    expect(slow.plan.scenes[0].endSeconds - slow.plan.scenes[0].startSeconds)
      .toBeCloseTo(2 * (fast.plan.scenes[0].endSeconds - fast.plan.scenes[0].startSeconds), 8);
    expect(currentScenes).toBe(selected);
    expect(onScenesChange).toHaveBeenCalledTimes(changes);
    expect(byTestId("scene-motion-preset-bounce-left").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-testid="scene-motion-tempo"]')?.textContent).toContain("BPM 180");
    click(byTestId("create-music-video"));
    await act(async () => byTestId("confirm-music-video").click());
    expect(exporter.mock.calls[0][0]).toMatchObject({ bpm: 180, scenes: selected });
  });
});
