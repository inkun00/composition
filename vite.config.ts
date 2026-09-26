import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { homrLocalPlugin } from "./scripts/homr-vite-plugin.mjs";

export default defineConfig({
  plugins: [react(), homrLocalPlugin()],
  server: {
    host: "127.0.0.1",
    port: 4173
  },
  test: {
    environment: "jsdom",
    globals: true
  }
});
