// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import LyricVideoExportButton from "./LyricVideoExportButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("가사 영상 저장 버튼", () => {
  it("가사가 없으면 비활성화하고 만들기 중에는 진행률을 보여준다", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onSave = vi.fn();

    act(() => root.render(<LyricVideoExportButton hasLyrics={false} busy={false} exporting={false}
      progress={0} status="" onSave={onSave} />));
    const button = container.querySelector<HTMLButtonElement>('button[data-testid="export-lyric-mp4"]');
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain("가사를 적고 녹음하면");

    act(() => root.render(<LyricVideoExportButton hasLyrics busy={false} exporting={false}
      progress={0} status="" onSave={onSave} />));
    act(() => button?.click());
    expect(onSave).toHaveBeenCalledOnce();

    act(() => root.render(<LyricVideoExportButton hasLyrics busy={false} exporting
      progress={57} status="가사 영상을 만들고 있어요." onSave={onSave} />));
    expect(button?.disabled).toBe(true);
    expect(container.querySelector("progress")?.value).toBe(57);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("만들고 있어요");

    act(() => root.unmount());
    container.remove();
  });
});
