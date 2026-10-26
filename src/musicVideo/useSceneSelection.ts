import { useState } from "react";
import type { MusicVideoScene } from "../video/musicVideoModel";
import type { SceneEditorTool, SceneMotionScope } from "./sceneSelection";

type SelectionState = Readonly<{
  sceneId: string | undefined;
  tool: SceneEditorTool;
  scope: SceneMotionScope;
  ids: readonly string[];
}>;

/** Editor selection is transient and never enters scene data or undo history. */
export function useSceneSelection(scene: MusicVideoScene | undefined) {
  const [stored, setStored] = useState<SelectionState>({ sceneId: scene?.id, tool: "brush", scope: "whole", ids: [] });
  const available = new Set(scene?.elements.map((element) => element.id));
  const ids = stored.sceneId === scene?.id ? stored.ids.filter((id) => available.has(id)) : [];
  const sourceChanged = stored.sceneId !== scene?.id || ids.length !== stored.ids.length;
  const current = sourceChanged ? { ...stored, sceneId: scene?.id, ids } : stored;
  if (sourceChanged) setStored(current);

  function setTool(tool: SceneEditorTool) {
    setStored({ ...current, tool, scope: tool === "select" ? "selection" : "whole",
      ids: tool === "select" ? current.ids : [] });
  }

  function setScope(scope: SceneMotionScope) {
    setStored({ ...current, scope, tool: scope === "selection" ? "select" : "brush",
      ids: scope === "selection" ? current.ids : [] });
  }

  function selectElements(elementIds: readonly string[], additive = false) {
    const validIds = [...new Set(elementIds)].filter((id) => available.has(id));
    const chosen = new Set(validIds);
    setStored((previous) => {
      const before = previous.sceneId === scene?.id ? previous.ids.filter((id) => available.has(id)) : [];
      const allSelected = validIds.every((id) => before.includes(id));
      const next = !validIds.length ? [] : !additive ? validIds : allSelected
        ? before.filter((id) => !chosen.has(id))
        : [...before, ...validIds.filter((id) => !before.includes(id))];
      return { ...previous, sceneId: scene?.id, tool: "select", scope: "selection", ids: next };
    });
  }

  function selectElement(id: string | null, additive = false) {
    selectElements(id ? [id] : [], additive);
  }

  function clearSelection() {
    setStored({ ...current, ids: [] });
  }

  return { tool: current.tool, scope: current.scope, selectedIds: current.ids,
    setTool, setScope, selectElement, selectElements, clearSelection };
}
