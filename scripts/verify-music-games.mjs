import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";

// Build first. The game inputs below use the real UI and native Web Audio.
// Audio probes observe calls, never replace audio with simulated success.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/music-games");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const report = { startedAt: new Date().toISOString(), baseUrl, checks: [], layouts: [], errors: [], consoleErrors: [] };
const PROGRESS_KEY = "maeum-melody:games:v1";
let page;
let stage = "initializing";

async function shot(name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
}

async function layout(name) {
  await page.evaluate(() => document.fonts.ready);
  const measured = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  const overflow = measured.scrollWidth > measured.width + 1;
  const offenders = overflow ? await page.evaluate(() => [...document.querySelectorAll(".music-learning *")]
    .map((element) => ({ tag: element.tagName, name: String(element.className?.baseVal ?? element.className),
      right: Math.round(element.getBoundingClientRect().right) }))
    .filter((element) => element.right > innerWidth + 1).slice(0, 15)) : [];
  report.layouts.push({ name, ...measured, overflow, ...(overflow ? { offenders } : {}) });
  await shot(name);
  assert.equal(overflow, false, `${name} has horizontal page overflow`);
}

async function startGame(id) {
  await page.locator(`.arcade-island.island-${id}`).click();
  await page.locator(id === "bridge" ? ".bridge-game" : id === "train" ? ".rhythm-train-game" : ".memory-game").waitFor();
}

async function returnToMap() {
  await page.locator(".learn-header .learn-back").click();
  await page.getByRole("heading", { name: "리듬별 구조대", exact: true }).waitFor();
}

async function records() {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), PROGRESS_KEY);
}

async function placeBridge(name) {
  await page.getByRole("button", { name: new RegExp(`^${name} 조각 놓기`) }).click();
}

async function verifyBridge() {
  stage = "bridge-construction-and-rescue";
  await startGame("bridge");
  await layout("desktop-bridge-start");
  await placeBridge("4분음표");
  await page.getByRole("button", { name: "다리 건너기", exact: true }).click();
  assert.equal(await page.locator(".bridge-scene.is-cleared").count(), 0);
  assert.match(await page.locator(".bridge-feedback").innerText(), /1박/);
  await shot("desktop-bridge-incomplete");
  await page.setViewportSize({ width: 375, height: 812 });
  await layout("mobile-bridge");
  await page.setViewportSize({ width: 667, height: 375 });
  await layout("landscape-bridge");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "하나 빼기", exact: true }).click();
  const solutions = [["2분음표"], ["4분음표", "4분음표"], ["2분음표", "4분음표"], ["온음표"], ["2분음표", "4분음표", "4분쉼표"]];
  for (let index = 0; index < solutions.length; index++) {
    for (const name of solutions[index]) await placeBridge(name);
    await page.getByRole("button", { name: "다리 건너기", exact: true }).click();
    await page.locator(".bridge-scene.is-cleared").waitFor();
    if (index === 0) {
      await page.waitForFunction(() => {
        const traveler = document.querySelector(".bridge-traveler");
        const scene = document.querySelector(".bridge-scene");
        return traveler && scene && traveler.getBoundingClientRect().left > scene.getBoundingClientRect().left + scene.clientWidth * 0.6;
      });
      await shot("desktop-bridge-crossed");
    }
    if (index < solutions.length - 1) await page.getByRole("button", { name: "다음 친구 구하기", exact: true }).click();
  }
  await page.getByRole("heading", { name: "다섯 친구 모두 구조했어요!", exact: true }).waitFor();
  assert.ok((await records()).bridge?.score > 0);
  assert.equal((await records()).bridge.stars, 2, "one retry produces two stars instead of silently claiming a perfect run");
  await shot("desktop-bridge-complete");
  await returnToMap();
  report.checks.push("bridge: five beat-constrained missions, incomplete bridge rejection, actual bird crossing, stars and score saved");
}

async function pressMatchingPair(id) {
  await page.locator(`.memory-card[data-pair='${id}'][data-side='sign']`).click();
  await page.locator(`.memory-card[data-pair='${id}'][data-side='meaning']`).click();
}

async function verifyMemory() {
  stage = "memory-signs-and-dynamics";
  await startGame("memory");
  await layout("desktop-memory-start");
  await page.locator(".memory-card[data-pair='p'][data-side='sign']").click();
  await page.locator(".memory-card[data-pair='mf'][data-side='meaning']").click();
  assert.equal(await page.locator(".memory-card.face-up").count(), 2);
  assert.equal(await page.locator(".memory-card.matched").count(), 0);
  await shot("desktop-memory-mismatch");
  await page.getByRole("button", { name: "기억했어요, 다시 뒤집기", exact: true }).click();
  assert.equal(await page.locator(".memory-card.face-up").count(), 0);
  await page.setViewportSize({ width: 375, height: 812 });
  await layout("mobile-memory");
  await page.setViewportSize({ width: 667, height: 375 });
  await layout("landscape-memory");
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let index = 0; index < 3; index++) {
    const ids = await page.locator(".memory-card[data-side='sign']").evaluateAll((cards) => cards.map((card) => card.dataset.pair));
    const before = await page.evaluate(() => window.__gameAudioProbe.peaks.length);
    for (const id of ids) {
      const peaksBefore = await page.evaluate(() => window.__gameAudioProbe.peaks.length);
      await pressMatchingPair(id);
      if (id === "mf") {
        const peaks = await page.evaluate((start) => window.__gameAudioProbe.peaks.slice(start), peaksBefore);
        assert.ok(peaks.includes(0.115), "mf pair uses a real native gain envelope at the intended relative loudness");
      }
    }
    assert.equal(await page.locator(".memory-card.matched").count(), ids.length * 2);
    assert.ok(await page.evaluate((start) => window.__gameAudioProbe.peaks.length > start, before));
    if (index === 2) await shot("desktop-memory-complete");
    else await page.getByRole("button", { name: "다음 별자리로", exact: true }).click();
  }
  await page.getByRole("heading", { name: "모든 별자리를 밝혔어요!", exact: true }).waitFor();
  assert.ok((await records()).memory?.score > 0);
  await page.getByRole("button", { name: "탐험 지도 돌아가기", exact: true }).click();
  await page.getByRole("heading", { name: "리듬별 구조대", exact: true }).waitFor();
  report.checks.push("memory: mismatch/retry, all three constellations, thirteen symbol/meaning pairs, real mf gain, saved score");
}

async function performTrainRound(index, beats) {
  assert.equal(await page.getByRole("button", { name: "열차 출발!", exact: true }).isDisabled(), true,
    "listening is required before performing a new rhythm");
  await page.getByRole("button", { name: "리듬 먼저 듣기", exact: true }).click();
  await page.locator(".train-scene.phase-demo").waitFor();
  await page.locator(".train-scene.phase-ready").waitFor();
  await page.getByRole("button", { name: "열차 출발!", exact: true }).click();
  await page.locator(".train-scene.phase-countin").waitFor();
  await page.keyboard.press("Space");
  assert.match(await page.locator(".train-light-row").getAttribute("aria-label"), /0개 켜짐/,
    "count-in input must not earn points");
  // Read the visible moving cue during count-in, leaving time to schedule the
  // first input without waiting on a cross-process selector at the first beat.
  await page.waitForFunction(() => {
    const note = document.querySelector(".train-moving-note");
    const left = Number.parseFloat(note?.style.left ?? "0");
    return left < 80 && left > 22;
  });
  const origin = await page.evaluate(() => {
    const note = document.querySelector(".train-moving-note");
    const visibleLeft = Number.parseFloat(note.style.left);
    const visibleBeat = (22 - visibleLeft) / 17;
    return performance.now() - visibleBeat * 750;
  });
  const inputTimes = [];
  for (const beat of beats) {
    const now = await page.evaluate(() => performance.now());
    const remaining = origin + beat * 750 + (beat === 0 ? 80 : 20) - now;
    if (remaining > 0) await page.waitForTimeout(remaining);
    inputTimes.push({ targetBeat: beat, observedMs: await page.evaluate((start) => performance.now() - start, origin) });
    await page.keyboard.press("Space");
    if (beat === beats.at(-1) && index === 0) await shot("desktop-train-performing");
  }
  report.trainInputs ??= [];
  report.trainInputs.push({ round: index + 1, inputTimes });
  await page.locator(".train-scene.phase-result").waitFor();
  const message = await page.locator(".train-round-result > p").innerText();
  assert.match(message, new RegExp(`음표 ${beats.length}개 중 ${beats.length}개 성공`), message);
  assert.match(message, /추가로 누름 0번/, message);
  report.trainRounds ??= [];
  report.trainRounds.push(message);
  if (index < 2) await page.getByRole("button", { name: "다음 역으로", exact: true }).click();
  else await page.getByRole("button", { name: "탐험 도장 받기", exact: true }).click();
}

async function verifyTrain() {
  stage = "train-listen-countin-play";
  await startGame("train");
  await layout("desktop-train-ready");
  await page.setViewportSize({ width: 375, height: 812 });
  await layout("mobile-train");
  await page.setViewportSize({ width: 667, height: 375 });
  await layout("landscape-train");
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [index, beats] of [[0, [0, 1, 2, 3]], [1, [0, 2, 3]], [2, [0, 2, 3, 3.5]]]) {
    await performTrainRound(index, beats);
  }
  assert.ok((await records()).train?.score > 0);
  assert.equal((await records()).train.stars, 3);
  await page.getByRole("heading", { name: "리듬 열차 탐험 완료!", exact: true }).waitFor();
  await shot("desktop-train-complete");
  await page.getByRole("button", { name: "탐험 지도로 돌아가기", exact: true }).click();
  await page.getByRole("heading", { name: "리듬별 구조대", exact: true }).waitFor();
  report.checks.push("train: required listening, ignored count-in taps, eleven real timed keyboard hits across three rhythms, rests respected, saved results");
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    window.__gameAudioProbe = { peaks: [] };
    const native = AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime = function(value, time) {
      if (value > 0) window.__gameAudioProbe.peaks.push(value);
      return native.call(this, value, time);
    };
  });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
  await page.goto(baseUrl);
  await page.locator(".opening-learn").click();
  await page.getByRole("heading", { name: "리듬별 구조대", exact: true }).waitFor();
  assert.equal(await page.locator(".arcade-islands button").count(), 3);
  await layout("desktop-game-map");
  await page.setViewportSize({ width: 375, height: 812 });
  await layout("mobile-game-map");
  await page.setViewportSize({ width: 667, height: 375 });
  await layout("landscape-game-map");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await verifyBridge();
  await verifyMemory();
  await verifyTrain();
  stage = "all-game-records-survive-reload";
  const before = await records();
  assert.deepEqual(Object.keys(before).sort(), ["bridge", "memory", "train"]);
  await shot("desktop-all-games-recorded");
  await page.reload();
  await page.locator(".opening-learn").click();
  await page.getByRole("heading", { name: "리듬별 구조대", exact: true }).waitFor();
  assert.deepEqual(await records(), before);
  assert.equal(await page.locator(".arcade-mission-record").filter({ hasText: "최고" }).count(), 3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  await startGame("bridge");
  const transition = await page.locator(".bridge-traveler").evaluate((element) => getComputedStyle(element).transitionDuration);
  assert.equal(transition, "0s");
  report.checks.push("all three records survive page reload and reduced-motion disables crossing animation");
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.success = true;
  console.log(JSON.stringify({ success: true, checks: report.checks, layouts: report.layouts, trainRounds: report.trainRounds }, null, 2));
} catch (error) {
  report.success = false;
  report.stage = stage;
  report.failure = String(error);
  await page?.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ stage, error: String(error) }));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await server?.httpServer.close();
}
