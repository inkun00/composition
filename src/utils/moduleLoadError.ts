/** Detect code/CSS download failures without treating ordinary API failures as stale code. */
export function isModuleLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  if (typeof message !== "string") return false;
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk [\s\S]* failed|Unable to preload CSS for\b/i.test(message);
}
