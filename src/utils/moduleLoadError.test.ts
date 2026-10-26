import { describe, expect, it } from "vitest";
import { isModuleLoadError } from "./moduleLoadError";

describe("code and CSS download failure detection", () => {
  it.each([
    new TypeError("Failed to fetch dynamically imported module: https://example.com/assets/jspdf-old.js"),
    new TypeError("error loading dynamically imported module: https://example.com/assets/qrSongs-old.js"),
    new TypeError("Importing a module script failed."),
    { name: "ChunkLoadError", message: "Loading chunk 4 failed.\n(error: /assets/pdf.js)" },
    new Error("Loading CSS chunk 7 failed."),
    new Error("Unable to preload CSS for /assets/index-old.css")
  ])("recognizes browser and bundler module failures: %s", (error) => {
    expect(isModuleLoadError(error)).toBe(true);
  });

  it.each([
    new TypeError("Failed to fetch"),
    new Error("firebase-not-configured"),
    { code: "permission-denied", message: "Missing or insufficient permissions." },
    new Error("qr-link-too-long"),
    new Error("PDF rendering failed"),
    new Error("Canvas is unavailable"),
    new DOMException("cancelled", "AbortError"),
    "Failed to fetch dynamically imported module",
    null,
    undefined,
    { message: 404 }
  ])("keeps ordinary export and API failures separate: %s", (error) => {
    expect(isModuleLoadError(error)).toBe(false);
  });
});
