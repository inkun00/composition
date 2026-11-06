import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { observeDynamicsAudio, verifyDynamics } from "./dynamics-game-checks.mjs";

const output = process.env.OUTPUT_DIR || "artifacts/dynamics-game";
await mkdir(output, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const report = { checks: [], errors: [] };
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await observeDynamicsAudio(context);
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(process.env.APP_URL || server.resolvedUrls.local[0]);
  await page.locator(".opening-learn").click();
  await verifyDynamics(page, report, output);
  assert.deepEqual(report.errors, []);
  report.success = true;
} catch (error) {
  report.success = false;
  report.failure = String(error);
  if (page) await page.screenshot({ path: `${output}/failure.png` });
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await server?.httpServer.close();
}
