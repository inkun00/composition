// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { useSceneSelection } from "./useSceneSelection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const scene: MusicVideoScene = { id: "scene", background: "#ffffff", motion: "still", endLyric: null,
  elements: ["a", "b"].map((id) => ({ id, tool: "line", color: "#123456", width: 8,
    points: [[100, 100, .5], [200, 200, .5]] })) };
let host: HTMLDivElement;
let root: Root;
let selection: ReturnType<typeof useSceneSelection>;

function Harness({ current }: { current: MusicVideoScene | undefined }) {
  selection = useSceneSelection(current);
  return null;
}

function render(current: MusicVideoScene | undefined = scene) {
  act(() => root.render(<Harness current={current} />));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("히스토리와 분리한 편집 선택 상태", () => {
  it("단일 클릭은 개체를 교체하고 같은 개체 재클릭은 선택을 유지하며 빈 곳은 해제한다", () => {
    const before = structuredClone(scene);
    render();
    act(() => selection.setTool("select"));
    expect(selection.scope).toBe("selection");
    act(() => selection.selectElement("a"));
    expect(selection.selectedIds).toEqual(["a"]);
    act(() => selection.selectElement("b"));
    act(() => selection.selectElement("b"));
    expect(selection.selectedIds).toEqual(["b"]);
    act(() => selection.selectElement(null));
    expect(selection.selectedIds).toEqual([]);
    expect(selection.scope).toBe("selection");
    expect(scene).toEqual(before);
  });

  it("추가 선택과 토글은 선택 ID만 바꾸고 그리기 도구로 돌아가면 전체 범위로 전환한다", () => {
    render();
    act(() => selection.selectElement("a"));
    act(() => selection.selectElement("b", true));
    expect(selection.selectedIds).toEqual(["a", "b"]);
    act(() => selection.selectElement("a", true));
    expect(selection.selectedIds).toEqual(["b"]);
    act(() => selection.setTool("ellipse"));
    expect(selection.selectedIds).toEqual([]);
    expect(selection.scope).toBe("whole");
    expect(selection.tool).toBe("ellipse");
  });

  it("선택을 해제해도 이미 저장된 개체 효과는 남고 다시 선택할 수 있다", () => {
    const animated = { ...scene, elements: [{ ...scene.elements[0], motion: "move-right" as const }] };
    render(animated);
    act(() => selection.selectElement("a"));
    act(() => selection.clearSelection());
    expect(selection.selectedIds).toEqual([]);
    expect(selection.scope).toBe("selection");
    expect(animated.elements[0].motion).toBe("move-right");
    act(() => selection.selectElement("a"));
    expect(selection.selectedIds).toEqual(["a"]);
  });

  it("효과 변경은 선택을 보존하고 삭제·장면 전환·돌아오기에서 오래된 ID를 복원하지 않는다", () => {
    render();
    act(() => selection.selectElement("a"));
    render({ ...scene, elements: [{ ...scene.elements[0], motion: "fade" }, scene.elements[1]] });
    expect(selection.selectedIds).toEqual(["a"]);
    render({ ...scene, elements: [scene.elements[1]] });
    expect(selection.selectedIds).toEqual([]);
    render();
    act(() => selection.selectElement("a"));
    render({ ...scene, id: "another" });
    expect(selection.selectedIds).toEqual([]);
    render();
    expect(selection.selectedIds).toEqual([]);
    expect(selection.scope).toBe("selection");
  });

  it("전체 그림 범위는 선택 모드를 종료하고 개체 데이터를 변경하지 않는다", () => {
    render();
    act(() => selection.selectElement("a"));
    act(() => selection.setScope("whole"));
    expect(selection.selectedIds).toEqual([]);
    expect(selection.tool).toBe("brush");
    expect(selection.scope).toBe("whole");
    expect(scene.elements[0].motion).toBeUndefined();
  });

  it("그룹 전체를 원자적으로 선택하고 일부 선택은 추가·전체 선택은 묶음 해제한다", () => {
    const groupScene = { ...scene, elements: [...scene.elements, { ...scene.elements[0], id: "c" }] };
    const original = structuredClone(groupScene);
    render(groupScene);
    act(() => selection.selectElements(["a", "b", "a", "missing"]));
    expect(selection.selectedIds).toEqual(["a", "b"]);
    expect(selection.tool).toBe("select");
    expect(selection.scope).toBe("selection");
    act(() => selection.selectElement("c", true));
    act(() => selection.selectElements(["a", "b"], true));
    expect(selection.selectedIds).toEqual(["c"]);
    act(() => selection.selectElement("a", true));
    act(() => selection.selectElements(["a", "b"], true));
    expect(selection.selectedIds).toEqual(["c", "a", "b"]);
    expect(groupScene).toEqual(original);
  });

  it("같은 이벤트 묶음의 연속 그룹 선택도 누락 없이 합친다", () => {
    render();
    act(() => {
      selection.selectElements(["a"], true);
      selection.selectElements(["b"], true);
    });
    expect(selection.selectedIds).toEqual(["a", "b"]);
    act(() => selection.selectElements(["a", "b"]));
    expect(selection.selectedIds).toEqual(["a", "b"]);
    render({ ...scene, elements: [scene.elements[1]] });
    expect(selection.selectedIds).toEqual(["b"]);
    render({ ...scene, id: "new-scene" });
    expect(selection.selectedIds).toEqual([]);
  });
});
