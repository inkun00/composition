import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { observeStudioAudio, rememberStudioFrame, compareStudioFrames, studioBackground,
  captureStudioFrame } from "./studio-playback-observations.mjs";
import { verifyRecordedStudioPlayback } from "./studio-playback-recording.mjs";

// Real built app, native WebAudio, and actual renderer. No API is replaced.
// Build/freeze first. APP_URL + VERIFY_PLAYBACK_MODE=production skips local-only
// end/restart/BPM/recording stress while keeping real playback and 3 layouts.
const mode = process.env.VERIFY_PLAYBACK_MODE || "full";
assert.ok(["full", "production", "recording"].includes(mode));
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-studio-playback");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const report = { startedAt: new Date().toISOString(), baseUrl, mode, source: "native full-song studio playback", errors: [], downloads: [] };
const KEY = "maeum-melody:draft:v1";
const BPM = 180;
const beat = 60 / BPM;
const intro = .08 + 16 * beat;
const PAPERS = [[255, 248, 237], [252, 232, 230], [234, 242, 255], [231, 243, 236]];
let page;
let audio;

async function seedFixture() {
  return page.evaluate((key) => {
    const words = ["별빛노래", "그림따라", "함께노래", "리듬따라", "반짝이는", "우리그림", "다시만나", "마음노래"];
    const measures = words.map((word, index) => ({ candidateId: "custom", candidateName: "전체 음악 미리보기",
      chords: [index % 2 ? "F" : "C"], notes: Array.from(word, (lyric, noteIndex) => ({ id: `playback-${index}-${noteIndex}`,
        pitch: 60 + noteIndex * 2, lyric, duration: { numerator: 1, denominator: 1 } })) }));
    const scenes = ["#fff8ed", "#fce8e6", "#eaf2ff", "#e7f3ec"].map((background, index) => ({
      id: `playback-scene-${index}`, background, motion: ["move-up", "move-down", "pulse", "float"][index],
      endLyric: null, endMeasureIndex: index * 2 + 1, elements: [
        { id: `scene-${index}-frame`, tool: "rectangle", color: "#ea4335", width: 12,
          points: [[300, 180, .5], [490, 340, .5]] },
        { id: `scene-${index}-circle`, tool: "ellipse", color: "#4285f4", width: 12,
          points: [[550, 210, .5], [700, 360, .5]] }
      ] }));
    const draft = { version: 1, updatedAt: Date.now(), sourceHash: "", title: "음악과 그림 함께 미리보기", creator: "실제 재생 검증",
      originalCreator: "", presetId: "H001", songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 180,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      lyrics: words, measures, showArrangement: true, musicVideoScenes: scenes };
    localStorage.setItem(key, JSON.stringify(draft));
    return draft;
  }, KEY);
}

async function time() {
  return Number(await page.getByTestId("music-video-preview-time").getAttribute("data-time"));
}

async function duration() {
  return Number(await page.getByTestId("music-video-preview-seek").getAttribute("max"));
}

async function play() {
  await page.getByTestId("music-video-preview-play").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="music-video-preview-play"]')
    ?.getAttribute("aria-pressed") === "true", null, { timeout: 60_000 });
}

async function pause() {
  if (await page.getByTestId("music-video-preview-play").getAttribute("aria-pressed") === "true") {
    await page.getByTestId("music-video-preview-play").click();
  }
  await page.waitForFunction(() => document.querySelector('[data-testid="music-video-preview-play"]')?.getAttribute("aria-pressed") === "false");
}

async function seek(seconds) {
  await page.getByTestId("music-video-preview-seek").evaluate((input, seconds) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(seconds));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, seconds);
  await page.waitForFunction((seconds) => Math.abs(Number(document.querySelector('[data-testid="music-video-preview-time"]')
    ?.getAttribute("data-time")) - seconds) < .15, seconds);
}

async function openPreview() {
  await page.getByTestId("music-video-preview-open").click();
  await page.getByTestId("music-video-preview-dialog").waitFor();
  assert.equal(await page.getByTestId("music-video-preview-play").getAttribute("aria-pressed"), "false");
  assert.equal(await time(), 0);
  assert.equal(await page.locator(".mv-studio").evaluate((element) => element.inert), true);
}

async function closePreview(contextId, escape = false) {
  if (escape) await page.keyboard.press("Escape");
  else await page.getByTestId("music-video-preview-close").click();
  assert.equal(await page.getByTestId("music-video-preview-dialog").count(), 0);
  if (contextId) await audio.closed(contextId);
  await page.waitForFunction(() => !document.querySelector(".mv-studio")?.inert);
  report.closeState = await page.evaluate(() => ({ activeTag: document.activeElement?.tagName,
    activeLabel: document.activeElement?.getAttribute("aria-label"), activeTestId: document.activeElement?.getAttribute("data-testid"),
    triggerDisabled: document.querySelector('[data-testid="music-video-preview-open"]')?.disabled,
    studioInert: document.querySelector(".mv-studio")?.inert }));
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "music-video-preview-open", null, { timeout: 3000 });
}

async function verifyLayouts() {
  report.layouts = [];
  for (const [width, height] of [[1440, 900], [390, 844], [375, 667]]) {
    await page.setViewportSize({ width, height });
    const dialog = page.getByTestId("music-video-preview-dialog");
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
    const controls = [];
    for (const id of ["canvas", "play", "restart", "seek", "close"]) {
      const target = page.getByTestId(`music-video-preview-${id}`);
      const box = await target.boundingBox();
      assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height + 1,
        `${width}px playback ${id} must fit without clipping`);
      if (["play", "restart", "close"].includes(id)) {
        assert.ok(box.height >= 44 && box.width >= 44);
        await target.click({ trial: true });
      }
      controls.push({ id, box });
    }
    assert.equal(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
    for (const key of ["Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
    }
    await page.screenshot({ path: path.join(outputDir, `studio-playback-${width}.png`) });
    report.layouts.push({ width, height, bounds, controls, overflow: false, focusContained: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function verifyTransport() {
  await play();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="music-video-preview-time"]')?.getAttribute("data-time")) > .3);
  const firstTime = await time();
  const firstClock = await audio.clock();
  await page.waitForTimeout(350);
  const nextTime = await time();
  const nextClock = await audio.clock();
  assert.ok(nextTime > firstTime + .15 && nextClock.currentTime > firstClock.currentTime + .2);
  assert.ok(Math.abs((nextTime - firstTime) - (nextClock.currentTime - firstClock.currentTime)) < .2,
    "The actual preview transport must advance with the native audio clock");
  const length = await duration();
  const pcm = mode === "full" ? await audio.pcm(length) : undefined;
  await pause();
  const frozen = await time();
  await rememberStudioFrame(page, "paused-before");
  await page.waitForTimeout(350);
  assert.ok(Math.abs(await time() - frozen) < .01);
  await rememberStudioFrame(page, "paused-after");
  assert.equal((await compareStudioFrames(page, "paused-before", "paused-after")).exactChanged, 0);
  await seek(intro + .1);
  const seekTime = await time();
  await play();
  await page.waitForTimeout(300);
  const resumed = await time();
  assert.ok(resumed > seekTime + .1 && resumed < seekTime + .6, "Resume must continue from the sought musical position");
  await pause();
  await seek(intro + 8 * beat + .1);
  assert.match(await page.getByTestId("music-video-preview-scene").innerText(), /장면 2\s*\/\s*4/);
  assert.deepEqual(await studioBackground(page), PAPERS[1]);
  await captureStudioFrame(page, outputDir, "studio-playback-second-scene.png");
  report.transport = { nativeClock: [firstClock, nextClock], firstTime, nextTime, duration: length,
    actualPcm: pcm, pauseFrozen: true, pauseFrameIdentical: true, seekTime, resumed, secondScene: true };
  return { contextId: firstClock.contextId, length };
}

async function verifyAllScenesAndLyrics() {
  report.scenes = [];
  for (let index = 0; index < 4; index++) {
    const position = intro + index * 8 * beat + .05;
    await seek(position);
    assert.match(await page.getByTestId("music-video-preview-scene").innerText(), new RegExp(`장면 ${index + 1}\\s*\\/\\s*4`));
    assert.deepEqual(await studioBackground(page), PAPERS[index]);
    const frame = await rememberStudioFrame(page, `scene-${index}`);
    assert.deepEqual(frame, { width: 1280, height: 720 });
    await captureStudioFrame(page, outputDir, `studio-playback-scene-${index + 1}.png`);
    report.scenes.push({ scene: index + 1, position, background: PAPERS[index] });
  }
  await seek(intro + .05);
  await rememberStudioFrame(page, "lyric-one");
  await seek(intro + beat + .05);
  await rememberStudioFrame(page, "lyric-two");
  const lyrics = await compareStudioFrames(page, "lyric-one", "lyric-two", [0, 616, 1280, 720]);
  assert.ok(lyrics.changed > 20 && lyrics.yellow > 5, "Korean lyric highlighting must advance with the music");
  report.lyrics = lyrics;
}

async function verifyEndAndRestart(length) {
  await seek(length - .2);
  await play();
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-testid="music-video-preview-seek"]');
    return document.querySelector('[data-testid="music-video-preview-play"]')?.getAttribute("aria-pressed") === "false" &&
      Math.abs(Number(input.value) - Number(input.max)) < .05;
  });
  const endTime = await time();
  await page.getByTestId("music-video-preview-restart").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="music-video-preview-play"]')?.getAttribute("aria-pressed") === "true");
  assert.ok(await time() < .4);
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="music-video-preview-time"]')?.getAttribute("data-time")) > .15);
  report.endRestart = { duration: length, endTime, stopsAtEnd: true, restartPlaysFromZero: true };
}

async function verifyLatestAndTempo(draft) {
  const context = await audio.clock();
  await closePreview(context.contextId);
  await page.getByRole("button", { name: "장면 설정 보기", exact: true }).isVisible().then(async (visible) => {
    if (visible) await page.getByRole("button", { name: "장면 설정 보기", exact: true }).click();
  });
  await page.getByRole("button", { name: "초록 도화지", exact: true }).click();
  await page.getByTestId("scene-motion-category-atmosphere").click();
  await page.getByTestId("scene-motion-preset-pulse").click();
  const current = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
  assert.equal(current.musicVideoScenes[0].background, "#e7f3ec");
  assert.equal(current.musicVideoScenes[0].motion, "pulse");
  await openPreview();
  assert.equal(await time(), 0);
  await play();
  await pause();
  assert.deepEqual(await studioBackground(page), PAPERS[3]);
  await seek(intro + .75 * beat);
  // The actual range input quantizes to .01 seconds. Preserve its resulting
  // musical beat when changing BPM, instead of comparing differently rounded
  // values of the nominal .75-beat target.
  const musicBeat = (await time() - intro) * BPM / 60;
  await rememberStudioFrame(page, "tempo-180");
  const fastDuration = await duration();
  const fastClock = await audio.clock();
  await closePreview(fastClock.contextId);
  await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
  await page.getByTestId("tempo-number").fill("90");
  await page.getByTestId("draw-music-video-scene").click();
  await openPreview();
  await play();
  await pause();
  const slowIntro = .08 + 16 * 60 / 90;
  await seek(slowIntro + musicBeat * 60 / 90);
  assert.ok(Math.abs((await time() - slowIntro) * 90 / 60 - musicBeat) < .001);
  await rememberStudioFrame(page, "tempo-90");
  const pixels = await compareStudioFrames(page, "tempo-180", "tempo-90", [45, 105, 1235, 595]);
  assert.equal(pixels.exactChanged, 0, "Same music beat must retain the same motion pose at 90 and 180 BPM");
  const slowDuration = await duration();
  assert.ok(Math.abs((slowDuration - .08) / (fastDuration - .08) - 2) < .1);
  const clock = await audio.clock();
  await closePreview(clock.contextId, true);
  report.latestAndBpm = { latestBackgroundAndMotion: true, reopenStartsAtZero: true,
    bpms: [180, 90], musicBeat, durations: [fastDuration, slowDuration], sameBeatPixels: pixels, escapeCleanup: true };
  return draft;
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("download", (download) => report.downloads.push(download.suggestedFilename()));
  audio = await observeStudioAudio(page);
  await page.goto(`${baseUrl}?start=new`);
  report.assets = await page.locator('script[type="module"][src]').evaluateAll((scripts) => scripts.map((script) => script.src));
  const draft = await seedFixture();
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  await openPreview();
  if (mode === "recording") {
    // Targeted continuation for native close/focus, latest snapshots, tempo and
    // the recording branch, without repeating the completed layout/end checks.
    await play();
    const clock = await audio.clock();
    report.transport = { nativeClock: [clock], duration: await duration() };
    report.layouts = [];
    await verifyLatestAndTempo(draft);
    await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
    report.recording = await verifyRecordedStudioPlayback({ page, outputDir, draft, audio });
  } else {
    const transport = await verifyTransport();
    await verifyLayouts();
    if (mode === "full") {
      await verifyAllScenesAndLyrics();
      await verifyEndAndRestart(transport.length);
      await verifyLatestAndTempo(draft);
      await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
      report.recording = await verifyRecordedStudioPlayback({ page, outputDir, draft, audio });
    } else {
      await closePreview(transport.contextId, true);
    }
  }
  assert.equal(await audio.videoEncoders(), 0, "A live preview must not create native MP4 VideoEncoder instances");
  assert.deepEqual(report.downloads, [], "Playback preview must not produce downloads");
  assert.deepEqual(report.errors, []);
  report.audioEvents = audio.events;
  report.audioNodes = audio.nodes;
  report.success = true;
  console.log(JSON.stringify({ success: true, mode, nativeClock: report.transport.nativeClock,
    duration: report.transport.duration, layouts: report.layouts.map(({ width, height }) => [width, height]),
    allScenes: report.scenes?.length, lyrics: report.lyrics, latestAndBpm: report.latestAndBpm,
    recording: report.recording, downloads: report.downloads, videoEncoders: 0, errors: report.errors }, null, 2));
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
