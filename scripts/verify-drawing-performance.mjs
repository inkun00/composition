import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import LZString from "lz-string";

const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/drawing-performance");
const buildDir = path.resolve(process.env.BUILD_DIR || "dist");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ build: { outDir: buildDir }, preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const KEY = "maeum-melody:draft:v1";
const report = { startedAt: new Date().toISOString(), baseUrl, buildDir, errors: [], blockedCloudRequests: 0, cases: [] };
const html = await readFile(path.join(buildDir, "index.html"), "utf8");
report.javascript = /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];

async function verifyProductionBuild() {
  const response = await fetch(baseUrl, { cache: "no-store" });
  assert.equal(response.status, 200);
  const deployedHtml = await response.text();
  const assets = { javascript: /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(deployedHtml)?.[1],
    stylesheet: /href="([^"]*\/assets\/index-[^"]+\.css)"/.exec(deployedHtml)?.[1] };
  const hashes = {};
  for (const [kind, asset] of Object.entries(assets)) {
    assert.ok(asset);
    const served = await fetch(new URL(asset, baseUrl), { cache: "no-store" });
    assert.equal(served.status, 200);
    const servedBytes = Buffer.from(await served.arrayBuffer());
    const localBytes = await readFile(path.join(buildDir, asset));
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    hashes[kind] = hash(servedBytes);
    assert.equal(hash(servedBytes), hash(localBytes));
  }
  report.build = { assets, hashes, matchesLocalBuild: true };
}

function fixture(label, heavy) {
  const words = Array.from({ length: 16 }, (_, i) => ["우리노래", "함께불러", "리듬따라", "반짝이는"][i % 4]);
  return { version: 1, updatedAt: Date.now() - 60_000, projectId: `drawing-performance-${label}`, sourceHash: "",
    title: "합성 그림 성능 검증", creator: "검증용 작곡가", originalCreator: "", presetId: "H001", songLength: 16,
    meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "piano", accompanimentStyleId: "arpeggio",
    accompanimentInstrumentIds: ["piano"], lyrics: words, showArrangement: true,
    measures: words.map((word, index) => ({ candidateId: "custom", candidateName: "성능 검증", chords: ["C"], effects: [],
      notes: Array.from(word, (lyric, note) => ({ id: `perf-note-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 1, denominator: 1 } })) })),
    musicVideoScenes: Array.from({ length: 12 }, (_, s) => ({ id: `scene-${s}`, background: "#ffffff", endLyric: null,
      endMeasureIndex: Math.floor((s + 1) * 16 / 12) - 1, motion: "still",
      elements: Array.from({ length: heavy ? 30 : 2 }, (_, e) => ({ id: `seed-${s}-${e}`, tool: "brush", color: ["#4285f4", "#22c55e", "#ef4444"][e % 3], width: 4,
        points: Array.from({ length: heavy ? 60 : 10 }, (_, p) => [40 + (e * 27 + p * 8) % 870, 35 + (e * 13 + Math.sin(p / 3) * 22 + s * 3 + 450) % 460, .5]) })) })) };
}

async function setup(label, heavy) {
  const draft = fixture(label, heavy);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(/firestore\.googleapis\.com|firebaseio\.com/, (route) => { report.blockedCloudRequests++; return route.abort(); });
  await context.addInitScript({ path: path.resolve("node_modules/lz-string/libs/lz-string.js") });
  await context.addInitScript(({ draft, key }) => {
    if (!sessionStorage.getItem("drawing-performance-seeded")) {
      localStorage.setItem(key, JSON.stringify(draft));
      localStorage.setItem("maeum-melody:lost-drawings:auto-prompt-shown:v1", "1");
      sessionStorage.setItem("drawing-performance-seeded", "1");
    }
    const metrics = window.__drawingMetrics = { active: false, storage: [], puts: [], events: [], frames: [], longTasks: [], commits: 0, appRenders: 0 };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      const before = performance.now();
      try { return setItem.call(this, name, value); }
      finally { if (metrics.active && this === localStorage && name.startsWith(key)) metrics.storage.push({ key: name, ms: performance.now() - before, bytes: value.length }); }
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const before = performance.now();
      try { return put.apply(this, args); }
      finally { if (metrics.active) metrics.puts.push({ store: this.name, ms: performance.now() - before }); }
    };
    let appState;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, inject: () => 1,
      onCommitFiberRoot(_id, root) {
        let app = root.current.child;
        while (app && typeof app.type !== "function") app = app.child;
        if (metrics.active) { metrics.commits++; if (app?.memoizedState !== appState) metrics.appRenders++; }
        appState = app?.memoizedState;
      }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {} };
    const starts = new WeakMap();
    document.addEventListener("pointermove", (event) => { if (metrics.active) starts.set(event, performance.now()); }, true);
    document.addEventListener("pointermove", (event) => {
      const start = starts.get(event);
      if (start !== undefined) metrics.events.push(performance.now() - start);
    });
    new PerformanceObserver((list) => { if (metrics.active) metrics.longTasks.push(...list.getEntries().map((entry) => entry.duration)); }).observe({ entryTypes: ["longtask"] });
    function frame(now) { if (metrics.active) metrics.frames.push(now); requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  }, { draft, key: KEY });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ label, message: error.message }));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${baseUrl}?start=new`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-paint-canvas").waitFor();
  await page.getByRole("button", { name: "붓", exact: true }).click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-testid="scene-paint-canvas"] > path').count(), heavy ? 30 : 2);
  return { context, page, draft };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (v) => Math.round((v || 0) * 100) / 100;
  return { count: sorted.length, median: round(sorted[Math.floor(sorted.length * .5)]), p95: round(sorted[Math.floor(sorted.length * .95)]), max: round(sorted.at(-1)), total: round(sorted.reduce((a, b) => a + b, 0)) };
}

async function drawBench(page, pacing) {
  const canvas = page.getByTestId("scene-paint-canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .15, box.y + box.height * .75);
  await page.evaluate(() => {
    const m = window.__drawingMetrics;
    for (const key of ["storage", "puts", "events", "frames", "longTasks"]) m[key] = [];
    m.commits = m.appRenders = 0;
    m.active = true;
  });
  await page.mouse.down();
  const pointerMs = await canvas.evaluate(async (svg, pacing) => {
    const box = svg.getBoundingClientRect();
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      if (pacing === "frames") await new Promise(requestAnimationFrame);
      svg.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, pointerType: "mouse", buttons: 1,
        clientX: box.x + box.width * (.15 + i * .006), clientY: box.y + box.height * (.75 + Math.sin(i / 8) * .08), pressure: .5 }));
    }
    return performance.now() - start;
  }, pacing);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const values = await page.evaluate(() => { window.__drawingMetrics.active = false; return window.__drawingMetrics; });
  const intervals = values.frames.slice(1).map((at, i) => at - values.frames[i]);
  return { pacing, pointerMs: Math.round(pointerMs), storageWrites: values.storage.length,
    primaryWrites: values.storage.filter((entry) => entry.key === KEY).length,
    storageMs: summarize(values.storage.map((entry) => entry.ms)), idbPuts: values.puts.length,
    idbPutMs: summarize(values.puts.map((entry) => entry.ms)), pointerHandlerMs: summarize(values.events),
    frameGapMs: summarize(intervals), longTaskMs: summarize(values.longTasks), rootCommits: values.commits, appRenders: values.appRenders };
}

async function runBench(label, heavy) {
  const { context, page, draft } = await setup(label, heavy);
  try {
    const burst = await drawBench(page, "burst");
    const burstSaved = await waitSaved(page, null, 0, draft.musicVideoScenes[0].elements.length + 1, "Burst benchmark stroke");
    burst.retainedPoints = burstSaved[0].elements.at(-1).points.length;
    assert.ok(burst.retainedPoints >= 100, "Burst input must retain the complete stroke");
    const frames = await drawBench(page, "frames");
    const framesSaved = await waitSaved(page, null, 0, draft.musicVideoScenes[0].elements.length + 2, "Frame-paced benchmark stroke");
    frames.retainedPoints = framesSaved[0].elements.at(-1).points.length;
    assert.ok(frames.retainedPoints >= 100, "Smoothness must not be gained by dropping sampled points");
    report.cases.push({ label, seedPoints: draft.musicVideoScenes.reduce((n, scene) => n + scene.elements.reduce((m, element) => m + element.points.length, 0), 0), burst, frames });
    await page.screenshot({ path: path.join(outputDir, `${label}.png`) });
    await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  } finally { await context.close(); }
}

async function localDraft(page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), KEY);
  return raw ? JSON.parse(raw.startsWith("lz16:") ? LZString.decompressFromUTF16(raw.slice(5)) : raw) : null;
}

async function indexedDraft(page, projectId) {
  return page.evaluate(async (id) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("maeum-melody-projects", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction("projects", "readonly").objectStore("projects").get(id);
        request.onsuccess = () => resolve(request.result?.draft ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, projectId);
}

async function waitSaved(page, expected, sceneIndex, expectedCount, message) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const draft = await localDraft(page);
    if (draft?.musicVideoScenes?.[sceneIndex]?.elements.length === expectedCount) {
      const snapshot = draft.musicVideoScenes;
      if (!expected || JSON.stringify(snapshot) === JSON.stringify(expected)) {
        const durable = await indexedDraft(page, draft.projectId);
        if (JSON.stringify(durable?.musicVideoScenes) === JSON.stringify(snapshot)) return snapshot;
      }
    }
    await page.waitForTimeout(60);
  }
  assert.fail(`${message}: browser checkpoint and IndexedDB did not match`);
}

async function beginNativeStroke(page, offset = 0) {
  const box = await page.getByTestId("scene-paint-canvas").boundingBox();
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * (.5 + offset));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * (.6 + offset), { steps: 8 });
}

async function preserveBufferedStroke(page, eventName, sceneIndex, expectedCount) {
  const canvas = page.getByTestId("scene-paint-canvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .5);
  await page.mouse.down();
  const immediate = await canvas.evaluate((svg, { eventName, sceneIndex, key }) => {
    const box = svg.getBoundingClientRect();
    for (let point = 1; point <= 8; point++) svg.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true, pointerId: 1, pointerType: "mouse", buttons: 1, pressure: .5,
      clientX: box.x + box.width * (.25 + point * .04), clientY: box.y + box.height * (.5 + point * .015)
    }));
    if (eventName === "visibilitychange") {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    } else window.dispatchEvent(new Event(eventName, { cancelable: true }));
    // Deliberately read in the same synchronous task. A timeout, animation frame,
    // React effect or later pointerup must not be able to hide a lost final point.
    const raw = localStorage.getItem(key);
    const decoded = raw?.startsWith("lz16:") ? window.LZString.decompressFromUTF16(raw.slice(5)) : raw;
    const scene = JSON.parse(decoded).musicVideoScenes[sceneIndex];
    const result = { count: scene.elements.length, points: scene.elements.at(-1).points.length, lastPoint: scene.elements.at(-1).points.at(-1) };
    if (eventName === "visibilitychange") delete document.visibilityState;
    return result;
  }, { eventName, sceneIndex, key: KEY });
  assert.equal(immediate.count, expectedCount, `${eventName} must synchronously retain the new stroke`);
  assert.ok(immediate.points >= 9, `${eventName} must flush the complete unpublished point buffer`);
  assert.ok(Math.abs(immediate.lastPoint[0] - 547.2) <= .1 && Math.abs(immediate.lastPoint[1] - 334.8) <= .1,
    `${eventName} must persist the final point before the event returns: ${immediate.lastPoint}`);
  await page.mouse.up();
  report.cases.push({ label: `synchronous-${eventName}-last-point`, immediateCheckpointVerified: true, ...immediate });
}

async function verifyPersistence() {
  const { page, context, draft } = await setup("persistence", false);
  const count = 2;
  let expected = draft.musicVideoScenes;
  try {
    await beginNativeStroke(page);
    await page.mouse.up();
    expected = await waitSaved(page, null, 0, count + 1, "Pointerup");
    assert.ok(expected[0].elements.at(-1).points.length >= 5);
    await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
    await waitSaved(page, draft.musicVideoScenes, 0, count, "One undo removes the entire stroke");
    await page.getByRole("button", { name: "그림 다시 실행", exact: true }).click();
    await waitSaved(page, expected, 0, count + 1, "Redo restores all stroke points");
    report.cases.push({ label: "persistence-pointerup-undo-redo", stores: ["localStorage", "IndexedDB"] });

    await beginNativeStroke(page, -.15);
    await page.getByRole("button", { name: "지우개", exact: true }).evaluate((button) => button.click());
    await page.mouse.up();
    expected = await waitSaved(page, null, 0, count + 2, "Midstroke tool change");
    assert.ok(expected[0].elements.at(-1).points.length >= 5);
    report.cases.push({ label: "persistence-midstroke-tool-change", stores: ["localStorage", "IndexedDB"] });
    await page.getByRole("button", { name: "붓", exact: true }).click();

    const untouchedSecond = expected[1];
    await beginNativeStroke(page, .05);
    await page.getByRole("button", { name: "2번 장면 선택", exact: true }).evaluate((button) => button.click());
    await page.mouse.up();
    expected = await waitSaved(page, null, 0, count + 3, "Midstroke slide change");
    assert.deepEqual(expected[1], untouchedSecond);
    assert.ok(expected[0].elements.at(-1).points.length >= 5);
    report.cases.push({ label: "persistence-midstroke-slide-change", stores: ["localStorage", "IndexedDB"] });

    await preserveBufferedStroke(page, "visibilitychange", 1, count + 1);
    expected = await waitSaved(page, null, 1, count + 1, "Hidden document");
    assert.ok(expected[1].elements.at(-1).points.length >= 5);
    report.cases.push({ label: "persistence-hidden-document", stores: ["localStorage", "IndexedDB"] });

    await preserveBufferedStroke(page, "beforeunload", 1, count + 2);
    expected = await waitSaved(page, null, 1, count + 2, "Beforeunload final checkpoint");
    await preserveBufferedStroke(page, "pagehide", 1, count + 3);
    expected = await waitSaved(page, null, 1, count + 3, "Pagehide final checkpoint");

    await beginNativeStroke(page, -.1);
    await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).evaluate((button) => button.click());
    await page.mouse.up();
    expected = await waitSaved(page, null, 1, count + 4, "Close editor midstroke");
    assert.ok(expected[1].elements.at(-1).points.length >= 5);
    await page.getByTestId("draw-music-video-scene").click();
    await page.getByTestId("scene-paint-canvas").waitFor();
    report.cases.push({ label: "persistence-midstroke-close", stores: ["localStorage", "IndexedDB"] });

    await page.getByRole("button", { name: "2번 장면 선택", exact: true }).click();
    await beginNativeStroke(page, .02);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.mouse.up();
    await page.getByTestId("draw-music-video-scene").waitFor();
    const restored = await waitSaved(page, null, 1, count + 5, "Reload while pointer remains down");
    assert.ok(restored[1].elements.at(-1).points.length >= 5);
    assert.deepEqual(restored[0], expected[0]);
    assert.deepEqual(restored.slice(2), draft.musicVideoScenes.slice(2));
    assert.equal((await localDraft(page)).projectId, draft.projectId);
    assert.deepEqual((await localDraft(page)).measures, draft.measures);
    report.cases.push({ label: "persistence-midstroke-reload", stores: ["localStorage", "IndexedDB"], originalNotesLyricsAndOtherScenesPreserved: true });
  } finally { await context.close(); }
}

try {
  if (process.env.APP_URL) await verifyProductionBuild();
  if (process.env.SKIP_BENCH !== "1") {
    await runBench("light", false);
    await runBench("heavy", true);
  }
  if (process.env.VERIFY_PERSISTENCE === "1") await verifyPersistence();
  assert.deepEqual(report.errors, []);
  assert.equal(report.blockedCloudRequests, 0);
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.stack || String(error); process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(JSON.stringify(report, null, 2));
