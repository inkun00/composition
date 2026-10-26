export const LOST_DRAWING_PROMPT_SHOWN_KEY = "maeum-melody:lost-drawings:auto-prompt-shown:v1";

const storageAreas = [() => window.localStorage, () => window.sessionStorage];

export function wasLostDrawingPromptShown(): boolean {
  for (const area of storageAreas) {
    try {
      if (area().getItem(LOST_DRAWING_PROMPT_SHOWN_KEY) === "1") return true;
    } catch { /* A browser can restrict one storage area independently. */ }
  }
  return false;
}

/** This preference never changes a recovery record or the current project. */
export function rememberLostDrawingPromptShown(): void {
  for (const area of storageAreas) {
    try {
      area().setItem(LOST_DRAWING_PROMPT_SHOWN_KEY, "1");
      return;
    } catch { /* Try the session fallback when persistent storage is unavailable. */ }
  }
}
