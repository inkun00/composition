import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { TRAVEL_IDS, TRAVEL_DIRECTIONS, artworkMotion, assertTravelDirection,
  compareFixedOverlay, verifyFilledCanvasTravel } from "./scene-travel-verification.mjs";
import { verifySceneBpmGraphics, verifyAppBpmPreview, verifyMp4BeatSync } from "./scene-bpm-verification.mjs";
import { verifyPartialSceneMotion } from "./scene-partial-verification.mjs";
import { verifyTwelveSceneWorkspace, verifyResultDialog, verifyMobilePaintDock } from "./scene-studio-layout-verification.mjs";

// Exercise the actual built app, painting tools, preset renderer, and MP4 encoder.
// No analysis, worker, model, renderer, or export response is mocked.
// Build first. APP_URL optionally verifies an existing deployment. VERIFY_MODE=ui
// exercises layout/focus with one actual MP4 instead of repeating renderer tests.
// VERIFY_MODE=phone checks only the short phone layout, without another export.
const verifyMode = process.env.VERIFY_MODE || "full";
assert.ok(["full", "ui", "phone"].includes(verifyMode), "VERIFY_MODE must be full, ui or phone");
const modeOutput = { full: "artifacts/scene-presets-ui", ui: "artifacts/scene-studio-ui", phone: "artifacts/scene-studio-phone" };
const outputDir = path.resolve(process.env.OUTPUT_DIR || modeOutput[verifyMode]);
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const report = { startedAt: new Date().toISOString(), baseUrl, mode: verifyMode, source: "actual scene preset choices",
  modelRequests: [], errors: [] };
let page;
const presetIds = ["still", "draw-on", "fade", "slide", "zoom", "float", "bounce", "pulse",
  "pop-in", "iris", "curtain", "assemble", "sparkle", "confetti",
  "rotate-in", "flip-in", "diagonal-reveal", "zoom-out", "snow", "spotlight", ...TRAVEL_IDS];
const presetCategories = {
  "draw-on": "entrance", fade: "entrance", slide: "entrance", "pop-in": "entrance", assemble: "entrance",
  zoom: "transition", iris: "transition", curtain: "transition",
  still: "atmosphere", float: "atmosphere", bounce: "atmosphere", pulse: "atmosphere",
  sparkle: "atmosphere", confetti: "atmosphere", snow: "atmosphere", spotlight: "atmosphere",
  "rotate-in": "entrance", "flip-in": "entrance", "diagonal-reveal": "transition", "zoom-out": "transition",
  ...Object.fromEntries(TRAVEL_IDS.map((id) => [id, "travel"]))
};
const addedPresets = ["pop-in", "iris", "curtain", "assemble", "sparkle", "confetti",
  "rotate-in", "flip-in", "diagonal-reveal", "zoom-out", "snow", "spotlight", ...TRAVEL_IDS];
const completingPresets = ["pop-in", "iris", "curtain", "assemble", "confetti", "rotate-in", "flip-in", "diagonal-reveal", "spotlight"];
const TEST_BPM = 180;
const beatTime = (beat) => beat * 60 / TEST_BPM;
const previewSampleBeats = {
  zoom: [0, 13.2], "zoom-out": [0, 13.2], "draw-on": [.12, 7.2],
  bounce: [0, .5], pulse: [0, .5],
  "pop-in": [.15, 2.5], iris: [.15, 2.5], curtain: [.15, 2.5], assemble: [.15, 2.5],
  "rotate-in": [.15, 4.5], "flip-in": [.15, 4.5], "diagonal-reveal": [.15, 4.5],
  sparkle: [.45, 1.35], confetti: [.45, 2.4], snow: [3, 5.4], spotlight: [.6, 4.5]
};
const timelineLabel = "움직임 미리보기 시간";
const canvasLabel = "장면 움직임 미리보기";

async function savedScenes() {
  return page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes);
}

async function waitScenes(expected) {
  await page.waitForFunction((value) => JSON.stringify(JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))
    ?.musicVideoScenes) === JSON.stringify(value), expected);
}

async function seedDrawing() {
  return page.evaluate(() => {
    const words = ["내가그린그림", "한줄씩나타나요", "노래를따라서", "반짝이는이야기",
      "다음그림에는", "꽃이피어있어", "함께만들어요", "우리들의노래"];
    const measures = words.map((word, measureIndex) => ({ candidateId: "custom", candidateName: "장면 움직임 검증",
      chords: [measureIndex % 2 ? "F" : "C"], notes: Array.from(word).map((lyric, noteIndex) => ({
        id: `preset-${measureIndex}-${noteIndex}`, pitch: 60, lyric,
        duration: { numerator: 4, denominator: word.length } })) }));
    const first = { id: "preset-first", background: "#fff8ed", motion: "still", endLyric: null, endMeasureIndex: 3,
      elements: [
        { id: "red-frame", tool: "rectangle", color: "#ea4335", width: 12, points: [[220, 135, .5], [460, 345, .5]] },
        { id: "blue-orbit", tool: "ellipse", color: "#4285f4", width: 12, points: [[520, 180, .5], [730, 390, .5]] },
        { id: "gold-line", tool: "brush", color: "#fbbc04", width: 14,
          points: [[240, 385, .5], [350, 365, .5], [430, 390, .5], [500, 365, .5]] }
      ] };
    const second = { id: "preset-second", background: "#ffffff", motion: "still", endLyric: null, endMeasureIndex: 7,
      elements: [
        { id: "flower-stem", tool: "line", color: "#34a853", width: 14, points: [[480, 255, .5], [480, 410, .5]] },
        { id: "flower-petal", tool: "ellipse", color: "#a142f4", width: 16, points: [[385, 125, .5], [575, 305, .5]] },
        { id: "flower-center", tool: "ellipse", color: "#fbbc04", width: 20, points: [[450, 185, .5], [510, 245, .5]] }
      ] };
    const scenes = [first, second];
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify({ version: 1, updatedAt: Date.now(), sourceHash: "",
      title: "그림으로 만든 노래", creator: "장면 움직임 검증", originalCreator: "", presetId: "H001",
      meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "piano", accompanimentStyleId: "arpeggio",
      accompanimentInstrumentIds: ["piano"], bpm: 180, lyrics: words, measures, showArrangement: true,
      musicVideoScenes: scenes }));
    return scenes;
  });
}

async function openCategoryForPreset(id) {
  const tab = page.getByTestId(`scene-motion-category-${presetCategories[id]}`);
  if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
  await page.waitForFunction((category) => document.querySelector(`[data-testid="scene-motion-category-${category}"]`)
    ?.getAttribute("aria-selected") === "true", presetCategories[id]);
}

async function selectPreset(id) {
  await openCategoryForPreset(id);
  await page.getByTestId(`scene-motion-preset-${id}`).click();
  await page.waitForFunction((id) => document.querySelector(`[data-testid="scene-motion-preset-${id}"]`)
    ?.getAttribute("aria-pressed") === "true", id);
  await page.getByRole("button", { name: id === "still" ? "움직임 미리보기" : "미리보기 멈추기", exact: true }).waitFor();
}

async function seekPreview(time, frameKey) {
  const stop = page.getByRole("button", { name: "미리보기 멈추기", exact: true });
  if (await stop.count()) await stop.click();
  await page.getByLabel(timelineLabel, { exact: true }).evaluate((element, time) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, String(time));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, time);
  await page.getByLabel(canvasLabel, { exact: true }).evaluate(async (element, key) => {
    await new Promise(requestAnimationFrame);
    (window.__presetFrames ??= {})[key] = element.getContext("2d").getImageData(0, 0, 1280, 720).data;
  }, frameKey);
}

async function capturePreview(filename) {
  const png = await page.getByLabel(canvasLabel, { exact: true })
    .evaluate((element) => element.toDataURL("image/png").split(",")[1]);
  await writeFile(path.join(outputDir, filename), Buffer.from(png, "base64"));
}

async function comparePreview(before, after) {
  return page.evaluate(({ before, after }) => {
    const a = window.__presetFrames[before];
    const b = window.__presetFrames[after];
    let changed = 0;
    let exactChanged = 0;
    const colored = [0, 0];
    for (let y = 105; y < 595; y++) {
      for (let x = 45; x < 1235; x++) {
        const index = (y * 1280 + x) * 4;
        const delta = Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) +
          Math.abs(a[index + 2] - b[index + 2]);
        if (delta > 90) changed++;
        if (a[index] !== b[index] || a[index + 1] !== b[index + 1] || a[index + 2] !== b[index + 2]) exactChanged++;
        for (const [slot, frame] of [a, b].entries()) {
          const channels = [frame[index], frame[index + 1], frame[index + 2]];
          if (Math.max(...channels) - Math.min(...channels) > 55 && Math.min(...channels) < 180) colored[slot]++;
        }
      }
    }
    return { changed, exactChanged, colored };
  }, { before, after });
}

async function verifyPresetPreviews(original) {
  report.presets = [];
  for (const id of presetIds) {
    await selectPreset(id);
    const scenes = await savedScenes();
    assert.equal(scenes[0].motion, id);
    assert.equal(scenes[0].choreography, undefined);
    assert.deepEqual(scenes[0].elements, original[0].elements);
    assert.equal(scenes[0].background, original[0].background);
    assert.equal(scenes[0].endMeasureIndex, original[0].endMeasureIndex);
    assert.deepEqual(scenes[1], original[1], "Selecting a motion must preserve the other scene");
    const traveling = TRAVEL_IDS.includes(id);
    const duration = Number(await page.getByLabel(timelineLabel, { exact: true }).getAttribute("max"));
    const times = traveling ? [0, duration - .01] : (previewSampleBeats[id] ?? [0, 2.7]).map(beatTime);
    await seekPreview(times[0], `${id}-before`);
    if (traveling) await capturePreview(`preview-${id}-start.png`);
    await seekPreview(times[1], `${id}-after`);
    if (traveling) await capturePreview(`preview-${id}-end.png`);
    const pixels = await comparePreview(`${id}-before`, `${id}-after`);
    const result = { id, times, pixels, originalArtworkPreserved: true, otherScenePreserved: true };
    report.presets.push(result);
    if (id === "still") assert.equal(pixels.changed, 0, "Still must retain identical artwork pixels");
    else assert.ok(pixels.changed > 150, `${id} must visibly affect the actual preview canvas`);
    if (["draw-on", "fade", "slide"].includes(id)) {
      assert.ok(pixels.colored[1] > pixels.colored[0] + 100, `${id} must reveal more original drawing pixels`);
    }
    if (id === "zoom-out") {
      assert.ok(pixels.colored[1] < pixels.colored[0] - 100, "Zoom out must make the original drawing smaller");
    }
    if (traveling) {
      result.movement = await artworkMotion(page, `${id}-before`, `${id}-after`);
      assertTravelDirection(id, result.movement);
    }
    if (addedPresets.includes(id)) {
      const progressTime = traveling ? duration / 2 : beatTime(id === "snow" ? 3 : id === "spotlight" ? 4.5 : 1.2);
      await seekPreview(progressTime, `${id}-repeat-before`);
      await capturePreview(`preview-${id}-in-progress.png`);
      // Falling decorations must be inside the artwork inspection region during this comparison.
      const repeatTime = beatTime(traveling ? 1.8 : id === "confetti" ? 2.4 : id === "snow" ? 3 : id === "spotlight" ? 4.5 : 1.2);
      if (repeatTime !== progressTime) await seekPreview(repeatTime, `${id}-repeat-before`);
      await seekPreview(traveling ? beatTime(3.6) : Math.max(beatTime(3.3), repeatTime + beatTime(1.5)), `${id}-middle`);
      await seekPreview(repeatTime, `${id}-repeat-after`);
      result.determinism = await comparePreview(`${id}-repeat-before`, `${id}-repeat-after`);
      result.determinism.time = repeatTime;
      assert.equal(result.determinism.exactChanged, 0, `${id} must give the same pixels when seeking back to the same time`);
      if (completingPresets.includes(id)) {
        await seekPreview(beatTime(["confetti", "spotlight"].includes(id) ? 8.5 : 4.5), `${id}-complete`);
        result.completion = await comparePreview("still-before", `${id}-complete`);
        assert.equal(result.completion.changed, 0, `${id} must return to the complete unaltered drawing`);
      }
    }
    if (traveling) {
      if (id.startsWith("bounce-")) {
        await seekPreview(0, `${id}-ground`);
        await seekPreview(beatTime(.5), `${id}-air`);
        result.hop = await artworkMotion(page, `${id}-ground`, `${id}-air`);
        assert.ok(result.hop.dy < -10, `${id} must rise on the half beat`);
        assert.ok(result.hop.dx * TRAVEL_DIRECTIONS[id][0] > .5, `${id} must keep traveling during its hop`);
      }
      await selectPreset("still");
      await seekPreview(times[1], `${id}-still-overlay`);
      await capturePreview(`preview-${id}-original.png`);
      result.fixedOverlay = await compareFixedOverlay(page, `${id}-after`, `${id}-still-overlay`);
      assert.deepEqual(result.fixedOverlay, { title: 0, lyrics: 0, backgroundSamplesMatch: true },
        `${id} must keep background, title, and lyrics fixed at the same song time`);
      await selectPreset(id);
      await seekPreview(duration / 2, `${id}-display`);
    }
    await capturePreview(`preview-${id}.png`);
  }
  await selectPreset("draw-on");
  await seekPreview(beatTime(8.5), "draw-on-completed");
  const completed = await comparePreview("still-before", "draw-on-completed");
  assert.equal(completed.changed, 0, "Completed draw-on must match every original artwork pixel");
  report.drawOnCompletion = { identicalToOriginal: true, pixels: completed };
}

async function verifyPainting() {
  const canvas = page.getByTestId("scene-paint-canvas");
  const before = await savedScenes();
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 200 && box.height > 100);
  const points = [[.28, .55], [.34, .59], [.42, .55]];
  await page.mouse.move(box.x + box.width * points[0][0], box.y + box.height * points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 2 });
  await page.mouse.up();
  await page.waitForFunction((count) => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))
    ?.musicVideoScenes[0]?.elements.length === count + 1, before[0].elements.length);
  const painted = await savedScenes();
  const stroke = painted[0].elements.at(-1);
  assert.ok(Math.abs(stroke.points[0][0] - 960 * points[0][0]) < 2);
  assert.ok(Math.abs(stroke.points[0][1] - 540 * points[0][1]) < 2);
  assert.deepEqual(painted[0].elements.slice(0, -1), before[0].elements);
  assert.deepEqual(painted[1], before[1]);
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(before);
  await page.getByRole("button", { name: "그림 다시 실행", exact: true }).click();
  await waitScenes(painted);
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(before);
  report.painting = { actualMouseInput: true, drawingCoordinatesPreserved: true, undoRedo: true };
}

async function verifyLayout(width, height = 844, stage = "editor") {
  await page.setViewportSize({ width, height });
  const mobile = width <= 820;
  const panels = mobile ? ["그림판 보기", "장면 설정 보기"] : [null];
  let paintDock;
  for (const panel of panels) {
    if (panel) await page.getByRole("button", { name: panel, exact: true }).click();
    await page.locator(".mv-workspace").evaluate((element) => { element.scrollTop = 0; });
    if (panel === "그림판 보기" && [375, 390].includes(width)) {
      paintDock = await verifyMobilePaintDock({ page, outputDir, width, height });
    }
    if (panel === "장면 설정 보기") {
      await openCategoryForPreset("still");
      await page.getByTestId("scene-motion-preset-pulse").scrollIntoViewIfNeeded();
    }
    assert.equal(await page.locator(".mv-studio").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false,
      `${width}px studio must not overflow horizontally`);
    for (const id of ["scene-save", "scene-reset", "create-music-video"]) {
      const item = page.getByTestId(id);
      assert.equal(await item.isVisible(), true, `${width}px ${id} must remain visible`);
      const box = await item.boundingBox();
      assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1, `${width}px ${id} must fit the viewport`);
      assert.ok(box.y >= -1 && box.y + box.height <= height + 1, `${width}px ${id} must not be vertically clipped`);
    }
    if (!mobile || panel === "장면 설정 보기") {
      for (const id of presetIds) {
        await openCategoryForPreset(id);
        const item = page.getByTestId(`scene-motion-preset-${id}`);
        assert.equal(await item.isVisible(), true, `${width}px preset ${id} must be available`);
        const box = await item.boundingBox();
        assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1, `${width}px preset ${id} must fit`);
        await item.click({ trial: true });
      }
    }
    const suffix = `${stage === "editor" ? "" : `-${stage}`}${panel ? `-${panel === "그림판 보기" ? "paint" : "motions"}` : ""}`;
    await page.screenshot({ path: path.join(outputDir, `layout-${width}${suffix}.png`) });
    if (!mobile || panel === "장면 설정 보기") {
      await page.getByRole("tablist", { name: "움직임 종류", exact: true }).scrollIntoViewIfNeeded();
      await page.getByTestId("scene-motion-category-atmosphere").click({ trial: true });
      await page.screenshot({ path: path.join(outputDir, `category-${width}${stage === "editor" ? "" : `-${stage}`}.png`) });
    }
  }
  (report.layouts ??= []).push({ width, height, stage, panels: panels.filter(Boolean), horizontalOverflow: false, actionsVisible: true, paintDock });
}

async function inspectVideo(bytes, times, regions = {}) {
  return page.evaluate(async ({ base64, times, regions }) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
    const video = document.createElement("video");
    video.src = url;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const frames = [];
    for (const time of times) {
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = time; });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      context.drawImage(video, 0, 0);
      frames.push(context.getImageData(0, 0, 1280, 720).data);
    }
    const checks = [];
    for (let first = 0; first < frames.length; first += 2) {
      let changed = 0;
      const colored = [0, 0];
      const bounds = [0, 1].map(() => ({ left: 1280, right: -1, top: 720, bottom: -1 }));
      for (let y = 105; y < 595; y++) {
        for (let x = 45; x < 1235; x++) {
          const offset = (y * 1280 + x) * 4;
          const a = frames[first];
          const b = frames[first + 1];
          if (Math.abs(a[offset] - b[offset]) + Math.abs(a[offset + 1] - b[offset + 1]) +
            Math.abs(a[offset + 2] - b[offset + 2]) > 90) changed++;
          for (const [slot, frame] of [a, b].entries()) {
            const channels = [frame[offset], frame[offset + 1], frame[offset + 2]];
            if (Math.max(...channels) - Math.min(...channels) > 55 && Math.min(...channels) < 180) {
              colored[slot]++;
              bounds[slot].left = Math.min(bounds[slot].left, x);
              bounds[slot].right = Math.max(bounds[slot].right, x);
              bounds[slot].top = Math.min(bounds[slot].top, y);
              bounds[slot].bottom = Math.max(bounds[slot].bottom, y);
            }
          }
        }
      }
      const regionChanges = {};
      for (const [name, [left, top, right, bottom]] of Object.entries(regions)) {
        let changed = 0, exactChanged = 0;
        for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
          const index = (y * 1280 + x) * 4;
          const delta = Math.abs(frames[first][index] - frames[first + 1][index]) +
            Math.abs(frames[first][index + 1] - frames[first + 1][index + 1]) +
            Math.abs(frames[first][index + 2] - frames[first + 1][index + 2]);
          if (delta > 90) changed++;
          if (delta) exactChanged++;
        }
        regionChanges[name] = { changed, exactChanged };
      }
      checks.push({ changed, colored, bounds: bounds.map((box) => ({ ...box, width: box.right - box.left + 1,
        centerX: (box.left + box.right) / 2, centerY: (box.top + box.bottom) / 2 })), regions: regionChanges });
    }
    const signature = new TextDecoder("latin1").decode(bytes);
    const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration,
      avc: signature.includes("avc1"), aac: signature.includes("mp4a"), checks };
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    return result;
  }, { base64: bytes.toString("base64"), times, regions });
}

async function exportVideo(animated, motions = ["draw-on", "fade"]) {
  await page.getByTestId("create-music-video").click();
  await page.getByRole("radio", { name: animated ? /애니메이션 있음/ : /애니메이션 없음/ }).check();
  const started = performance.now();
  const download = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("confirm-music-video").click();
  const name = motions.join("-");
  const filename = path.join(outputDir, `scene-presets-${name}-${animated ? "animated" : "static"}.mp4`);
  await (await download).saveAs(filename);
  const bytes = await readFile(filename);
  // renderOfflineBackingAudio: .08 scheduling lead-in + intro 16 beats + first four bars.
  const intro = .08 + beatTime(16);
  const secondStart = .08 + beatTime(32);
  const times = motions[0] === "bounce-left" ? [intro + beatTime(4) + .01, intro + beatTime(4.5),
    secondStart + beatTime(.15), secondStart + beatTime(9)] :
    motions[0] === "assemble" ? [beatTime(.15), beatTime(2.5), secondStart + beatTime(.45), secondStart + beatTime(2.4)] :
    motions[0] === "flip-in" ? [beatTime(.15), beatTime(4.5), secondStart + beatTime(1.8), secondStart + beatTime(4.2)] :
      [beatTime(.15), beatTime(7.2), secondStart + beatTime(.15), secondStart + beatTime(2.7)];
  const media = await inspectVideo(bytes, times);
  (report.exportChecks ??= []).push({ animated, motions, times, ...media });
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.equal(media.avc, true);
  assert.equal(media.aac, true);
  for (const check of media.checks) {
    if (animated) {
      assert.ok(check.changed > 150, "Each scene must retain its selected entrance in MP4");
      if (motions[0] === "draw-on") {
        assert.ok(check.colored[1] > check.colored[0] + 100, "MP4 must reveal the selected drawing");
      }
    } else assert.ok(check.changed < 80, "Static export must ignore the selected animation presets");
  }
  const beatSync = animated && motions[0] === "bounce-left" ? await verifyMp4BeatSync(page, bytes, TEST_BPM, inspectVideo) : undefined;
  return { ...media, animated, motions, bytes: bytes.length, times, beatSync, elapsedSeconds: (performance.now() - started) / 1000 };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, hasTouch: true });
  await context.addInitScript(() => {
    delete Navigator.prototype.gpu;
    window.__forbiddenWorkers = 0;
    Object.defineProperty(window, "Worker", { configurable: true, value: class {
      constructor() { window.__forbiddenWorkers++; throw new Error("Scene presets must not create AI workers"); }
    } });
  });
  await context.route(/huggingface\.co|hf\.co|hf\.space|xethub|cdn-lfs|\.onnx(?:[?.]|$)/, async (route) => {
    const request = new URL(route.request().url());
    report.modelRequests.push({ host: request.hostname, path: request.pathname });
    await route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${baseUrl}?start=new`);
  const original = await seedDrawing();
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  assert.equal(await page.getByRole("tablist", { name: "움직임 종류", exact: true }).count(), 1);
  for (const id of ["analyze-scene", "apply-scene-recommendation", "scene-action-mode", "scene-action-canvas"]) {
    assert.equal(await page.getByTestId(id).count(), 0, `${id} must be removed from the editor`);
  }
  assert.equal(await page.getByRole("dialog", { name: "장면 그리기", exact: true }).locator("textarea").count(), 0);
  if (verifyMode === "phone") {
    await verifyLayout(375, 667);
    report.exports = [];
  } else {
    report.workspace = await verifyTwelveSceneWorkspace({ page, outputDir, savedScenes });
    await verifyPainting();
  }
  if (verifyMode === "full") {
    await verifyPresetPreviews(original);
    report.fullCanvasTravel = await verifyFilledCanvasTravel(page, outputDir);
    console.log(JSON.stringify({ stage: "all-presets-and-full-frame", count: report.presets.length, success: true }));
    report.bpmGraphics = await verifySceneBpmGraphics(page, outputDir, presetIds, original[0]);
    report.bpmApp = await verifyAppBpmPreview({ page, outputDir, selectPreset, seekPreview, comparePreview, savedScenes });
    console.log(JSON.stringify({ stage: "bpm-90-180", sameBeatCases: report.bpmGraphics.sameBeat.length,
      actualAppCases: report.bpmApp.checks.length, success: true }));
    await selectPreset("draw-on");
    const firstChosen = await savedScenes();
    await page.getByRole("button", { name: "2번 장면 선택", exact: true }).click();
    await selectPreset("fade");
    const chosen = await savedScenes();
    assert.equal(chosen[0].motion, "draw-on");
    assert.equal(chosen[1].motion, "fade");
    await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
    await waitScenes(firstChosen);
    await page.getByRole("button", { name: "그림 다시 실행", exact: true }).click();
    await waitScenes(chosen);
    const download = page.waitForEvent("download");
    await page.getByTestId("scene-save").click();
    const sceneFilename = path.join(outputDir, "second-scene.scene.json");
    await (await download).saveAs(sceneFilename);
    assert.deepEqual(JSON.parse(await readFile(sceneFilename, "utf8")).scene, chosen[1]);
    await selectPreset("zoom");
    await page.getByTestId("scene-import-file").setInputFiles(sceneFilename);
    await waitScenes(chosen);
    await page.getByTestId("scene-reset").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes[1]?.elements.length === 0);
    await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
    await waitScenes(chosen);
    report.workflow = { oneClickChoice: true, separateScenes: true, undoRedo: true, saveImport: true, resetUndo: true };
    for (const [width, height] of [[1440, 1000], [820, 1180], [390, 844], [360, 844], [375, 667]]) {
      await verifyLayout(width, height);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    report.exports = [await exportVideo(true), await exportVideo(false)];
    assert.deepEqual(await savedScenes(), chosen);
    await page.getByRole("button", { name: "1번 장면 선택", exact: true }).click();
    await selectPreset("assemble");
    await page.getByRole("button", { name: "2번 장면 선택", exact: true }).click();
    await selectPreset("confetti");
    const addedChosen = await savedScenes();
    assert.deepEqual(addedChosen.map((scene) => scene.elements), original.map((scene) => scene.elements));
    assert.deepEqual(addedChosen.map((scene) => scene.motion), ["assemble", "confetti"]);
    report.exports.push(await exportVideo(true, ["assemble", "confetti"]), await exportVideo(false, ["assemble", "confetti"]));
    assert.deepEqual(await savedScenes(), addedChosen);
    await page.getByRole("button", { name: "1번 장면 선택", exact: true }).click();
    await selectPreset("flip-in");
    await page.getByRole("button", { name: "2번 장면 선택", exact: true }).click();
    await selectPreset("snow");
    const newestChosen = await savedScenes();
    assert.deepEqual(newestChosen.map((scene) => scene.elements), original.map((scene) => scene.elements));
    assert.deepEqual(newestChosen.map((scene) => scene.motion), ["flip-in", "snow"]);
    report.exports.push(await exportVideo(true, ["flip-in", "snow"]), await exportVideo(false, ["flip-in", "snow"]));
    assert.deepEqual(await savedScenes(), newestChosen);
    await page.getByRole("button", { name: "1번 장면 선택", exact: true }).click();
    await selectPreset("bounce-left");
    await page.getByRole("button", { name: "2번 장면 선택", exact: true }).click();
    await selectPreset("move-up-right");
    const travelChosen = await savedScenes();
    assert.deepEqual(travelChosen.map((scene) => scene.elements), original.map((scene) => scene.elements));
    assert.deepEqual(travelChosen.map((scene) => scene.motion), ["bounce-left", "move-up-right"]);
    report.exports.push(await exportVideo(true, ["bounce-left", "move-up-right"]), await exportVideo(false, ["bounce-left", "move-up-right"]));
    assert.deepEqual(await savedScenes(), travelChosen);
    await verifyLayout(390, 844, "after-export");
    report.resultWorkflow = await verifyResultDialog({ page, outputDir, savedScenes, expectedBytes: report.exports.at(-1).bytes });
    report.partial = await verifyPartialSceneMotion({ page, outputDir, savedScenes, waitScenes,
      selectPreset, seekPreview, comparePreview, capturePreview, inspectVideo });
    report.exports.push(...report.partial.exports);
  } else if (verifyMode === "ui") {
    for (const [width, height] of [[1440, 900], [820, 1180], [390, 844], [360, 844], [375, 667]]) {
      await verifyLayout(width, height);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "1번 장면 선택", exact: true }).click();
    await selectPreset("draw-on");
    await page.getByRole("button", { name: "2번 장면 선택", exact: true }).click();
    await selectPreset("fade");
    report.exports = [await exportVideo(true)];
    report.resultWorkflow = await verifyResultDialog({ page, outputDir, savedScenes, expectedBytes: report.exports[0].bytes });
    await verifyLayout(390, 844, "after-result");
  }
  assert.equal(await page.evaluate(() => window.__forbiddenWorkers), 0);
  assert.deepEqual(report.modelRequests, []);
  assert.deepEqual(report.errors, []);
  report.success = true;
  console.log(JSON.stringify({ success: true, mode: verifyMode, presets: report.presets?.length,
    fullCanvasTravel: report.fullCanvasTravel?.results.length, bpmPixelCases: report.bpmGraphics?.sameBeat.length,
    bpmAppCases: report.bpmApp?.checks.length, workspace: report.workspace,
    resultViewports: report.resultWorkflow?.checks.map(({ width, height }) => [width, height]),
    resultPlaybackAndFocus: report.resultWorkflow?.actualPlayback && report.resultWorkflow?.studioEscapeRestoresOpener,
    layouts: report.layouts.length, mobileCanvas: report.layouts.filter((item) => item.paintDock)
      .map(({ width, paintDock: { canvasHeight, visibleCanvasHeight, toolsHeight } }) => ({ width, canvasHeight, visibleCanvasHeight, toolsHeight })),
    partial: report.partial ? { hits: report.partial.hits.length,
      pixels: report.partial.pixels, sameBeat: report.partial.bpmPixels, success: report.partial.success } : undefined,
    exports: report.exports.map(({ motions, animated, bytes }) => ({ motions, animated, bytes })),
    errors: report.errors, modelRequests: report.modelRequests }, null, 2));
} catch (error) {
  report.success = false;
  report.failure = String(error);
  await page?.screenshot({ path: path.join(outputDir, "failure.png") });
  console.error(String(error));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
