import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// Real application and native mouse input, using disposable browser contexts only.
// Vite source imports below inspect the same persistence modules the app uses.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-autosave");
await mkdir(outputDir, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const report = { startedAt: new Date().toISOString(), baseUrl, isolatedContexts: true, errors: [], cases: [] };

function fixture(projectId) {
  const words = ["나의노래", "우리그림", "함께불러", "리듬따라", "반짝이는", "작은마음", "노래만들", "다시만나"];
  return { version: 1, updatedAt: Date.now() - 60_000, projectId, sourceHash: "", title: "자동 저장 브라우저 검증",
    creator: "검증용 작곡가", originalCreator: "", presetId: "H001", songLength: 8,
    meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "piano", accompanimentStyleId: "arpeggio",
    accompanimentInstrumentIds: ["piano"], lyrics: words, showArrangement: true,
    measures: words.map((word, index) => ({ candidateId: "custom", candidateName: "자동 저장 검증", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word, (lyric, note) => ({ id: `autosave-note-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 1, denominator: 1 } })) })),
    musicVideoScenes: [
      { id: `${projectId}-first`, background: "#ffffff", endLyric: null, endMeasureIndex: 3, motion: "still", elements: [
        { id: "original-left", tool: "rectangle", color: "#22c55e", width: 8, points: [[100, 100, .5], [250, 250, .5]] },
        { id: "original-right", tool: "rectangle", color: "#3b82f6", width: 8, points: [[400, 100, .5], [550, 250, .5]] }
      ] },
      { id: `${projectId}-second`, background: "#e7f3ec", endLyric: null, endMeasureIndex: 7, motion: "bounce", elements: [
        { id: "preserved-line", tool: "brush", color: "#ef4444", width: 8,
          points: [[100, 150, .5], [220, 220, .5], [330, 160, .5]] }
      ] }
    ] };
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
  return page.evaluate(async () => (await import("/src/music/draft.ts")).readDraft(localStorage));
}

async function durableDraft(page) {
  return page.evaluate(async () => (await import("/src/music/projectStorage.ts")).readBrowserProjectDraft());
}

async function openStudio(page) {
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-paint-canvas").waitFor();
}

async function canvasPoint(page, x, y) {
  const box = await page.getByTestId("scene-paint-canvas").boundingBox();
  assert.ok(box);
  return { x: box.x + x / 960 * box.width, y: box.y + y / 540 * box.height };
}

async function clickPoint(page, x, y, additive = false) {
  const point = await canvasPoint(page, x, y);
  if (additive) await page.keyboard.down("Shift");
  await page.mouse.click(point.x, point.y);
  if (additive) await page.keyboard.up("Shift");
}

async function beginStroke(page, x = 200, y = 350) {
  const start = await canvasPoint(page, x, y);
  const end = await canvasPoint(page, x + 130, y + 50);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
}

async function verifyNormalStorage() {
  const { context, page } = await contextWithDraft(fixture("autosave-normal-project"));
  try {
    await openStudio(page);
    await page.getByRole("button", { name: "크림 도화지", exact: true }).click();
    await page.getByTestId("scene-select-tool").click();
    await clickPoint(page, 175, 175);
    await clickPoint(page, 475, 175, true);
    await page.getByTestId("scene-motion-category-travel").click();
    await page.getByTestId("scene-motion-preset-move-left").click();
    const grouped = await localDraft(page);
    const groupId = grouped.musicVideoScenes[0].elements[0].motionGroupId;
    assert.ok(groupId);
    assert.equal(grouped.musicVideoScenes[0].elements[1].motionGroupId, groupId);
    assert.equal(grouped.musicVideoScenes[0].elements[0].motion, "move-left");
    assert.equal(grouped.musicVideoScenes[0].background, "#fff8ed");
    report.cases.push({ name: "native selection creates persisted motion group and background", groupId });

    await page.getByRole("button", { name: "붓", exact: true }).click();
    await beginStroke(page);
    const active = await localDraft(page);
    assert.equal(active.musicVideoScenes[0].elements.length, 3);
    assert.ok(active.musicVideoScenes[0].elements[2].points.length >= 5);
    // Simulate the browser's cancellation edge, after native pointer movement.
    await page.getByTestId("scene-paint-canvas").evaluate((canvas) => canvas.dispatchEvent(
      new PointerEvent("pointercancel", { bubbles: true, pointerId: 1, pointerType: "mouse" })));
    await page.mouse.up();
    assert.deepEqual((await localDraft(page)).musicVideoScenes, active.musicVideoScenes);
    await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
    assert.equal((await localDraft(page)).musicVideoScenes[0].elements.length, 2);
    await page.getByRole("button", { name: "그림 다시 실행", exact: true }).click();
    assert.deepEqual((await localDraft(page)).musicVideoScenes, active.musicVideoScenes);
    report.cases.push({ name: "active stroke checkpoints, cancellation, single undo and redo", points: active.musicVideoScenes[0].elements[2].points.length });

    await beginStroke(page, 440, 350);
    const beforeClose = await localDraft(page);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await page.getByTestId("scene-paint-canvas").count(), 0);
    await openStudio(page);
    assert.deepEqual((await localDraft(page)).musicVideoScenes, beforeClose.musicVideoScenes);
    report.cases.push({ name: "close during stroke and reopen preserves all scenes" });

    await beginStroke(page, 650, 350);
    const beforeReload = await localDraft(page);
    assert.equal(beforeReload.musicVideoScenes[0].elements.length, 5);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.mouse.up();
    await page.getByTestId("draw-music-video-scene").waitFor();
    const afterReload = await durableDraft(page);
    assert.deepEqual(afterReload.musicVideoScenes, beforeReload.musicVideoScenes);
    assert.equal(afterReload.projectId, beforeReload.projectId);
    await openStudio(page);
    assert.equal(await page.getByTestId("scene-assigned-motion-row").count(), 1);
    await page.screenshot({ path: path.join(outputDir, "normal-after-reload.png") });
    report.cases.push({ name: "reload before pointerup restores stroke, scenes, background, group and motion" });

    await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.getByRole("menuitem", { name: "새로 시작하기", exact: true }).click()
    ]);
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
    const newProject = await durableDraft(page);
    assert.notEqual(newProject.projectId, afterReload.projectId);
    assert.equal(newProject.musicVideoScenes?.length ?? 0, 0);
    const archive = await page.evaluate(async (id) =>
      (await import("/src/music/projectStorage.ts")).readBrowserProject(id), afterReload.projectId);
    assert.deepEqual(archive.musicVideoScenes, beforeReload.musicVideoScenes);
    assert.equal(archive.title, afterReload.title);
    report.cases.push({ name: "new project has separate identity and original project archive stays recoverable",
      originalId: afterReload.projectId, newId: newProject.projectId });
  } finally { await context.close(); }
}

async function verifyQuotaRecovery() {
  const { context, page } = await contextWithDraft(fixture("autosave-quota-project"), true);
  try {
    await openStudio(page);
    // Leave no local checkpoint at all. Writes continue to fail across reload.
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("maeum-melody:draft:v1")) localStorage.removeItem(key);
    });
    await beginStroke(page);
    await page.mouse.up();
    assert.equal(await localDraft(page), null);
    const beforeReload = await durableDraft(page);
    assert.equal(beforeReload.projectId, "autosave-quota-project");
    assert.equal(beforeReload.musicVideoScenes[0].elements.length, 3);
    assert.ok(beforeReload.musicVideoScenes[0].elements[2].points.length >= 5);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("draw-music-video-scene").waitFor();
    assert.equal(await localDraft(page), null);
    const afterReload = await durableDraft(page);
    assert.equal(afterReload.title, beforeReload.title);
    assert.equal(afterReload.projectId, beforeReload.projectId);
    assert.deepEqual(afterReload.musicVideoScenes, beforeReload.musicVideoScenes);
    await openStudio(page);
    assert.equal(await page.getByTestId("scene-paint-canvas").locator(":scope > path").count(), 3);
    await page.screenshot({ path: path.join(outputDir, "quota-indexeddb-after-reload.png") });
    report.cases.push({ name: "localStorage quota failure falls back to IndexedDB and startup restores before empty app autosave",
      projectId: afterReload.projectId, points: afterReload.musicVideoScenes[0].elements[2].points.length });
  } finally { await context.close(); }
}

try {
  await verifyNormalStorage();
  await verifyQuotaRecovery();
  assert.deepEqual(report.errors, [], "Application must not throw during persistence or recovery");
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
console.log(JSON.stringify(report, null, 2));
