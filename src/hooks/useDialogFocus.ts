import { useEffect, useRef } from "react";

const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex='-1'])";

function visible(element: HTMLElement) {
  if (element.closest("[hidden], [inert]") || getComputedStyle(element).visibility === "hidden") return false;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (getComputedStyle(ancestor).display === "none") return false;
    if (ancestor.matches("details:not([open])") &&
      !ancestor.querySelector(":scope > summary")?.contains(element)) return false;
  }
  return true;
}

/** Keep keyboard navigation inside the front dialog, then return to its opener. */
export function useDialogFocus<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let currentDialog: HTMLElement | null = null;
    function topDialog() {
      return [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
        .filter(visible).at(-1) ?? null;
    }
    function focusables(dialog: HTMLElement) {
      return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
    }
    function enterDialog() {
      const dialog = topDialog();
      if (!dialog || !root?.contains(dialog) || dialog === currentDialog) return;
      currentDialog = dialog;
      if (!dialog.contains(document.activeElement)) (focusables(dialog)[0] ?? dialog).focus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const dialog = topDialog();
      if (!dialog || !root?.contains(dialog)) return;
      const items = focusables(dialog);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (!dialog.contains(document.activeElement) ||
        (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
    enterDialog();
    const observer = new MutationObserver(enterDialog);
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => {
        const dialog = topDialog();
        if (opener?.isConnected && (!dialog || dialog.contains(opener))) opener.focus({ preventScroll: true });
      });
    };
  }, []);
  return ref;
}
