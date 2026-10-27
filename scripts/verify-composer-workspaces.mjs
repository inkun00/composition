import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { preview } from "vite";

const output = process.env.OUTPUT_DIR || "artifacts/structure-refresh";
await mkdir(output, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const report = { baseUrl, layouts: [], checks: [], errors: [], syntheticProjectOnly: true };
let page;

async function newPage(seed = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  // Verification never writes test projects to the public cloud service.
  await context.route("**/firestore.googleapis.com/**", (route) => route.abort());
  if (seed) await context.addInitScript(() => {
    const words = ["나의노래", "우리그림", "함께불러", "리듬따라", "반짝이는", "작은마음", "노래만들", "다시만나"];
    const measures = words.map((word, index) => ({
      candidateId: "custom", candidateName: "구조 확인", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word, (lyric, note) => ({ id: `structure-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 1, denominator: 1 } }))
    }));
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify({ version: 1, updatedAt: Date.now(), sourceHash: "",
      title: "우리의 작은 노래", creator: "새로운 작곡가", originalCreator: "", presetId: "H001", songLength: 8,
      meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "piano", accompanimentStyleId: "arpeggio",
      accompanimentInstrumentIds: ["piano"], lyrics: words, measures, showArrangement: true }));
  });
  const current = await context.newPage();
  current.on("pageerror", (error) => report.errors.push(error.message));
  await current.goto(`${baseUrl}?start=new`);
  await current.locator("#composer-tab-melody").waitFor();
  await current.evaluate(() => document.fonts.ready);
  return current;
}

async function selectView(view) {
  await page.locator(`#composer-tab-${view}`).click();
  assert.equal(await page.locator(`#composer-panel-${view}`).isVisible(), true);
  assert.equal(await page.locator(".composer-workspace-panel:visible").count(), 1);
}

try {
  page = await newPage();
  await selectView("arrange");
  assert.equal(await page.getByRole("button", { name: "가락 만들기로", exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "가락 만들기로", exact: true }).click();
  await page.locator(".candidate-card .select-row").first().click();
  assert.equal(await page.getByTestId("select-measure-1").getAttribute("aria-pressed"), "true");
  await page.locator(".note-tools-disclosure > summary").click();
  await page.getByTestId("split-note").click();
  await page.locator(".history-actions").getByRole("button", { name: "되돌리기", exact: true }).click();
  await selectView("publish");
  await selectView("melody");
  assert.equal(await page.locator(".note-tools-disclosure").getAttribute("open"), "");
  assert.ok((await page.locator(".focused-measure-editor .note-hit").count()) > 0);
  await page.locator("#composer-tab-melody").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#composer-tab-arrange").getAttribute("aria-selected"), "true");
  report.checks.push("Incomplete workspace guidance, candidate selection, note editing/undo, keyboard tabs and disclosure retention");
  await page.context().close();

  page = await newPage(true);
  await page.locator(".focused-measure-editor .vex-score-layer[data-vex-ready=true]").waitFor();
  await page.evaluate(() => { window.__editorNode = document.querySelector(".focused-measure-editor"); });
  for (const [width, height] of [[1440, 1000], [768, 1024], [375, 812], [320, 740]]) {
    await page.setViewportSize({ width, height });
    for (const view of ["melody", "arrange", "publish"]) {
      await selectView(view);
      await page.evaluate(() => scrollTo(0, 0));
      const metrics = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        visibleButtons: [...document.querySelectorAll("button")].filter((el) => el.checkVisibility()).length
      }));
      assert.ok(metrics.width <= width + 1, `${view} overflow at ${width}: ${metrics.width}`);
      const tabs = await page.locator(".composer-workspace-tab").evaluateAll((els) => els.map((el) => ({
        top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height
      })));
      assert.ok(tabs.every((tab) => tab.height >= 44 && Math.abs(tab.top - tabs[0].top) < 1));
      await page.screenshot({ path: `${output}/${view}-${width}.png` });
      if (width === 1440) await page.screenshot({ path: `${output}/${view}-${width}-full.png`, fullPage: true });
      report.layouts.push({ view, viewport: { width, height }, ...metrics });
    }
  }
  assert.ok(await page.evaluate(() => window.__editorNode === document.querySelector(".focused-measure-editor")));
  assert.equal(await page.getByTestId("song-title").inputValue(), "우리의 작은 노래");
  report.checks.push("All three workspaces at 1440, 768, 375 and 320px; same mounted editor and preserved title");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await selectView("arrange");
  await page.locator(".composer-instrument-library > summary").click();
  await page.getByTestId("instrument-marimba").click();
  await page.locator(".accompaniment-tracks-disclosure > summary").click();
  await page.getByTestId("accompaniment-instrument-flute").click();
  await page.locator(".beat-disclosure > summary").click();
  await selectView("melody");
  await selectView("arrange");
  assert.equal(await page.getByTestId("instrument-marimba").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".beat-disclosure").getAttribute("open"), "");
  assert.equal(await page.getByTestId("accompaniment-instrument-flute").getAttribute("aria-pressed"), "true");
  await page.locator(".all-lyrics-disclosure > summary").click();
  await page.locator(".lyrics-grid .vex-score-layer[data-vex-ready=true]").first().waitFor();
  report.checks.push("Instrument selection, beat disclosure and all lyrics remain available after switching");

  await selectView("publish");
  await page.getByTestId("record-song-mp3").click();
  await page.locator(".recording-guide-dialog").waitFor();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByRole("dialog", { name: "장면 그리기", exact: true }).waitFor();
  await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
  report.checks.push("Recording guide and music video studio open from publish workspace");

  for (const view of ["melody", "arrange", "publish"]) {
    await selectView(view);
    assert.ok(await page.locator("[data-pdf-page=true]").first().evaluate((el) =>
      el.getBoundingClientRect().width > 700 && !el.closest("[hidden]")));
  }
  report.checks.push("PDF render pages retain their full geometry outside hidden task panels");

  await selectView("melody");
  await page.getByTestId("play-song-from-start").click();
  await page.getByTestId("stop-song-playback").waitFor({ timeout: 30000 });
  await selectView("publish");
  assert.equal(await page.getByTestId("stop-song-playback").isVisible(), true);
  await page.getByTestId("stop-song-playback").click();
  await page.getByTestId("stop-song-playback").waitFor({ state: "hidden" });
  report.checks.push("Full-song playback continues across tabs and global stop remains usable");
  assert.deepEqual(report.errors, []);
  report.success = true;
} catch (error) {
  report.success = false;
  report.failure = String(error);
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/verification-failure.png` });
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await server?.httpServer.close();
}
