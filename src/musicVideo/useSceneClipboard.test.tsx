// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_TOTAL_POINTS, type MusicVideoScene } from "../video/musicVideoModel";
import { useSceneClipboard } from "./useSceneClipboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const scene: MusicVideoScene = { id: "source", background: "#ffffff", motion: "still", endLyric: null,
  elements: [{ id: "line", tool: "line", color: "#123456", width: 8,
    points: [[100, 100, .5], [200, 200, .8]] }] };
let host: HTMLDivElement;
let root: Root;
let clipboard: ReturnType<typeof useSceneClipboard>;

function Harness({ sceneId }: { sceneId: string }) {
  clipboard = useSceneClipboard();
  return <span>{sceneId}</span>;
}

function render(sceneId = "source") {
  act(() => root.render(<Harness sceneId={sceneId} />));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  render();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("슬라이드 사이에서 유지되는 편집 클립보드", () => {
  it("복사 후 장면을 전환해도 현재 장면에 원본의 선택 개체를 붙여넣을 수 있다", () => {
    act(() => { expect(clipboard.copy(scene, ["line"]).ok).toBe(true); });
    expect(clipboard.clipboardCount).toBe(1);
    render("destination");
    const result = clipboard.preparePaste({ ...scene, id: "destination", elements: [] }, MAX_TOTAL_POINTS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.status);
    expect(result.scene.id).toBe("destination");
    expect(result.scene.elements[0].points).toEqual([[116, 116, .5], [216, 216, .8]]);
    expect(result.scene.elements[0].id).not.toBe("line");
  });

  it("준비하거나 용량 부족으로 실패한 paste는 횟수를 바꾸지 않으며 commit 확인 후에만 위치를 이동한다", () => {
    act(() => { clipboard.copy(scene, ["line"]); });
    expect(clipboard.preparePaste(scene, 0).ok).toBe(false);
    const prepared = clipboard.preparePaste(scene, MAX_TOTAL_POINTS);
    expect(clipboard.pasteCount).toBe(0);
    if (!prepared.ok) throw new Error(prepared.status);
    expect(prepared.scene.elements[1].points[0][0]).toBe(116);
    act(() => clipboard.confirmPaste());
    expect(clipboard.pasteCount).toBe(1);
    const next = clipboard.preparePaste(scene, MAX_TOTAL_POINTS);
    if (!next.ok) throw new Error(next.status);
    expect(next.scene.elements[1].points[0][0]).toBe(132);
  });

  it("선택 없이 복사한 경우 이전 클립보드를 유지하고 새 유효한 복사만 붙여넣기 위치를 초기화한다", () => {
    act(() => { clipboard.copy(scene, ["line"]); clipboard.confirmPaste(); });
    act(() => { expect(clipboard.copy(scene, ["missing"]).ok).toBe(false); });
    expect(clipboard.clipboardCount).toBe(1);
    expect(clipboard.pasteCount).toBe(1);
    act(() => { clipboard.copy(scene, ["line"]); });
    expect(clipboard.pasteCount).toBe(0);
  });

  it("같은 이벤트 안에서 복사 직후 붙여넣어도 최신 스냅샷을 읽는다", () => {
    act(() => {
      clipboard.copy(scene, ["line"]);
      const result = clipboard.preparePaste(scene, MAX_TOTAL_POINTS);
      expect(result.ok).toBe(true);
    });
  });
});
