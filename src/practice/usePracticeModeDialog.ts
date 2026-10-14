import { useEffect, useRef, type RefObject } from "react";

export function usePracticeModeDialog(
  onClose: () => void,
  returnFocusRef?: RefObject<HTMLButtonElement | null>
) {
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFrame = useRef<number | null>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  useEffect(() => {
    if (restoreFrame.current !== null) {
      window.cancelAnimationFrame(restoreFrame.current);
      restoreFrame.current = null;
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const firstChoice = dialog?.querySelector<HTMLButtonElement>(
      '.practice-mode-choice[aria-pressed="true"]'
    ) ?? dialog?.querySelector<HTMLButtonElement>(".practice-mode-choice");
    firstChoice?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeHandler.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first || !last) return;
      const focusOutside = !dialog.contains(document.activeElement);
      if (focusOutside || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      function restoreFocus() {
        const target = returnFocusRef?.current ?? (
          previousFocus?.isConnected && previousFocus !== document.body ? previousFocus : null
        );
        if (target?.isConnected && !target.closest("[inert]")) target.focus({ preventScroll: true });
      }
      restoreFocus();
      // The browser may blur a removed control after React's cleanup. Restore
      // focus on the next frame, once inert and the closing click have settled.
      restoreFrame.current = window.requestAnimationFrame(() => {
        restoreFrame.current = null;
        if (!dialog?.isConnected) restoreFocus();
      });
    };
  }, [returnFocusRef]);

  return dialogRef;
}
