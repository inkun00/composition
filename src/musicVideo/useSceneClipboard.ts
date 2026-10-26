import { useRef, useState } from "react";
import type { MusicVideoScene } from "../video/musicVideoModel";
import { copySceneElements, pasteSceneElements, type SceneClipboard } from "./sceneClipboard";

/** Studio-owned clipboard survives scene switches and undo; it is not project drawing data. */
export function useSceneClipboard() {
  const clipboard = useRef<SceneClipboard | null>(null);
  const committedPastes = useRef(0);
  const [clipboardCount, setClipboardCount] = useState(0);
  const [pasteCount, setPasteCount] = useState(0);

  function copy(scene: MusicVideoScene, ids: readonly string[]) {
    const copied = copySceneElements(scene, ids);
    if (!copied) return { ok: false as const, count: 0, status: "복사할 선이나 도형을 먼저 선택해 주세요." };
    clipboard.current = copied;
    committedPastes.current = 0;
    setClipboardCount(copied.elements.length);
    setPasteCount(0);
    return { ok: true as const, count: copied.elements.length,
      status: `개체 ${copied.elements.length}개를 복사했어요. 같은 장면이나 다른 장면에 붙여넣어 주세요.` };
  }

  function preparePaste(scene: MusicVideoScene, remainingPoints: number) {
    return pasteSceneElements(scene, clipboard.current, remainingPoints, committedPastes.current);
  }

  function confirmPaste() {
    committedPastes.current += 1;
    setPasteCount(committedPastes.current);
  }

  return { clipboardCount, pasteCount, copy, preparePaste, confirmPaste };
}
