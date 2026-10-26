import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";

const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/candidate-feeling-layout");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const report = { baseUrl, startedAt: new Date().toISOString(), layouts: [], errors: [], firestoreRequests: [],
  syntheticProjectOnly: true };
let page;

function assertNearlyEqual(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual} versus ${expected}`);
}

async function verifyTabs(width, height) {
  await page.setViewportSize({ width, height });
  const guide = page.locator(".candidate-selection-header");
  await guide.scrollIntoViewIfNeeded();
  if (width <= 1100) {
    await guide.evaluate((node) =>
      window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 85));
  }
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator(".candidate-sidebar img[data-composer-child]").count(), 0,
    "Only the melody candidate illustration must be removed");
  assert.equal(await page.locator(".measure-instrument-picker > img[data-composer-child='keyboard']").count(), 1,
    "The keyboard child in the separate instrument picker must remain");
  const tabs = guide.getByRole("tab");
  assert.equal(await tabs.count(), 5);
  const geometry = await guide.evaluate((node) => {
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const tablist = node.querySelector(".candidate-feeling-tabs");
    return {
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      guide: rect(node), tablist: rect(tablist),
      tabs: [...tablist.querySelectorAll("button")].map((tab) => ({
        id: tab.id, text: tab.textContent.trim(), ...rect(tab)
      }))
    };
  });
  assert.ok(geometry.documentWidth <= width + 1, "The document must not overflow horizontally");
  assertNearlyEqual(geometry.tablist.width, geometry.guide.width, "Feeling buttons must use the removed picture's column");
  const rows = [];
  for (const tab of geometry.tabs) {
    assert.ok(tab.width >= 44 && tab.height >= 44, "Every feeling button must have a usable touch target");
    assert.ok(tab.left >= geometry.tablist.left - 1 && tab.right <= geometry.tablist.right + 1,
      "Every feeling button must fit its tablist");
    let row = rows.find((item) => Math.abs(item[0].top - tab.top) < 1);
    if (!row) rows.push(row = []);
    row.push(tab);
  }
  assert.deepEqual(rows.map((row) => row.length), width <= 360 ? [2, 2, 1] : [3, 2]);
  for (const row of rows) {
    assertNearlyEqual(row[0].left, geometry.tablist.left, "Every button row must align at the left edge");
    assertNearlyEqual(row.at(-1).right, geometry.tablist.right, "Every button row must align at the right edge");
    for (const tab of row)
      assertNearlyEqual(tab.width, row[0].width, "Buttons in each row must have matching widths");
    for (let index = 1; index < row.length; index++)
      assert.ok(row[index].left > row[index - 1].right, "Neighboring buttons must not overlap");
  }
  const clicked = [];
  for (let index = 0; index < 5; index++) {
    const tab = tabs.nth(index);
    const id = await tab.getAttribute("id");
    await tab.click();
    assert.equal(await tab.getAttribute("aria-selected"), "true");
    assert.equal(await guide.locator("[role=tab][aria-selected=true]").count(), 1);
    assert.equal(await page.locator("#melody-feeling-panel").getAttribute("aria-labelledby"), id);
    clicked.push(id);
  }
  await tabs.nth(4).press("ArrowRight");
  assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.id), clicked[0]);
  await tabs.nth(0).press("ArrowLeft");
  assert.equal(await tabs.nth(4).getAttribute("aria-selected"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.id), clicked[4]);
  assert.equal(await guide.locator("[role=tab][tabindex='0']").count(), 1);
  await tabs.nth(0).click();
  await page.screenshot({ path: path.join(outputDir, `candidate-feelings-${width}.png`) });
  report.layouts.push({ width, height, ...geometry, rowCounts: rows.map((row) => row.length),
    fiveSelectionsWork: true, rightArrowWrapWorks: true, leftArrowWrapWorks: true,
    candidateChildRemoved: true, otherKeyboardChildPreserved: true });
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("**/*", (route) => {
    if (/firestore\.googleapis\.com|firebaseio\.com/.test(route.request().url())) {
      report.firestoreRequests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    const words = ["나의노래", "우리그림", "함께불러", "리듬따라", "반짝이는", "작은마음", "노래만들", "다시만나"];
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify({
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "가락 느낌 버튼 확인", creator: "테스트 작곡가",
      originalCreator: "", presetId: "H001", songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 96,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      lyrics: words, showArrangement: true,
      measures: words.map((word, index) => ({
        candidateId: "custom", candidateName: "가락 느낌 정렬 검증", chords: [index % 2 ? "F" : "C"],
        notes: Array.from(word, (lyric, note) => ({
          id: `feeling-layout-${index}-${note}`, pitch: 60 + note * 2, lyric,
          duration: { numerator: 1, denominator: 1 }
        }))
      }))
    }));
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${baseUrl}?start=new`);
  await page.locator(".candidate-sidebar").waitFor();
  await page.evaluate(() => document.fonts.ready);
  report.bundle = await page.locator('script[type="module"][src]').evaluateAll((scripts) => scripts.map((script) => script.src));
  for (const [width, height] of [[1440, 900], [375, 812], [360, 780], [768, 1024]])
    await verifyTabs(width, height);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.firestoreRequests, []);
  report.success = true;
  console.log(JSON.stringify({ success: true, bundle: report.bundle,
    layouts: report.layouts.map(({ width, rowCounts, fiveSelectionsWork, rightArrowWrapWorks, leftArrowWrapWorks }) =>
      ({ width, rowCounts, fiveSelectionsWork, rightArrowWrapWorks, leftArrowWrapWorks })),
    errors: report.errors, firestoreRequests: report.firestoreRequests }, null, 2));
} catch (error) {
  report.success = false;
  report.failure = String(error);
  await page?.screenshot({ path: path.join(outputDir, "failure.png") });
  console.error(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
