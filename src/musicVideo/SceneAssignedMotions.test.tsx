// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicVideoScene, SceneElement, SceneMotion } from "../video/musicVideoModel";
import SceneAssignedMotions from "./SceneAssignedMotions";
import { removeAssignedElementMotions } from "./sceneMotionAssignments";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function element(id: string, motion?: SceneMotion): SceneElement {
  return { id, tool: "rectangle", color: "#e94e52", width: 8, points: [[20, 30, .5], [60, 70, .5]], motion };
}

const base: MusicVideoScene = { id: "assigned-scene", motion: "still", background: "#ffffff", endLyric: null,
  elements: [element("first", "move-right"), element("second", "bounce"), element("third", "sway")] };
let host: HTMLDivElement;
let root: Root;
let scene: MusicVideoScene;
let selected: readonly string[];
let disabled: boolean;
const select = vi.fn();
const selectGroup = vi.fn();
const remove = vi.fn((ids: readonly string[]) => {
  scene = removeAssignedElementMotions(scene, ids);
  render();
});

function render() {
  root.render(<SceneAssignedMotions scene={scene} selectedIds={selected} disabled={disabled}
    onSelectElement={select} onRemove={remove} />);
}

function byId(id: string) {
  return host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
}

function click(id: string, shiftKey = false) {
  act(() => byId(id).dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey })));
}

beforeEach(() => {
  vi.clearAllMocks();
  scene = base;
  selected = [];
  disabled = false;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(render);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("적용한 개체 동작 목록", () => {
  it("명시적 움직임만 그린 순서 이름과 효과 한글명으로 표시한다", () => {
    scene = { ...base, elements: [element("none"), element("static", "still"), element("automatic", "auto"), ...base.elements] };
    act(render);
    const rows = [...host.querySelectorAll('[data-testid="scene-assigned-motion-row"]')];
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toBe("네모 4오른쪽으로 이동");
    expect(rows[1].textContent).toBe("네모 5통통 뛰기");
    expect(rows[2].textContent).toBe("네모 6살랑살랑");
    expect(rows[0].querySelector("svg path")).not.toBeNull();
  });

  it("행 선택과 여러 개 선택 의도를 전달하고 선택한 행을 강조한다", () => {
    click("scene-assigned-motion-select-second");
    expect(select).toHaveBeenLastCalledWith("second", false);
    click("scene-assigned-motion-select-third", true);
    expect(select).toHaveBeenLastCalledWith("third", true);
    selected = ["second", "third"];
    act(render);
    expect(byId("scene-assigned-motion-select-second").getAttribute("aria-pressed")).toBe("true");
    expect(byId("scene-assigned-motion-select-first").getAttribute("aria-pressed")).toBe("false");
    expect(byId("scene-remove-selected-motions")).not.toBeNull();
  });

  it("삭제 후 다음 행, 이전 행, 빈 목록 제목 순서로 포커스를 보존한다", () => {
    byId("scene-remove-element-motion-first").focus();
    click("scene-remove-element-motion-first");
    expect(document.activeElement).toBe(byId("scene-remove-element-motion-second"));
    click("scene-remove-element-motion-third");
    expect(document.activeElement).toBe(byId("scene-remove-element-motion-second"));
    click("scene-remove-element-motion-second");
    expect(document.activeElement).toBe(host.querySelector("h5"));
    expect(host.querySelector('[data-testid="scene-assigned-motions-empty"]')?.textContent)
      .toContain("개체에 동작을 적용하면 여기에 표시돼요.");
    expect(scene.elements.map(({ motion: _motion, ...drawing }) => drawing))
      .toEqual(base.elements.map(({ motion: _motion, ...drawing }) => drawing));
  });

  it("선택한 동작만 묶어 삭제하고 나머지 행으로 포커스를 옮긴다", () => {
    selected = ["first", "third"];
    act(render);
    byId("scene-remove-selected-motions").focus();
    click("scene-remove-selected-motions");
    expect(remove).toHaveBeenCalledWith(["first", "third"]);
    expect(host.querySelectorAll('[data-testid="scene-assigned-motion-row"]')).toHaveLength(1);
    expect(document.activeElement).toBe(byId("scene-remove-element-motion-second"));
    expect(scene.elements[1]).toBe(base.elements[1]);
  });

  it("제작 중에는 행 선택과 개별·선택 삭제를 실행하지 않는다", () => {
    selected = ["first", "second"];
    disabled = true;
    act(render);
    expect([...host.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
    act(() => {
      byId("scene-assigned-motion-select-first").click();
      byId("scene-remove-element-motion-first").click();
      byId("scene-remove-selected-motions").click();
    });
    expect(select).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("최대 개체 수에도 모든 행을 하나의 이름 있는 스크롤 영역에 담는다", () => {
    scene = { ...base, elements: Array.from({ length: 240 }, (_, index) => ({
      ...element(`object-${index}`, "fade"), motionGroupId: `object-${index}` })) };
    act(render);
    const list = host.querySelector('[data-testid="scene-assigned-motion-list"]')!;
    expect(list.getAttribute("role")).toBe("region");
    expect(list.getAttribute("aria-label")).toBe("적용한 개체 동작 목록");
    expect(list.querySelectorAll("li")).toHaveLength(240);
    expect(byId("scene-assigned-motion-select-object-239").textContent).toBe("네모 240서서히 나타나기");
  });

  it("같이 적용한 개체를 합친 미리보기 한 행으로 묶고 그룹 전체 선택과 삭제를 한 번 호출한다", () => {
    scene = { ...base, elements: [
      { ...base.elements[0], motionGroupId: "together" },
      { ...base.elements[1], motion: "move-right", motionGroupId: "together",
        points: [[120, 130, .5], [160, 170, .5]] },
      base.elements[2]
    ] };
    act(() => root.render(<SceneAssignedMotions scene={scene} selectedIds={["first"]} disabled={false}
      onSelectElements={selectGroup} onRemove={remove} />));
    const row = host.querySelector('[data-motion-group-id="together"]')!;
    expect(row.getAttribute("data-element-ids")).toBe('["first","second"]');
    expect(row.querySelectorAll("svg path")).toHaveLength(2);
    expect(row.textContent).toContain("그룹 1 · 개체 2개");
    expect(byId("scene-assigned-motion-select-together").getAttribute("data-partially-selected")).toBe("true");
    click("scene-assigned-motion-select-together", true);
    expect(selectGroup).toHaveBeenCalledOnce();
    expect(selectGroup).toHaveBeenCalledWith(["first", "second"], true);
    click("scene-remove-element-motion-together");
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(["first", "second"]);
    expect(document.activeElement).toBe(byId("scene-remove-element-motion-third"));
  });

  it("예전 그림의 같은 효과 다섯 개는 한 legacy 그룹이고 별도로 적용한 같은 효과는 남긴다", () => {
    scene = { ...base, elements: [...Array.from({ length: 5 }, (_, index) => element(`old-${index}`, "bounce")),
      { ...element("separate", "bounce"), motionGroupId: "separate" }] };
    act(render);
    expect(host.querySelectorAll('[data-testid="scene-assigned-motion-row"]')).toHaveLength(2);
    expect(byId("scene-assigned-motion-select-legacy:bounce").textContent).toContain("그룹 1 · 개체 5개");
    click("scene-remove-element-motion-legacy:bounce");
    expect(scene.elements[5].motion).toBe("bounce");
    expect(byId("scene-remove-element-motion-separate")).not.toBeNull();
    expect(host.querySelectorAll('[data-testid="scene-assigned-motion-row"]')).toHaveLength(1);
  });

  it("그룹에서 일부 개체를 삭제해 singleton으로 바뀌어도 남은 행에 포커스를 유지한다", () => {
    scene = { ...base, elements: [element("first", "bounce"), element("second", "bounce"), element("third", "bounce")] };
    selected = ["first", "second"];
    act(render);
    click("scene-remove-selected-motions");
    expect(host.querySelectorAll('[data-testid="scene-assigned-motion-row"]')).toHaveLength(1);
    expect(document.activeElement).toBe(byId("scene-remove-element-motion-third"));
    expect(scene.elements[2].motion).toBe("bounce");
  });
});
