import { useEffect } from "react";

export type KaraokeFocusPosition = Readonly<{
  section: "intro" | "song" | "outro";
  measureIndex: number | null;
}>;

function selectorForPosition(position: KaraokeFocusPosition): string {
  if (position.measureIndex === null) {
    return `[data-karaoke-section-panel="${position.section}"]`;
  }
  return `[data-karaoke-section="${position.section}"]` +
    `[data-karaoke-measure-index="${position.measureIndex}"]`;
}

export function focusKaraokePlaybackPosition(position: KaraokeFocusPosition): HTMLElement | null {
  const target = document.querySelector<HTMLElement>(selectorForPosition(position));
  if (!target) return null;

  const reduceMotion = typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView?.({
    behavior: reduceMotion ? "auto" : "smooth",
    block: position.measureIndex === null ? "start" : "center",
    inline: "nearest"
  });
  if (position.measureIndex !== null) target.focus({ preventScroll: true });
  return target;
}

export function useKaraokeAutoFocus(
  open: boolean,
  playbackActive: boolean,
  position: KaraokeFocusPosition
) {
  useEffect(() => {
    if (!open || !playbackActive) return;
    const frame = window.requestAnimationFrame(() => {
      focusKaraokePlaybackPosition(position);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, playbackActive, position.section, position.measureIndex]);
}
