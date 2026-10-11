declare const __PORTABLE_ASSETS__: Readonly<Record<string, string>> | undefined;

export function isPortableBuild(): boolean {
  return typeof __PORTABLE_ASSETS__ !== "undefined";
}

/** Resolve bundled public assets without file:// fetches or absolute disk paths. */
export function publicAssetUrl(path: string): string {
  if (typeof __PORTABLE_ASSETS__ === "undefined") return path;
  return __PORTABLE_ASSETS__?.[path] ?? path;
}
