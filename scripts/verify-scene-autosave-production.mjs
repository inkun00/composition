import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { chromium } from "playwright-core";
import LZString from "lz-string";

// Disposable contexts only: no real browser profile, account, project, or cloud write.
const baseUrl = process.env.APP_URL || "https://maeum-melody.vercel.app";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-autosave-production");
await mkdir(outputDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), baseUrl, isolatedContexts: true, errors: [], cases: [] };
let browser;

function fixture(projectId) {
  const words = ["나의노래", "우리그림", "함께불러", "리듬따라", "반짝이는", "작은마음", "노래만들", "다시만나"];
  return { version: 1, updatedAt: Date.now() - 60_000, projectId, sourceHash: "", title: "운영 자동 저장 검증",
    creator: "검증용 작곡가", originalCreator: "", presetId: "H001", songLength: 8,
    meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "piano", accompanimentStyleId: "arpeggio",
    accompanimentInstrumentIds: ["piano"], lyrics: words, showArrangement: true,
    measures: words.map((word, index) => ({ candidateId: "custom", candidateName: "자동 저장 검증", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word, (lyric, note) => ({ id: `autosave-note-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 1, denominator: 1 } })) })),
    musicVideoScenes: [
      { id: `${projectId}-first`, background: "#fff8ed", endLyric: null, endMeasureIndex: 3, motion: "still", elements: [
        { id: "original-left", tool: "rectangle", color: "#22c55e", width: 8, motion: "move-left", motionGroupId: "test-group",
          points: [[100, 100, .5], [250, 250, .5]] },
        { id: "original-right", tool: "rectangle", color: "#3b82f6", width: 8, motion: "move-left", motionGroupId: "test-group",
          points: [[400, 100, .5], [550, 250, .5]] }
      ] },
      { id: `${projectId}-second`, background: "#e7f3ec", endLyric: null, endMeasureIndex: 7, motion: "bounce", elements: [
        { id: "preserved-line", tool: "brush", color: "#ef4444", width: 8,
          points: [[100, 150, .5], [220, 220, .5], [330, 160, .5]] }
      ] }
    ] };
}

async function verifyBuildHashes() {
  const response = await fetch(baseUrl, { cache: "no-store" });
  assert.equal(response.status, 200);
  const html = await response.text();
  const assets = { javascript: /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html)?.[1],
    stylesheet: /href="([^"]*\/assets\/index-[^"]+\.css)"/.exec(html)?.[1] };
  const hashes = {};
  for (const [kind, assetPath] of Object.entries(assets)) {
    assert.ok(assetPath, `${kind} entry must exist`);
    const deployed = await fetch(new URL(assetPath, baseUrl), { cache: "no-store" });
    assert.equal(deployed.status, 200);
    const bytes = Buffer.from(await deployed.arrayBuffer());
    const local = await readFile(path.join("dist", new URL(assetPath, baseUrl).pathname));
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    hashes[kind] = hash(bytes);
    assert.equal(hash(bytes), hash(local), `${kind} must match the tested local build`);
  }
  report.build = { assets, hashes, matchesLocalBuild: true };
}

async function contextWithDraft(draft, quota = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ draft, quota }) => {
    if (!sessionStorage.getItem("autosave-test-seeded")) {
      localStorage.setItem("maeum-melody:draft:v1", JSON.stringify(draft));
      sessionStorage.setItem("autosave-test-seeded", "1");
    }
    if (quota) {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && key.startsWith("maeum-melody:draft:v1")) {
          throw new DOMException("Simulated full localStorage", "QuotaExceededError");
        }
        return setItem.call(this, key, value);
      };
    }
  }, { draft, quota });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ quota, message: error.message }));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${baseUrl}?start=new`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("draw-music-video-scene").waitFor();
  return { context, page };
}

async function localDraft(page) {
  const raw = await page.evaluate(() => localStorage.getItem("maeum-melody:draft:v1"));
  if (!raw) return null;
  return JSON.parse(raw.startsWith("lz16:") ? LZString.decompressFromUTF16(raw.slice(5)) : raw);
}

async function indexedDraft(page, projectId = null) {
  return page.evaluate(async (projectId) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("maeum-melody-projects", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!db.objectStoreNames.contains("projects") || !db.objectStoreNames.contains("metadata")) return null;
      const read = (store, key) => new Promise((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const id = projectId || await read("metadata", "current");
      return id ? (await read("projects", id))?.draft ?? null : null;
    } finally { db.close(); }
  }, projectId);
}

async function waitForIndexed(page, check, projectId = null) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const draft = await indexedDraft(page, projectId);
    if (check(draft)) return draft;
    await setTimeout(100);
  }
  assert.fail("IndexedDB did not commit the expected project within 10 seconds");
}

async function openStudio(page) {
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-paint-canvas").waitFor();
}

async function beginStroke(page, x = 200) {
  const box = await page.getByTestId("scene-paint-canvas").boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + x / 960 * box.width, box.y + 350 / 540 * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + (x + 130) / 960 * box.width, box.y + 400 / 540 * box.height, { steps: 8 });
}

async function verifyNormalStorage() {
  const { context, page } = await contextWithDraft(fixture("production-normal-project"));
  try {
    await openStudio(page);
    await beginStroke(page);
    const beforeReload = await localDraft(page);
    assert.equal(beforeReload.musicVideoScenes[0].elements.length, 3);
    assert.ok(beforeReload.musicVideoScenes[0].elements[2].points.length >= 5);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.mouse.up();
    await page.getByTestId("draw-music-video-scene").waitFor();
    const restored = await localDraft(page);
    assert.equal(restored.projectId, beforeReload.projectId);
    assert.deepEqual(restored.musicVideoScenes, beforeReload.musicVideoScenes);
    await waitForIndexed(page, (draft) => JSON.stringify(draft?.musicVideoScenes) === JSON.stringify(beforeReload.musicVideoScenes));
    await openStudio(page);
    assert.equal(await page.getByTestId("scene-assigned-motion-row").count(), 1);
    await page.screenshot({ path: path.join(outputDir, "production-after-reload.png") });
    report.cases.push({ name: "native stroke saved before pointerup and reload restores scene, background and grouped motions",
      points: restored.musicVideoScenes[0].elements[2].points.length });

    await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.getByRole("menuitem", { name: "새로 시작하기", exact: true }).click()
    ]);
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
    const newProject = await localDraft(page);
    assert.notEqual(newProject.projectId, restored.projectId);
    assert.equal(newProject.musicVideoScenes?.length ?? 0, 0);
    const archived = await indexedDraft(page, restored.projectId);
    assert.deepEqual(archived.musicVideoScenes, beforeReload.musicVideoScenes);

    await page.getByTestId("account-library-button").click();
    await page.locator(".account-local-projects summary").click();
    const recovery = page.getByRole("button", { name: "그림 복구", exact: true });
    assert.equal(await recovery.count(), 1);
    await page.screenshot({ path: path.join(outputDir, "production-local-recovery.png") });
    await recovery.click();
    await page.getByTestId("draw-music-video-scene").waitFor();
    const recovered = await localDraft(page);
    assert.equal(recovered.projectId, restored.projectId);
    assert.deepEqual(recovered.musicVideoScenes, beforeReload.musicVideoScenes);
    await openStudio(page);
    assert.equal(await page.getByTestId("scene-paint-canvas").locator(":scope > path").count(), 3);
    report.cases.push({ name: "new project stays independent and signed-out recovery UI restores original drawings from archive" });
  } finally { await context.close(); }
}

async function verifyQuotaRecovery() {
  const { context, page } = await contextWithDraft(fixture("production-quota-project"), true);
  try {
    await openStudio(page);
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("maeum-melody:draft:v1")) localStorage.removeItem(key);
    });
    await beginStroke(page);
    await page.mouse.up();
    assert.equal(await localDraft(page), null);
    const beforeReload = await waitForIndexed(page, (draft) => draft?.musicVideoScenes?.[0]?.elements[2]?.points.length >= 9);
    assert.equal(beforeReload.projectId, "production-quota-project");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("draw-music-video-scene").waitFor();
    assert.equal(await localDraft(page), null);
    const restored = await indexedDraft(page);
    assert.equal(restored.projectId, beforeReload.projectId);
    assert.deepEqual(restored.musicVideoScenes, beforeReload.musicVideoScenes);
    await openStudio(page);
    assert.equal(await page.getByTestId("scene-paint-canvas").locator(":scope > path").count(), 3);
    await page.screenshot({ path: path.join(outputDir, "production-indexeddb-recovery.png") });
    report.cases.push({ name: "quota-failed localStorage with no remaining draft restores drawings from IndexedDB before empty autosave" });
  } finally { await context.close(); }
}

try {
  await verifyBuildHashes();
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  await verifyNormalStorage();
  await verifyQuotaRecovery();
  assert.deepEqual(report.errors, [], "Deployed app must not throw while drawing or recovering");
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser?.close();
}
console.log(JSON.stringify(report, null, 2));
