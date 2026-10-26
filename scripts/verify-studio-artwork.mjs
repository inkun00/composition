import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { observeStudioAudio } from "./studio-playback-observations.mjs";

// Run only after the product build is frozen. APP_URL runs the same focused QA
// on production. This reads native images/audio and never replaces product APIs.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-studio-artwork");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const controls = ["video", "select", "brush", "eraser", "line", "rectangle", "ellipse", "rotate-back", "redo",
  "delete", "palette", "check", "play", "pause", "close", "expand", "plus", "sparkles", "chevron-down",
  "music", "save", "upload", "loading", "settings", "headphones", "download", "arrow-right"];
const categories = {
  entrance: ["draw-on", "fade", "slide", "pop-in", "assemble", "rotate-in", "flip-in"],
  transition: ["zoom", "iris", "curtain", "diagonal-reveal", "zoom-out"],
  travel: ["move-left", "move-right", "move-up", "move-down", "move-up-left", "move-up-right",
    "move-down-left", "move-down-right", "bounce-left", "bounce-right"],
  atmosphere: ["still", "float", "bounce", "pulse", "sparkle", "confetti", "snow", "spotlight"]
};
const motions = Object.values(categories).flat();
const keys = [...controls, ...motions.map((id) => `motion-${id}`)];
const DRAFT_KEY = "maeum-melody:draft:v1";
const report = { startedAt: new Date().toISOString(), baseUrl, errors: [], downloads: [], layouts: [] };
let page;
let audio;

async function seedFixture() {
  return page.evaluate((key) => {
    const words = ["별빛노래", "그림따라", "함께노래", "리듬따라"];
    const measures = Array.from({ length: 16 }, (_, index) => ({ candidateId: "custom", candidateName: "그림 아이콘 검증",
      chords: [index % 2 ? "F" : "C"], notes: Array.from(words[index % 4], (lyric, note) => ({
        id: `artwork-note-${index}-${note}`, pitch: 60 + note * 2, lyric, duration: { numerator: 1, denominator: 1 } })) }));
    const scenes = Array.from({ length: 12 }, (_, index) => ({ id: `artwork-scene-${index}`, background: "#ffffff",
      motion: "still", endLyric: null, endMeasureIndex: index === 11 ? 15 : index, elements: [
        { id: `artwork-${index}-switch`, tool: "rectangle", color: "#1e293b", width: 8,
          points: [[250, 180, .5], [340, 350, .5]] },
        { id: `artwork-${index}-hand`, tool: "brush", color: "#1e293b", width: 8,
          points: [[740, 210, .5], [580, 240, .5], [480, 290, .5], [320, 290, .5], [320, 275, .5],
            [500, 260, .5], [465, 310, .5], [490, 330, .5], [460, 365, .5], [520, 360, .5],
            [500, 390, .5], [565, 390, .5], [645, 320, .5], [740, 290, .5]] }
      ] }));
    const draft = { version: 1, updatedAt: Date.now(), sourceHash: "", title: "우리의 그림으로 만드는 뮤직비디오", creator: "그림 UI 검증",
      originalCreator: "", presetId: "H001", songLength: 16, meter: { beats: 4, beatUnit: 4 }, bpm: 180,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      lyrics: Array.from({ length: 16 }, (_, index) => words[index % 4]), measures, showArrangement: true, musicVideoScenes: scenes };
    localStorage.setItem(key, JSON.stringify(draft));
    return scenes;
  }, DRAFT_KEY);
}

async function savedScenes() {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).musicVideoScenes, DRAFT_KEY);
}

async function decodeArtwork(locator) {
  return locator.evaluateAll(async (images) => Promise.all(images.map(async (image) => {
    await image.decode();
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) throw new Error(`Undecoded artwork: ${image.src}`);
    return { key: image.dataset.studioArtwork, src: image.src, width: image.naturalWidth, height: image.naturalHeight };
  })));
}

async function verifyAssets() {
  assert.equal(keys.length, 57);
  const files = await Promise.all(keys.map(async (key) => {
    const response = await page.request.get(new URL(`/studio-images/v1/${key}.webp`, baseUrl).href);
    assert.equal(response.status(), 200, `${key} must be deployed`);
    assert.match(response.headers()["content-type"] || "", /image\/webp/);
    const bytes = await response.body();
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", `${key} must contain an actual WebP bitstream`);
    return { key, bytes: bytes.length };
  }));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  assert.ok(totalBytes < 3_000_000, `The 57 artwork assets exceed 3 MB: ${totalBytes}`);
  const decoded = await page.evaluate(async (names) => Promise.all(names.map(async (name) => {
    const image = new Image();
    image.src = `/studio-images/v1/${name}.webp`;
    await image.decode();
    if (image.naturalWidth <= 0) throw new Error(`Failed WebP decode: ${name}`);
    return { key: name, width: image.naturalWidth, height: image.naturalHeight };
  })), keys);
  return { count: files.length, totalBytes, files, decoded };
}

async function assertReachable(button, minimum = 44) {
  await button.scrollIntoViewIfNeeded();
  if (!await button.isDisabled()) await button.click({ trial: true });
  const box = await button.boundingBox();
  assert.ok(box && box.width >= minimum - .1 && box.height >= minimum - .1,
    `${await button.getAttribute("aria-label") || await button.innerText()} must have a ${minimum}px target`);
  return box;
}

async function showPanel(name) {
  const button = page.getByRole("button", { name, exact: true });
  if (await button.isVisible()) await button.click();
}

async function verifyLayout(width, height) {
  await page.setViewportSize({ width, height });
  await showPanel("그림판 보기");
  const tools = page.getByRole("toolbar", { name: "그림판 도구", exact: true });
  for (const label of ["선택", "붓", "지우개", "직선", "네모", "동그라미", "그림 되돌리기", "그림 다시 실행", "현재 장면 비우기"])
    await assertReachable(tools.getByRole("button", { name: label, exact: true }));
  await tools.evaluate((element) => { element.scrollLeft = 0; element.scrollTop = 0; });
  await page.locator(".mv-workspace").evaluate((element) => { element.scrollTop = 0; });
  await page.locator(".mv-scene-settings").evaluate((element) => { element.scrollTop = 0; });
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="scene-paint-canvas"]');
    const drawing = canvas.getBoundingClientRect();
    const workspace = document.querySelector(".mv-workspace").getBoundingClientRect();
    const timeline = document.querySelector(".mv-timeline").getBoundingClientRect();
    const studio = document.querySelector(".mv-studio");
    return { drawing: drawing.toJSON(), visibleHeight: Math.max(0, Math.min(drawing.bottom, workspace.bottom) - Math.max(drawing.top, workspace.top)),
      timelineTop: timeline.top, isSvg: canvas.tagName.toLowerCase() === "svg", paths: canvas.querySelectorAll("path").length,
      studioWidth: [studio.clientWidth, studio.scrollWidth], documentWidth: [innerWidth, document.documentElement.scrollWidth],
      overflow: studio.scrollWidth > studio.clientWidth + 1 };
  });
  report.currentGeometry = { width, height, ...geometry };
  assert.ok(geometry.isSvg && geometry.paths >= 3, "The user's vector drawing must remain editable SVG");
  assert.ok(geometry.visibleHeight >= geometry.drawing.height - 2, `${width}px must show the whole drawing surface`);
  assert.ok(geometry.drawing.left >= 0 && geometry.drawing.right <= width + 1, "The whole drawing must fit horizontally");
  assert.ok(geometry.drawing.bottom <= geometry.timelineTop + 1, "The timeline must not overlap the drawing");
  if (width >= 1440) assert.ok(geometry.drawing.width >= 700, "Twelve scenes must preserve a useful desktop drawing width");
  assert.equal(geometry.overflow, false, JSON.stringify(geometry));
  for (const id of ["scene-save", "scene-save-options", "scene-reset", "music-video-preview-open", "create-music-video"])
    await assertReachable(page.getByTestId(id));
  await decodeArtwork(page.locator('.mv-studio img[data-studio-artwork]:not([loading="lazy"])'));
  assert.equal(await page.locator(".mv-header svg,.mv-tool-dock svg,.mv-scene-toolbar svg,.mv-footer svg").count(), 0);
  await page.screenshot({ path: path.join(outputDir, `studio-artwork-${width}-paint.png`) });
  await showPanel("장면 설정 보기");
  const seen = [];
  for (const [category, ids] of Object.entries(categories)) {
    await page.getByTestId(`scene-motion-category-${category}`).click();
    for (const id of ids) {
      const card = page.getByTestId(`scene-motion-preset-${id}`);
      await card.click({ trial: true });
      const images = await decodeArtwork(card.locator(`img[data-studio-artwork="motion-${id}"]`));
      assert.equal(images.length, 1);
      assert.equal(await card.locator("svg").count(), 0);
      const stage = await card.locator(".mv-preset-artwork-stage").boundingBox();
      assert.ok(stage && stage.height >= 94, "Motion cards must show large generated scene illustrations");
      seen.push(images[0].src);
    }
  }
  assert.equal(new Set(seen).size, 30, "All 30 cards must use different artwork paths");
  await page.getByTestId("scene-motion-category-entrance").click();
  await page.getByTestId("scene-motion-preset-draw-on").click({ trial: true });
  await page.screenshot({ path: path.join(outputDir, `studio-artwork-${width}-motions.png`) });
  if (width >= 1440) {
    const before = await page.getByTestId("scene-paint-canvas").boundingBox();
    await page.getByTestId("scene-motion-category-atmosphere").click();
    await page.locator(".mv-motion-library-heading").evaluate((element) => element.scrollIntoView({ block: "start" }));
    assert.deepEqual(await page.getByTestId("scene-paint-canvas").boundingBox(), before,
      "Browsing the motion illustrations must leave the painting surface fixed");
    await page.screenshot({ path: path.join(outputDir, `studio-artwork-${width}-motion-library.png`) });
  }
  await showPanel("그림판 보기");
  return { width, height, ...geometry, tools44px: true, uniqueMotionCardImages: seen.length };
}

async function verifyEditingAndFiles(original) {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [category, id] of [["entrance", "fade"], ["travel", "move-up-right"], ["atmosphere", "snow"]]) {
    await page.getByTestId(`scene-motion-category-${category}`).click();
    await page.getByTestId(`scene-motion-preset-${id}`).click();
    await page.waitForFunction(({ key, id }) => JSON.parse(localStorage.getItem(key)).musicVideoScenes[0].motion === id,
      { key: DRAFT_KEY, id });
    const current = await savedScenes();
    assert.deepEqual(current[0].elements, original[0].elements);
    assert.deepEqual(current.slice(1), original.slice(1));
  }
  const jsonDownload = page.waitForEvent("download");
  await page.getByTestId("scene-save").click();
  const file = path.join(outputDir, "artwork-scene.scene.json");
  await (await jsonDownload).saveAs(file);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.scene.motion, "snow");
  assert.deepEqual(saved.scene.elements, original[0].elements);
  await page.getByTestId("scene-save-options").click();
  const menu = page.getByLabel("장면 파일 옵션", { exact: true });
  const menuImages = await decodeArtwork(menu.locator("img[data-studio-artwork]"));
  assert.ok(menuImages.some((image) => image.key === "download") && menuImages.some((image) => image.key === "upload"));
  await page.screenshot({ path: path.join(outputDir, "studio-artwork-file-menu.png") });
  const pngDownload = page.waitForEvent("download");
  await menu.getByRole("button", { name: /이미지\(PNG\)로 저장/ }).click();
  const pngFile = path.join(outputDir, "artwork-scene.png");
  await (await pngDownload).saveAs(pngFile);
  const png = await readFile(pngFile);
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [960, 540]);
  await page.getByTestId("scene-motion-category-entrance").click();
  await page.getByTestId("scene-motion-preset-fade").click();
  await page.getByTestId("scene-save-options").click();
  await menu.getByRole("button", { name: /장면 파일 불러오기/ }).click({ trial: true });
  await page.getByTestId("scene-import-file").setInputFiles(file);
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).musicVideoScenes[0].motion === "snow", DRAFT_KEY);
  assert.deepEqual((await savedScenes())[0], saved.scene);
  return { chosen: ["fade", "move-up-right", "snow"], originalDrawingAndOtherScenesPreserved: true,
    sceneJsonSavedAndImported: true, realPngDimensions: [960, 540], menuImages };
}

async function verifyPlayback() {
  const previousDownloads = report.downloads.length;
  await page.getByTestId("music-video-preview-open").click();
  const modal = page.getByTestId("music-video-preview-dialog");
  await modal.waitFor();
  assert.equal(await modal.locator(".mv-playback-header svg,.mv-playback-controls svg").count(), 0);
  await decodeArtwork(modal.locator("img[data-studio-artwork]"));
  await page.getByTestId("music-video-preview-play").click();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="music-video-preview-time"]')?.getAttribute("data-time")) > .2,
    null, { timeout: 60_000 });
  const clock = await audio.clock();
  const pauseImage = modal.locator('[data-testid="music-video-preview-play"] img[data-studio-artwork="pause"]');
  assert.equal((await decodeArtwork(pauseImage)).length, 1);
  await page.getByTestId("music-video-preview-play").click();
  assert.equal(await page.getByTestId("music-video-preview-play").getAttribute("aria-pressed"), "false");
  await page.screenshot({ path: path.join(outputDir, "studio-artwork-live-preview.png") });
  await page.getByTestId("music-video-preview-close").click();
  await audio.closed(clock.contextId);
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "music-video-preview-open");
  assert.equal(await modal.count(), 0);
  assert.equal(report.downloads.length, previousDownloads);
  assert.equal(await audio.videoEncoders(), 0);
  return { nativeClock: clock, loadedPauseArtwork: true, paused: true, closeStopsAudioAndRestoresFocus: true, noMp4: true };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, hasTouch: true });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("download", (download) => report.downloads.push(download.suggestedFilename()));
  audio = await observeStudioAudio(page);
  await page.goto(`${baseUrl}?start=new`);
  report.bundle = await page.locator('script[type="module"][src]').evaluateAll((items) => items.map((item) => item.src));
  const original = await seedFixture();
  await page.reload();
  report.stage = "57 HTTP WebP assets and native decode";
  report.assets = await verifyAssets();
  await page.getByTestId("draw-music-video-scene").click();
  assert.equal(await page.getByRole("button", { name: /^\d+번 장면 선택$/ }).count(), 12);
  for (const [width, height] of [[1440, 900], [1762, 890], [390, 844], [375, 667]]) {
    report.stage = `${width}x${height} layout and 30 motion illustrations`;
    report.layouts.push(await verifyLayout(width, height));
  }
  assert.deepEqual(await savedScenes(), original, "Browsing generated artwork must not modify drawings or motion");
  report.stage = "motion selection, scene save, PNG, and import";
  report.editing = await verifyEditingAndFiles(original);
  report.stage = "native music preview with generated control images";
  report.playback = await verifyPlayback();
  assert.deepEqual(report.errors, []);
  report.success = true;
  report.stage = "complete";
  console.log(JSON.stringify({ success: true, assets: report.assets.count, bytes: report.assets.totalBytes,
    layouts: report.layouts.map(({ width, height, drawing }) => ({ width, height, canvas: [drawing.width, drawing.height] })),
    editing: report.editing, playback: report.playback, errors: report.errors }, null, 2));
} catch (error) {
  report.success = false;
  report.failure = String(error);
  await page?.screenshot({ path: path.join(outputDir, "failure.png") });
  console.error(String(error));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await audio?.session.detach();
  await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
