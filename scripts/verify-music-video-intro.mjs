import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { observeStudioAudio } from "./studio-playback-observations.mjs";
import { captureIntroFrame, assertBlackIntroCard, assertIntroBackground, compareIntroFrames,
  exportIntroVideo } from "./music-video-intro-media.mjs";

// Actual built-app UI, native music, canvas pixels and one native MP4 export.
// Production mode repeats the focused UI/pixel flow without re-encoding MP4.
const mode = process.env.VERIFY_INTRO_MODE || "full";
assert.ok(["full", "production"].includes(mode));
const skipMp4 = mode === "production" || process.env.SKIP_MP4 === "1";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/music-video-intro");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const KEY = "maeum-melody:draft:v1";
const TITLE = "별빛이 시작되는 우리 노래";
const COMPOSER = "김하늘 작곡가";
const BOUNDARY = .08 + 16 * 60 / 200;
const report = { startedAt: new Date().toISOString(), baseUrl, mode, title: TITLE, composer: COMPOSER,
  boundary: BOUNDARY, skipMp4, errors: [], downloads: [] };
let page;
let audio;

async function seedFixture() {
  return page.evaluate(({ key, title, creator }) => {
    const words = ["별빛노래", "우리가락", "함께그려", "리듬따라", "반짝이는", "하늘그림", "다시만나", "마음노래"];
    const measures = words.map((word, index) => ({ candidateId: "custom", candidateName: "전주 장면 검증", chords: ["C"],
      notes: Array.from(word, (lyric, note) => ({ id: `intro-note-${index}-${note}`, pitch: 60 + note * 2,
        lyric, duration: { numerator: 1, denominator: 1 } })) }));
    const scenes = [{ id: "intro-song-first", background: "#fff8ed", motion: "still", endLyric: null, endMeasureIndex: 3,
      elements: [{ id: "song-green-frame", tool: "rectangle", color: "#34a853", width: 16,
        points: [[250, 160, .5], [650, 370, .5]] }] },
    { id: "intro-song-second", background: "#fce8e6", motion: "still", endLyric: null, endMeasureIndex: 7,
      elements: [{ id: "song-blue-circle", tool: "ellipse", color: "#4285f4", width: 16,
        points: [[330, 160, .5], [630, 370, .5]] }] }];
    localStorage.setItem(key, JSON.stringify({ version: 1, updatedAt: Date.now(), sourceHash: "", title, creator,
      originalCreator: "", presetId: "H001", songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 200,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      lyrics: words, measures, showArrangement: true, musicVideoScenes: scenes }));
    return scenes;
  }, { key: KEY, title: TITLE, creator: COMPOSER });
}

async function scenes() {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).musicVideoScenes, KEY);
}

async function waitScenes(expected) {
  await page.waitForFunction(({ key, expected }) => {
    const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonical(value[name])])) : value;
    return JSON.stringify(canonical(JSON.parse(localStorage.getItem(key)).musicVideoScenes)) === JSON.stringify(canonical(expected));
  }, { key: KEY, expected });
}

function assertSongPreserved(current, original) {
  assert.deepEqual(current.filter((scene) => scene.section !== "intro"), original,
    "Intro operations must preserve both normal scenes, drawings and authored end bars");
}

async function openStudio() {
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-paint-canvas").waitFor({ state: "attached" });
}

async function showPanel(name) {
  const button = page.getByRole("button", { name, exact: true });
  if (await button.isVisible()) await button.click();
}

async function preparePreview() {
  await page.getByTestId("music-video-preview-open").click();
  await page.getByTestId("music-video-preview-play").click();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="music-video-preview-time"]')?.getAttribute("data-time")) > .05,
    null, { timeout: 60_000 });
  const clock = await audio.clock();
  await page.getByTestId("music-video-preview-play").click();
  assert.equal(await page.getByTestId("music-video-preview-play").getAttribute("aria-pressed"), "false");
  return clock;
}

async function seek(time) {
  await page.getByTestId("music-video-preview-seek").evaluate((input, time) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(time));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, time);
  await page.waitForFunction((time) => Math.abs(Number(document.querySelector('[data-testid="music-video-preview-time"]')
    ?.getAttribute("data-time")) - time) < .001, time);
}

async function closePreview(clock) {
  await page.getByTestId("music-video-preview-close").click();
  await audio.closed(clock.contextId);
  await page.waitForFunction(() => document.activeElement?.dataset.testid === "music-video-preview-open");
}

async function verifyFallback(prefix) {
  const clock = await preparePreview();
  await seek(.2);
  const start = await captureIntroFrame(page, outputDir, `${prefix}-start`);
  assertBlackIntroCard(start);
  assert.match(await page.getByTestId("music-video-preview-scene").innerText(), /전주/);
  await seek(BOUNDARY - .01);
  const last = await captureIntroFrame(page, outputDir, `${prefix}-last`);
  assertBlackIntroCard(last);
  await seek(BOUNDARY);
  const song = await captureIntroFrame(page, outputDir, `${prefix}-first-song`);
  assertIntroBackground(song, [255, 248, 237]);
  assert.ok(song.colored > 1000);
  await page.screenshot({ path: path.join(outputDir, `${prefix}-song-transition.png`) });
  await closePreview(clock);
  return { clock, start, last, firstSong: song, noNormalDrawingBeforeBoundary: true, exactBoundaryStartsSong: true };
}

async function drawIntro() {
  await showPanel("장면 설정 보기");
  assert.equal(await page.getByTestId("scene-end-measure").inputValue(), "intro");
  assert.match(await page.getByTestId("scene-end-measure").locator('option[value="intro"]').innerText(), /전주/);
  await page.getByRole("button", { name: "하늘 도화지", exact: true }).click();
  await showPanel("그림판 보기");
  const tools = page.getByRole("toolbar", { name: "그림판 도구", exact: true });
  await tools.getByRole("button", { name: "네모", exact: true }).click();
  await page.getByLabel("색상 #ef4444", { exact: true }).click();
  const box = await page.getByTestId("scene-paint-canvas").boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + 250 / 960 * box.width, box.y + 160 / 540 * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + 650 / 960 * box.width, box.y + 370 / 540 * box.height, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).musicVideoScenes[0].elements.length === 1, KEY);
  return scenes();
}

async function verifyComposerBinding() {
  // Change the real app field to prove that the lower white text belongs to the
  // authored composer, rather than accepting arbitrary placeholder glyphs.
  await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
  await page.getByTestId("creator-name").fill("박별 그리고 우리 친구들");
  await openStudio();
  const clock = await preparePreview();
  await seek(.2);
  const frame = await captureIntroFrame(page, outputDir, "changed-composer-intro");
  assertBlackIntroCard(frame);
  const title = await compareIntroFrames(page, "unassigned-intro-start", "changed-composer-intro", [60, 220, 1220, 385]);
  const composer = await compareIntroFrames(page, "unassigned-intro-start", "changed-composer-intro", [60, 385, 1220, 500]);
  assert.equal(title.exactChanged, 0, "Changing only the composer must leave the title glyphs unchanged");
  assert.ok(composer.exactChanged > 100, "The actual composer's app field must change the lower white glyphs");
  await closePreview(clock);
  await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
  await page.getByTestId("creator-name").fill(COMPOSER);
  await openStudio();
  return { actualComposerFieldChangesOnlyComposerPixels: true, title, composer };
}

async function verifyDrawnIntro() {
  const clock = await preparePreview();
  const frames = [];
  for (const [time, name, background] of [[0, "drawn-intro-zero", [234, 242, 255]],
    [BOUNDARY - .01, "drawn-intro-last", [234, 242, 255]], [BOUNDARY, "drawn-intro-first-song", [255, 248, 237]],
    [BOUNDARY + 4.8, "drawn-intro-second-song", [252, 232, 230]]]) {
    await seek(time);
    const frame = await captureIntroFrame(page, outputDir, name);
    assertIntroBackground(frame, background);
    assert.ok(frame.colored > 1000);
    frames.push(frame);
  }
  await closePreview(clock);
  return { clock, frames, introOwnsOnlyLeadIn: true, firstSongExactBoundary: true, secondSceneTimingPreserved: true };
}

async function verifyFilesResetDelete(original, drawn) {
  const download = page.waitForEvent("download");
  await page.getByTestId("scene-save").click();
  const file = path.join(outputDir, "dedicated-intro.scene.json");
  await (await download).saveAs(file);
  const saved = JSON.parse(await readFile(file, "utf8"));
  assert.equal(saved.scene.section, "intro");
  assert.deepEqual(saved.scene, drawn[0]);
  await page.getByTestId("scene-reset").click();
  const reset = await scenes();
  assert.equal(reset[0].section, "intro");
  assert.equal(reset[0].elements.length, 0);
  assertSongPreserved(reset, original);
  await page.keyboard.press("Control+z");
  await waitScenes(drawn);
  await showPanel("장면 설정 보기");
  await page.getByTestId("delete-music-video-intro").click();
  await waitScenes(original);
  assert.equal(await page.getByTestId("music-video-intro-scene").count(), 0);
  await page.keyboard.press("Control+z");
  await waitScenes(drawn);
  await page.getByTestId("scene-reset").click();
  await page.getByTestId("scene-import-file").setInputFiles(file);
  await waitScenes(drawn);
  await page.reload();
  await openStudio();
  await waitScenes(drawn);
  assert.equal((await scenes())[0].section, "intro");
  assertSongPreserved(await scenes(), original);
  return { sectionSavedInJson: true, resetKeepsIntroIdentity: true, resetAndDeleteUndo: true,
    jsonImportAndDraftReload: true, normalRangesPreserved: true };
}

async function verifyLayouts() {
  const checks = [];
  for (const [width, height] of [[1440, 900], [375, 667]]) {
    await page.setViewportSize({ width, height });
    await showPanel("그림판 보기");
    await page.locator(".mv-workspace").evaluate((element) => { element.scrollTop = 0; });
    for (const id of ["music-video-intro-scene", "scene-save", "scene-reset", "music-video-preview-open", "create-music-video"]) {
      const button = page.getByTestId(id);
      await button.click({ trial: true });
      const box = await button.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= -1 && box.x + box.width <= width + 1);
    }
    const geometry = await page.evaluate(() => {
      const drawing = document.querySelector('[data-testid="scene-paint-canvas"]').getBoundingClientRect();
      const workspace = document.querySelector(".mv-workspace").getBoundingClientRect();
      const studio = document.querySelector(".mv-studio");
      return { drawing: drawing.toJSON(), visibleHeight: Math.min(drawing.bottom, workspace.bottom) - Math.max(drawing.top, workspace.top),
        overflow: studio.scrollWidth > studio.clientWidth + 1 };
    });
    assert.ok(geometry.visibleHeight >= geometry.drawing.height - 2);
    assert.equal(geometry.overflow, false);
    await page.screenshot({ path: path.join(outputDir, `intro-paint-${width}.png`) });
    await showPanel("장면 설정 보기");
    await page.getByTestId("scene-end-measure").scrollIntoViewIfNeeded();
    assert.equal(await page.getByTestId("scene-end-measure").inputValue(), "intro");
    await page.screenshot({ path: path.join(outputDir, `intro-settings-${width}.png`) });
    checks.push({ width, height, ...geometry, introControls44px: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  return checks;
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, acceptDownloads: true });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("download", (download) => report.downloads.push(download.suggestedFilename()));
  audio = await observeStudioAudio(page);
  await page.goto(`${baseUrl}?start=new`);
  report.bundle = await page.locator('script[type="module"][src]').evaluateAll((items) => items.map((item) => item.src));
  const original = await seedFixture();
  await page.reload();
  assert.equal(await page.getByTestId("song-title").inputValue(), TITLE);
  assert.equal(await page.getByTestId("creator-name").inputValue(), COMPOSER);
  await openStudio();
  report.stage = "unassigned intro uses black title and composer card";
  report.noIntro = await verifyFallback("unassigned-intro");
  assert.deepEqual(await scenes(), original);
  report.stage = "authored composer field controls the lower white text";
  report.composerBinding = await verifyComposerBinding();
  report.stage = "add empty dedicated intro without consuming normal bars";
  await page.getByTestId("add-music-video-intro").click();
  const empty = await scenes();
  assert.equal(empty.length, 3);
  assert.equal(empty[0].section, "intro");
  assert.equal(empty[0].elements.length, 0);
  assertSongPreserved(empty, original);
  assert.equal(await page.getByTestId("music-video-intro-scene").getAttribute("aria-pressed"), "true");
  report.emptyIntro = await verifyFallback("empty-intro");
  const sameCard = await compareIntroFrames(page, "unassigned-intro-start", "empty-intro-start");
  assert.equal(sameCard.exactChanged, 0);
  report.emptyIntro.matchesUnassignedCard = sameCard;
  report.stage = "draw into the intro and verify exact song boundaries";
  const drawn = await drawIntro();
  assertSongPreserved(drawn, original);
  report.drawnIntro = await verifyDrawnIntro();
  report.stage = "intro reset, delete undo, scene JSON and draft reload";
  report.files = await verifyFilesResetDelete(original, drawn);
  report.layouts = await verifyLayouts();
  if (!skipMp4) {
    report.stage = "one actual H264 AAC MP4 with dedicated intro";
    report.mp4 = await exportIntroVideo(page, outputDir, BOUNDARY);
  }
  assertSongPreserved(await scenes(), original);
  assert.deepEqual(report.errors, []);
  assert.equal(report.downloads.filter((name) => name.endsWith(".mp4")).length, skipMp4 ? 0 : 1);
  report.success = true;
  report.stage = "complete";
  console.log(JSON.stringify({ success: true, mode, boundary: BOUNDARY, title: TITLE, composer: COMPOSER,
    fallbackWhite: report.noIntro.start.white, files: report.files, layouts: report.layouts,
    actualMp4: report.mp4 && { bytes: report.mp4.bytes, duration: report.mp4.duration, frames: report.mp4.frames.length }, errors: report.errors }, null, 2));
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
