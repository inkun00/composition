import { useState } from "react";
import type { ComposerWorkspaceView } from "../components/ComposerWorkspaceTabs";
import type { SaveIssue } from "../music/draftValidation";

function isVisible(element: Element) {
  if (!element.isConnected || element.closest("[hidden]")) return false;
  if (typeof element.checkVisibility === "function") return element.checkVisibility();
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

/** View state is deliberately separate from the saved arrangement/playback state. */
export function useComposerWorkspace() {
  const [view, setView] = useState<ComposerWorkspaceView>("melody");

  function changeView(next: ComposerWorkspaceView) {
    const previousFocus = document.activeElement;
    setView(next);
    window.requestAnimationFrame(() => {
      const tab = document.getElementById(`composer-tab-${next}`);
      const visibleModal = [...document.querySelectorAll('[aria-modal="true"]')].some(isVisible);
      if (previousFocus && !isVisible(previousFocus) && !visibleModal) {
        tab?.focus({ preventScroll: true });
      }
      tab?.scrollIntoView({ block: "nearest" });
    });
  }

  function revealSaveIssue(issue: SaveIssue) {
    setView(["title", "creator", "description"].includes(issue.target) ? "publish" : "melody");
    window.setTimeout(() => {
      const key = issue.measureIndex !== undefined ? `measure-${issue.measureIndex}` : issue.target;
      const target = document.querySelector<HTMLElement>(`[data-save-target="${key}"]`);
      if (!target) return;
      for (let parent: HTMLElement | null = target; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      const control = target.matches("button, input, textarea") ? target
        : target.querySelector<HTMLElement>("input, textarea, button, summary");
      control?.focus({ preventScroll: true });
    }, 50);
  }

  return { view, changeView, revealSaveIssue };
}
