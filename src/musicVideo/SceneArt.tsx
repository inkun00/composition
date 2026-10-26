import { memo } from "react";
import type { MusicVideoScene, SceneElement } from "../video/musicVideoModel";
import { elementPath } from "../video/sceneDrawing";

export const ScenePath = memo(function ScenePath({ element }: Readonly<{ element: SceneElement }>) {
  const brush = element.tool === "brush";
  return <path d={elementPath(element)} fill={brush ? element.color : "none"}
    stroke={brush ? "none" : element.color} strokeWidth={element.width} strokeLinecap="round" strokeLinejoin="round" />;
});

export default memo(function SceneArt({ scene }: Readonly<{ scene: MusicVideoScene }>) {
  return <svg viewBox="0 0 960 540" aria-hidden="true" style={{ background: scene.background }}>
    {scene.elements.map((element) => <ScenePath key={element.id} element={element} />)}
  </svg>;
});
