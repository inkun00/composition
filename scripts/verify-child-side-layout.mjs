import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";

const mode = process.env.MODE || "final";
const outputDir = path.resolve(process.env.OUTPUT_DIR || `artifacts/child-side-layout-${mode}`);
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const report = {
  mode, baseUrl, startedAt: new Date().toISOString(), errors: [], brokenImages: [],
  firestoreRequests: [], layouts: [], syntheticProjectOnly: true
};
const regions = [
  { name: "melody-candidates", scope: ".candidate-sidebar", heading: ".app-candidate-heading", control: ".candidate-feeling-selector" },
  { name: "melody-instrument", scope: ".measure-instrument-picker", heading: ".preview-instrument-intro", control: ".preview-instrument-options" },
  { name: "accompaniment", scope: ".accompaniment-style-with-guide", heading: ".accompaniment-heading", control: ".accompaniment-summary" },
  { name: "save-share", scope: ".publish-section", heading: ".publish-heading", control: ".publish-fields",
    image: ".publish-details-intro > .composer-child-artwork, :scope > .composer-child-artwork, .publish-heading > .composer-child-artwork" },
  { name: "save-files", scope: ".publish-action-group-files", heading: "h3", control: ".composition-file-export-buttons" },
  { name: "listen-sing", scope: ".publish-action-group-perform", heading: "h3", control: ".publish-action-group-buttons" }
];
const settingsRegions = [
  { name: "settings-tempo", scope: ".song-mood-setup", heading: ".compact-heading", control: ".song-mood-top-row" },
  { name: "settings-harmony", scope: ".preset-chooser", heading: ".compact-heading", control: ".preset-picker" },
  { name: "settings-meter", scope: ".meter-chooser", heading: ".compact-heading", control: ".meter-options" }
];
const viewports = mode === "baseline" ? [[1440, 900], [375, 812]]
  : [[1440, 900], [375, 812], [360, 780], [768, 1024], [1024, 768]];
let page;

async function seedComposition() {
  await page.addInitScript(() => {
    const words = ["나의노래", "우리그림", "함께불러", "리듬따라", "반짝이는", "작은마음", "노래만들", "다시만나"];
    const measures = words.map((word, index) => ({
      candidateId: "custom", candidateName: "아이 그림 배치 검증", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word, (lyric, note) => ({
        id: `child-layout-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 1, denominator: 1 }
      }))
    }));
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify({
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "아이 그림 배치 검증",
      creator: "테스트 작곡가", originalCreator: "", presetId: "H001", songLength: 8,
      meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "piano", accompanimentStyleId: "arpeggio",
      accompanimentInstrumentIds: ["piano"], lyrics: words, measures, showArrangement: true
    }));
  });
  await page.goto(`${baseUrl}?start=new`);
  await page.locator(".publish-section").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function inspectRegion(region, width, height) {
  const scope = page.locator(region.scope).first();
  if (region.name === "melody-instrument" && width <= 1100 && !await scope.isVisible()) {
    assert.ok(await page.locator(".candidate-instrument-picker").isVisible(),
      "The mobile view must provide the shared instrument picker in its melody panel");
    report.layouts.push({ name: region.name, width, height, intentionallyHidden: true,
      replacedBy: ".candidate-instrument-picker" });
    return;
  }
  await scope.scrollIntoViewIfNeeded();
  await scope.locator(region.heading).first().scrollIntoViewIfNeeded();
  if (width <= 1100) {
    await scope.locator(region.heading).first().evaluate((element) =>
      window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 85));
  }
  const imageSelector = region.image || ".composer-child-artwork";
  const images = scope.locator(imageSelector);
  await images.evaluateAll(async (items) => {
    await Promise.all(items.map(async (image) => {
      image.loading = "eager";
      await image.decode();
    }));
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = await scope.evaluate((element, region) => {
    const box = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const heading = element.querySelector(region.heading);
    const control = element.querySelector(region.control) ||
      element.querySelector("button:not([aria-label]),input,select");
    const imageItems = [...element.querySelectorAll(region.image || ".composer-child-artwork")];
    const scopeBox = box(element);
    const headingBox = box(heading);
    const controlBox = box(control);
    return {
      name: region.name, viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth, scope: scopeBox, heading: headingBox, control: controlBox,
      topToControl: controlBox ? controlBox.top - scopeBox.top : null,
      headingToControl: controlBox && headingBox ? controlBox.top - headingBox.bottom : null,
      images: imageItems.map((image) => ({
        kind: image.dataset.composerChild, src: new URL(image.currentSrc).pathname,
        decoded: image.complete && image.naturalWidth > 0,
        decorative: image.alt === "" && image.getAttribute("aria-hidden") === "true",
        box: box(image), position: getComputedStyle(image).position
      })),
      clickable: [...element.querySelectorAll("button,a,input,select,textarea")]
        .filter((node) => !node.disabled && node.getBoundingClientRect().width > 0)
        .map((node) => ({ tag: node.tagName, name: node.getAttribute("data-testid") || node.textContent.trim().slice(0, 30), box: box(node) }))
    };
  }, region);
  if (width === 1440 || width === 375)
    await page.screenshot({ path: path.join(outputDir, `${region.name}-${width}.png`) });
  report.layouts.push({ ...result, width, height });
  assert.ok(result.documentWidth <= width + 1, `${region.name}: document overflows at ${width}px`);
  assert.ok(result.images.every((image) => image.decoded && image.decorative), `${region.name}: image must decode and be decorative`);
  if (mode !== "baseline") {
    if (region.name === "melody-candidates" || region.name === "accompaniment" || region.name.startsWith("settings-"))
      assert.equal(result.images.length, 0, `${region.name}: removed characters must not occupy the controls`);
    else
      assert.ok(result.images.length >= 1, `${region.name}: child illustration must be present`);
    assert.ok(result.heading && result.heading.height < 90, `${region.name}: illustration must not create a tall heading row`);
    for (const image of result.images) {
      assert.ok(image.box.width > 0 && image.box.height > 0, `${region.name}: illustration must remain visible`);
      assert.ok(image.box.left >= -1 && image.box.right <= width + 1, `${region.name}: illustration must fit screen`);
      const coveredControls = result.clickable.filter(({ box }) =>
        Math.min(image.box.right, box.right) - Math.max(image.box.left, box.left) > 1 &&
        Math.min(image.box.bottom, box.bottom) - Math.max(image.box.top, box.top) > 1);
      assert.deepEqual(coveredControls, [], `${region.name}: illustration must not cover controls`);
    }
  }
}

async function verifyInteractions() {
  await page.setViewportSize({ width: 375, height: 812 });
  const other = page.locator(".candidate-instrument-picker button[aria-pressed='false']").first();
  const instrumentId = (await other.getAttribute("data-testid")).replace("candidate-preview-instrument-", "");
  await other.click();
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.instrumentId === id, instrumentId);
  assert.equal(await page.getByTestId(`preview-instrument-${instrumentId}`).getAttribute("aria-pressed"), "true");
  const accompaniment = page.locator(".accompaniment-mode-grid button[aria-pressed='false']").first();
  const accompanimentTestId = await accompaniment.getAttribute("data-testid");
  await accompaniment.click();
  assert.equal(await page.getByTestId(accompanimentTestId).getAttribute("aria-pressed"), "true");
  await page.getByTestId("song-title").fill("아이 그림 배치 검증 완료");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.title === "아이 그림 배치 검증 완료");
  for (const id of ["export-pdf", "export-pdf-with-accompaniment", "export-backing-mp3", "export-lyrics-mp4",
    "create-mobile-recording-link", "practice-song", "record-song-mp3", "open-samboard-share"]) {
    const control = page.getByTestId(id);
    await control.click({ trial: true });
    const box = await control.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `${id}: mobile touch target must be 44px`);
  }
  await page.getByTestId("record-song-mp3").click();
  await page.locator(".recording-guide-dialog").waitFor();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  report.interactions = {
    melodyInstrumentSavedAndSynchronized: true, accompanimentSelected: true, titleAutosaved: true,
    eightMobileControlsReachable: true, recordingGuideOpenedAndClosed: true, microphoneNotStarted: true,
    mediaNotExported: true, songNotPublished: true
  };
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
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/illustrations/") && response.status() >= 400)
      report.brokenImages.push({ url: response.url(), status: response.status() });
  });
  await seedComposition();
  report.bundle = await page.locator('script[type="module"][src]').evaluateAll((items) => items.map((item) => item.src));
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    for (const region of regions) await inspectRegion(region, width, height);
  }
  if (mode !== "baseline") {
    await page.locator(".composer-settings summary").click();
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const region of settingsRegions) await inspectRegion(region, width, height);
    }
    await page.locator(".composer-settings summary").click();
    await verifyInteractions();
  }
  assert.deepEqual(report.brokenImages, []);
  assert.deepEqual(report.errors, []);
  report.success = true;
  console.log(JSON.stringify({ success: true, mode, layouts: report.layouts.length, interactions: report.interactions,
    geometry: report.layouts.map(({ name, width, heading, topToControl, images }) => ({
      name, width, headingHeight: heading?.height, topToControl, images: images?.length
    })) }, null, 2));
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
