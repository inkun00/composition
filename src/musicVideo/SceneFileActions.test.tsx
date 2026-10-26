// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoScene } from "../video/musicVideoModel";
import SceneFileActions from "./SceneFileActions";

const files = vi.hoisted(() => ({ saveSceneFile: vi.fn(), saveScenePng: vi.fn(), readSceneFile: vi.fn() }));
vi.mock("./sceneFile", () => files);
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scene: MusicVideoScene = { id: "selected-scene", background: "#fff8ed", motion: "still", endLyric: null,
  endMeasureIndex: 3, elements: [{ id: "stroke", tool: "line", color: "#1e293b", width: 8,
    points: [[100, 100, .5], [200, 150, .5]] }] };
let root: Root;
let host: HTMLDivElement;
let onImport: ReturnType<typeof vi.fn>;
let onReset: ReturnType<typeof vi.fn>;
let onStatus: ReturnType<typeof vi.fn>;
let onOuterKeyDown: ReturnType<typeof vi.fn>;

function mount(current = scene, disabled = false) {
  act(() => root.render(<div onKeyDown={onOuterKeyDown}>
    <SceneFileActions scene={current} title="별빛 노래" sceneNumber={2} disabled={disabled}
      onImport={onImport} onReset={onReset} onStatus={onStatus} />
  </div>));
}

function byTestId<T extends HTMLElement = HTMLButtonElement>(id: string): T {
  const element = host.querySelector<T>(`[data-testid="${id}"]`);
  if (!element) throw new Error(`${id} 항목을 찾지 못했습니다.`);
  return element;
}

function buttonContaining(text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")]
    .find((element) => element.textContent?.includes(text));
  if (!button) throw new Error(`${text} 버튼을 찾지 못했습니다.`);
  return button;
}

function click(button: HTMLButtonElement) { act(() => button.click()); }

function chooseFile() {
  const input = byTestId<HTMLInputElement>("scene-import-file");
  const file = new File(["saved scene"], "my-scene.json", { type: "application/json" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
  return file;
}

beforeEach(() => {
  vi.resetAllMocks();
  files.saveScenePng.mockResolvedValue(undefined);
  files.readSceneFile.mockResolvedValue(scene);
  onImport = vi.fn();
  onReset = vi.fn();
  onStatus = vi.fn();
  onOuterKeyDown = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("현재 장면 저장과 초기화 조작", () => {
  it("장면 저장은 현재 그림과 동작을 파일에 담고 장면 상태를 바꾸지 않는다", () => {
    mount();
    click(byTestId("scene-save"));
    expect(files.saveSceneFile).toHaveBeenCalledWith(scene, "별빛 노래", 2);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("다운로드"));
    expect(onImport).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
  });

  it("저장 실패를 성공으로 안내하지 않는다", () => {
    files.saveSceneFile.mockImplementation(() => { throw new Error("파일 저장 실패"); });
    mount();
    click(byTestId("scene-save"));
    expect(onStatus).toHaveBeenCalledExactlyOnceWith("파일 저장 실패");
  });

  it("초기화는 선택한 장면에 대한 콜백만 실행한다", () => {
    mount();
    click(byTestId("scene-reset"));
    expect(onReset).toHaveBeenCalledOnce();
    expect(files.saveSceneFile).not.toHaveBeenCalled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it("저장 옵션의 Escape는 메뉴를 닫고 그림판 닫기로 전달되지 않는다", () => {
    mount();
    const options = byTestId("scene-save-options");
    click(options);
    expect(options.getAttribute("aria-expanded")).toBe("true");
    act(() => buttonContaining("이미지(PNG)로 저장").dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true, cancelable: true
    })));
    expect(options.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(options);
    expect(onOuterKeyDown).not.toHaveBeenCalled();
  });

  it("PNG 변환 중에는 저장과 초기화·불러오기를 잠그고 완료 후 다시 허용한다", async () => {
    let finish!: () => void;
    files.saveScenePng.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    mount();
    click(byTestId("scene-save-options"));
    click(buttonContaining("이미지(PNG)로 저장"));
    expect(files.saveScenePng).toHaveBeenCalledWith(scene, "별빛 노래", 2);
    expect(byTestId<HTMLButtonElement>("scene-save").disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>("scene-reset").disabled).toBe(true);
    expect(byTestId<HTMLInputElement>("scene-import-file").disabled).toBe(true);
    click(byTestId("scene-reset"));
    expect(onReset).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(byTestId<HTMLButtonElement>("scene-save").disabled).toBe(false);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("이미지 다운로드"));
  });

  it("장면 파일을 불러와 편집 가능한 데이터를 전달한다", async () => {
    mount();
    const file = chooseFile();
    await act(async () => undefined);
    expect(files.readSceneFile).toHaveBeenCalledWith(file);
    expect(onImport).toHaveBeenCalledExactlyOnceWith(scene);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("불러왔어요"));
    expect(byTestId<HTMLInputElement>("scene-import-file").value).toBe("");
  });

  it("잘못된 파일은 반영하지 않고 실패 이유를 알린다", async () => {
    files.readSceneFile.mockRejectedValue(new Error("장면 파일을 확인해 주세요."));
    mount();
    chooseFile();
    await act(async () => undefined);
    expect(onImport).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledExactlyOnceWith("장면 파일을 확인해 주세요.");
    expect(byTestId<HTMLButtonElement>("scene-save").disabled).toBe(false);
  });

  it("파일 읽기 도중 선택한 장면이 바뀌면 다른 장면에 덮어쓰지 않는다", async () => {
    let finish!: (value: MusicVideoScene) => void;
    files.readSceneFile.mockReturnValue(new Promise<MusicVideoScene>((resolve) => { finish = resolve; }));
    mount();
    chooseFile();
    mount({ ...scene, id: "another-scene" });
    await act(async () => finish(scene));
    expect(onImport).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("불러오기를 취소"));
    expect(byTestId<HTMLButtonElement>("scene-save").disabled).toBe(false);
  });

  it("파일을 읽는 동안 바뀐 최신 콜백으로 반영하여 다른 편집 내용을 덮어쓰지 않는다", async () => {
    let finish!: (value: MusicVideoScene) => void;
    files.readSceneFile.mockReturnValue(new Promise<MusicVideoScene>((resolve) => { finish = resolve; }));
    mount();
    chooseFile();
    const previousImport = onImport;
    const previousStatus = onStatus;
    onImport = vi.fn();
    onStatus = vi.fn();
    mount();
    await act(async () => finish(scene));
    expect(previousImport).not.toHaveBeenCalled();
    expect(previousStatus).not.toHaveBeenCalled();
    expect(onImport).toHaveBeenCalledExactlyOnceWith(scene);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("불러왔어요"));
  });

  it("파일 읽기 도중 영상 작업이 시작되면 장면을 교체하지 않는다", async () => {
    let finish!: (value: MusicVideoScene) => void;
    files.readSceneFile.mockReturnValue(new Promise<MusicVideoScene>((resolve) => { finish = resolve; }));
    mount();
    chooseFile();
    mount(scene, true);
    await act(async () => finish(scene));
    expect(onImport).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("영상을 만드는 중"));
  });

  it("파일 읽기 도중 그림판을 닫으면 완료된 결과를 나중에 반영하지 않는다", async () => {
    let finish!: (value: MusicVideoScene) => void;
    files.readSceneFile.mockReturnValue(new Promise<MusicVideoScene>((resolve) => { finish = resolve; }));
    mount();
    chooseFile();
    act(() => root.render(null));
    await act(async () => finish(scene));
    expect(onImport).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("영상 생성 등 외부 작업 중에는 파일 조작과 초기화를 허용하지 않는다", () => {
    mount(scene, true);
    click(byTestId("scene-save"));
    click(byTestId("scene-save-options"));
    click(byTestId("scene-reset"));
    expect(files.saveSceneFile).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();
    expect(byTestId("scene-save-options").getAttribute("aria-expanded")).toBe("false");
  });
});
