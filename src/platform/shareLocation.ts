export const HOSTED_APP_ORIGIN = "https://maeum-melody.vercel.app";

type ShareLocation = Pick<Location, "origin" | "pathname">;

/** Shared links must open on other devices, including when the editor is local. */
export function shareLocation(location: ShareLocation): ShareLocation {
  if (location.origin === "null" || location.origin.startsWith("file:")) {
    return { origin: HOSTED_APP_ORIGIN, pathname: "/" };
  }
  try {
    const hostname = new URL(location.origin).hostname;
    if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
      return { origin: HOSTED_APP_ORIGIN, pathname: "/" };
    }
  } catch {
    // Keep existing behavior for an unrecognized custom host.
  }
  return location;
}
