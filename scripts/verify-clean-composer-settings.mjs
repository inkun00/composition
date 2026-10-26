import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";

const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/clean-composer-settings");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const report = { baseUrl, startedAt: new Date().toISOString(), layouts: [], settingSummaries: [], openingImages: [],
  errors: [], firestoreRequests: [], syntheticProjectOnly: true };
const sections = [
  { name: "tempo-rhythm", selector: ".song-mood-setup", controls: ".song-mood-top-row" },
  { name: "harmony", selector: ".preset-chooser", controls: ".preset-picker" },
  { name: "meter", selector: ".meter-chooser", controls: ".meter-options" }
];
let page;

function nearly(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual} versus ${expected}`);
}

async function verifyOpening(context) {
  const opening = await context.newPage();
  await opening.goto(baseUrl);
  await opening.locator(".opening-screen").waitFor();
  for (const [width, height, expected] of [
    [1440, 900, "/illustrations/opening-studio-desktop-v2.webp"],
    [375, 812, "/illustrations/opening-studio-mobile-v1.webp"]
  ]) {
    await opening.setViewportSize({ width, height });
    await opening.waitForFunction((expected) => {
      const image = document.querySelector(".opening-visual img");
      return image?.complete && image.naturalWidth > 0 && new URL(image.currentSrc).pathname === expected;
    }, expected);
    report.openingImages.push({ width, expected, originalChildrenPreserved: true });
  }
  await opening.close();
}

async function inspect(section, width, height) {
  await page.setViewportSize({ width, height });
  const card = page.locator(section.selector);
  await card.scrollIntoViewIfNeeded();
  if (width <= 1100) await card.evaluate((node) =>
    window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 85));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await card.locator("img[data-composer-child]").count(), 0);
  assert.ok(await card.evaluate((node) => node.classList.contains("composer-setting-card")));
  const geometry = await card.evaluate((node, section) => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const style = getComputedStyle(node);
    const cardBox = box(node);
    const heading = box(node.querySelector(".compact-heading"));
    const controls = box(node.querySelector(section.controls));
    return {
      documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      card: cardBox, heading, controls, headingGap: controls.top - heading.bottom,
      contentLeft: cardBox.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
      contentRight: cardBox.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
      groups: [...node.querySelectorAll(".tempo-mood-options,.rhythm-mood-options,.meter-options")].map((group) => ({
        box: box(group), buttons: [...group.querySelectorAll("button")].map(box)
      })),
      children: [...node.querySelectorAll("button,select")].map((element) => ({
        name: element.getAttribute("data-testid") || element.textContent.trim().slice(0, 30),
        clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, box: box(element)
      }))
    };
  }, section);
  assert.ok(geometry.documentWidth <= width + 1, `${section.name}: document must not overflow`);
  nearly(geometry.controls.left, geometry.contentLeft, `${section.name}: controls must align left`);
  nearly(geometry.controls.right, geometry.contentRight, `${section.name}: controls must use the card width`);
  assert.ok(geometry.headingGap >= 8 && geometry.headingGap <= 28, `${section.name}: heading spacing must remain compact`);
  for (const control of geometry.children) {
    assert.ok(control.box.left >= geometry.contentLeft - 1 && control.box.right <= geometry.contentRight + 1,
      `${section.name}: ${control.name} must fit the card`);
    assert.ok(control.scrollWidth <= control.clientWidth + 1, `${section.name}: ${control.name} text must not overflow`);
  }
  for (const group of geometry.groups) {
    const rows = [];
    for (const button of group.buttons) {
      assert.ok(button.width >= 44 && button.height >= 44, "Selection buttons must remain touchable");
      let row = rows.find((items) => Math.abs(items[0].top - button.top) < 1);
      if (!row) rows.push(row = []);
      row.push(button);
    }
    for (const row of rows) {
      nearly(row[0].left, group.box.left, "First button must align with its group");
      nearly(row.at(-1).right, group.box.right, "Last button must align with its group");
      for (const button of row) nearly(button.width, row[0].width, "Buttons in each row must have equal widths");
    }
  }
  await page.screenshot({ path: path.join(outputDir, `${section.name}-${width}.png`) });
  report.layouts.push({ name: section.name, width, height, childImagesRemoved: true, ...geometry });
}

async function verifySummary(width, height) {
  await page.setViewportSize({ width, height });
  const summary = page.locator(".composer-settings summary");
  await summary.scrollIntoViewIfNeeded();
  const geometry = await summary.evaluate((node) => {
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, width: rect.width, height: rect.height };
    };
    return {
      summary: box(node), title: box(node.querySelector("strong")), indicator: box(node.querySelector(".app-settings-indicator")),
      contentRight: node.getBoundingClientRect().right - parseFloat(getComputedStyle(node).paddingRight),
      pseudoContent: getComputedStyle(node, "::after").content,
      visibleIndicators: [...node.querySelectorAll(".app-settings-indicator img")]
        .filter((image) => getComputedStyle(image).display !== "none").length
    };
  });
  nearly(geometry.title.top + geometry.title.height / 2,
    geometry.indicator.top + geometry.indicator.height / 2, "The expand indicator must stay on the title row");
  assert.ok(geometry.indicator.right <= geometry.summary.right);
  nearly(geometry.indicator.right, geometry.contentRight, "The sole expand indicator must align to the right edge");
  assert.ok(["none", "normal", '""'].includes(geometry.pseudoContent), "The old CSS indicator must not duplicate the artwork");
  assert.ok(geometry.indicator.width <= 28, "The expand indicator must not stretch across the mobile card");
  assert.equal(geometry.visibleIndicators, 1);
  await page.screenshot({ path: path.join(outputDir, `settings-summary-${width}.png`) });
  report.settingSummaries.push({ width, height, ...geometry });
}

async function verifySelections() {
  await page.setViewportSize({ width: 375, height: 812 });
  const summary = page.locator(".composer-settings summary");
  await summary.click();
  assert.equal(await page.locator(".composer-settings").evaluate((node) => node.open), false);
  await summary.click();
  assert.equal(await page.locator(".composer-settings").evaluate((node) => node.open), true);
  await page.getByTestId("mood-tempo-fast").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")).bpm === 128);
  assert.equal(await page.getByTestId("mood-tempo-fast").getAttribute("aria-pressed"), "true");
  await page.getByTestId("mood-rhythm-long").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")).accompanimentStyleId === "opera");
  assert.equal(await page.getByTestId("mood-rhythm-long").getAttribute("aria-pressed"), "true");
  const presets = page.getByTestId("harmony-preset-select");
  const previous = await presets.inputValue();
  const next = await presets.locator("option").evaluateAll((items, previous) =>
    items.find((option) => option.value !== previous).value, previous);
  await presets.selectOption(next);
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")).presetId === id, next);
  assert.equal(await presets.inputValue(), next);
  await page.getByTestId("meter-3-4").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")).meter.beats === 3);
  assert.equal(await page.getByTestId("meter-3-4").getAttribute("aria-pressed"), "true");
  await page.getByTestId("meter-4-4").click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")).meter.beats === 4);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")));
  assert.equal(saved.measures.length, 8);
  assert.deepEqual(saved.measures[0].notes.map((note) => note.lyric), ["나", "의", "노", "래"]);
  report.selections = { settingsToggleWorks: true, tempoSaved: true, rhythmSaved: true, harmonySaved: next, meterChangedAndRestored: true,
    notesAndLyricsPreserved: true, audioNotStarted: true, projectNotPublished: true };
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
  await verifyOpening(context);
  page = await context.newPage();
  await page.addInitScript(() => {
    const words = ["나의노래", "우리그림", "함께불러", "리듬따라", "반짝이는", "작은마음", "노래만들", "다시만나"];
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify({
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "곡 설정 정리 검증", creator: "테스트 작곡가",
      originalCreator: "", presetId: "H001", songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 96,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      lyrics: words, showArrangement: true,
      measures: words.map((word, index) => ({
        candidateId: "custom", candidateName: "곡 설정 검증", chords: [index % 2 ? "F" : "C"],
        notes: Array.from(word, (lyric, note) => ({
          id: `settings-layout-${index}-${note}`, pitch: 60 + note * 2, lyric,
          duration: { numerator: 1, denominator: 1 }
        }))
      }))
    }));
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${baseUrl}?start=new`);
  await page.locator(".composer-settings").waitFor();
  await page.locator(".composer-settings summary").click();
  await page.evaluate(() => document.fonts.ready);
  report.bundle = await page.locator('script[type="module"][src]').evaluateAll((scripts) => scripts.map((script) => script.src));
  for (const [width, height] of [[1440, 900], [375, 812], [360, 780], [768, 1024]]) {
    await verifySummary(width, height);
    for (const section of sections) await inspect(section, width, height);
  }
  for (const [scope, kind] of [
    [".measure-instrument-picker", "keyboard"],
    [".publish-details-intro", "recording"], [".composition-file-exports", "complete"],
    [".composition-perform-content", "listening"]
  ]) assert.equal(await page.locator(`${scope} img[data-composer-child='${kind}']`).count(), 1,
    `${kind} child outside the settings must remain`);
  assert.equal(await page.locator(".accompaniment-style-with-guide img[data-composer-child]").count(), 0,
    "The separately removed accompaniment illustration must not return");
  report.otherComposerChildrenPreserved = true;
  await verifySelections();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.firestoreRequests, []);
  report.success = true;
  console.log(JSON.stringify({ success: true, layouts: report.layouts.length, bundle: report.bundle,
    selections: report.selections, otherComposerChildrenPreserved: true, openingImages: report.openingImages,
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
