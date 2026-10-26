import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { seekAssignedPreview, compareAssignedPreview, captureAssignedPreview,
  exportAssignedRemovalVideo } from "./scene-assigned-motion-media.mjs";

// Focused actual-app regression for the assigned-object motion list. Build first.
// APP_URL and OUTPUT_DIR also run the same inputs against the deployed service.
// No UI, renderer, persistence, or export implementation is mocked.
const DRAFT_KEY = "maeum-melody:draft:v1";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-assigned-motions");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const report = { startedAt: new Date().toISOString(), baseUrl, source: "actual assigned object motion workflow", errors: [] };
let page;

async function savedScenes() {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).musicVideoScenes, DRAFT_KEY);
}

async function waitScenes(expected) {
  await page.waitForFunction(({ key, expected }) => JSON.stringify(JSON.parse(localStorage.getItem(key)).musicVideoScenes) ===
    JSON.stringify(expected), { key: DRAFT_KEY, expected });
}

async function seedDrawing() {
  return page.evaluate((key) => {
    const words = ["내가그린그림", "동작을골라요", "함께움직여요", "그림은남아요",
      "다음장면에는", "꽃이피어있어", "노래를따라서", "우리들의이야기"];
    const measures = words.map((word, index) => ({ candidateId: "custom", candidateName: "개체 동작 목록 검증",
      chords: [index % 2 ? "F" : "C"], notes: Array.from(word, (lyric, noteIndex) => ({
        id: `assigned-${index}-${noteIndex}`, pitch: 60, lyric, duration: { numerator: 4, denominator: word.length } })) }));
    const first = { id: "assigned-first", background: "#fff8ed", motion: "still", endLyric: null, endMeasureIndex: 3,
      elements: [
        { id: "red-frame", tool: "rectangle", color: "#ea4335", width: 10, points: [[150, 170, .5], [350, 330, .5]] },
        { id: "blue-orbit", tool: "ellipse", color: "#4285f4", width: 10, points: [[610, 190, .5], [790, 350, .5]] },
        { id: "green-line", tool: "line", color: "#34a853", width: 12, points: [[420, 400, .5], [580, 400, .5]] },
        { id: "gold-circle", tool: "ellipse", color: "#fbbc04", width: 10, points: [[430, 220, .5], [530, 320, .5]] },
        { id: "idle-still", tool: "line", color: "#a142f4", width: 6, motion: "still", points: [[60, 440, .5], [150, 440, .5]] },
        { id: "idle-auto", tool: "line", color: "#a142f4", width: 6, motion: "auto", points: [[60, 470, .5], [150, 470, .5]] }
      ] };
    const second = { id: "assigned-other", background: "#ffffff", motion: "still", endLyric: null, endMeasureIndex: 7,
      elements: [{ id: "other-flower", tool: "ellipse", color: "#a142f4", width: 14, motion: "snow",
        points: [[400, 160, .5], [560, 320, .5]] }] };
    const scenes = [first, second];
    localStorage.setItem(key, JSON.stringify({ version: 1, updatedAt: Date.now(), sourceHash: "",
      title: "개체 동작 목록 검증", creator: "브라우저 검증", originalCreator: "", presetId: "H001", songLength: 8,
      meter: { beats: 4, beatUnit: 4 }, instrumentId: "piano", accompanimentStyleId: "arpeggio",
      accompanimentInstrumentIds: ["piano"], bpm: 180, lyrics: words, measures, showArrangement: true, musicVideoScenes: scenes }));
    return scenes;
  }, DRAFT_KEY);
}

async function openDrawing() {
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-assigned-motions").waitFor({ state: "attached" });
}

async function settingsPanel() {
  const button = page.getByRole("button", { name: "장면 설정 보기", exact: true });
  if (await button.isVisible()) await button.click();
}

async function chooseElementAt(x, y, id) {
  await page.getByTestId("scene-select-tool").click();
  const canvas = page.getByTestId("scene-paint-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box);
  await page.mouse.click(box.x + x / 960 * box.width, box.y + y / 540 * box.height);
  await assertSelected([id]);
}

async function assertSelected(expected) {
  await page.waitForFunction((expected) => {
    const selected = [...document.querySelectorAll('[data-testid="scene-selection-outline"] [data-element-id]')]
      .map((element) => element.getAttribute("data-element-id"));
    return JSON.stringify(selected) === JSON.stringify(expected);
  }, expected);
}

async function applyMotion(id) {
  const category = id.startsWith("move-") ? "travel" : "atmosphere";
  await page.getByTestId(`scene-motion-category-${category}`).click();
  await page.getByTestId(`scene-motion-preset-${id}`).click();
  await page.waitForFunction((id) => document.querySelector(`[data-testid="scene-motion-preset-${id}"]`)
    ?.getAttribute("aria-pressed") === "true", id);
}

async function assertRows(expected) {
  const rows = page.getByTestId("scene-assigned-motion-row");
  assert.equal(await rows.count(), expected.length);
  const ids = await rows.locator('[data-testid^="scene-assigned-motion-select-"]')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-testid").replace("scene-assigned-motion-select-", "")));
  assert.deepEqual(ids, expected, "The list must follow the current scene's painter order and omit still/auto/unassigned objects");
}

async function assertPreserved(current, original) {
  assert.deepEqual(current[1], original[1], "Removing an object motion must preserve the other scene");
  assert.equal(current[0].motion, "still");
  assert.equal(current[0].background, original[0].background);
  assert.equal(current[0].endMeasureIndex, original[0].endMeasureIndex);
  assert.deepEqual(current[0].elements.map(({ motion, ...element }) => element),
    original[0].elements.map(({ motion, ...element }) => element), "Object deletion controls must preserve all authored drawing points and styles");
}

async function verifyListLayout(stage, expected) {
  const checks = [];
  for (const [width, height] of [[1440, 900], [390, 844], [375, 667]]) {
    await page.setViewportSize({ width, height });
    await settingsPanel();
    await page.getByTestId("scene-assigned-motions").scrollIntoViewIfNeeded();
    await assertRows(expected);
    const controls = [];
    for (const id of [expected[0], expected.at(-1)]) {
      const remove = page.getByTestId(`scene-remove-element-motion-${id}`);
      await remove.click({ trial: true });
      const box = await remove.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${width}px motion delete targets must be at least 44×44px`);
      assert.ok(box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height + 1);
      controls.push({ id, width: box.width, height: box.height });
    }
    const bulk = page.getByTestId("scene-remove-selected-motions");
    if (await bulk.count()) {
      await bulk.click({ trial: true });
      const box = await bulk.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= -1 && box.x + box.width <= width + 1);
      controls.push({ id: "selected-two", width: box.width, height: box.height });
    }
    const list = await page.getByTestId("scene-assigned-motion-list").evaluate((element) => ({
      height: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop
    }));
    assert.ok(list.height <= 222, "Assigned motions must use a bounded scrolling list");
    if (expected.length === 240) assert.ok(list.scrollHeight > list.height * 2 && list.scrollTop > 0);
    assert.equal(await page.locator(".mv-studio").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
    await page.screenshot({ path: path.join(outputDir, `assigned-${stage}-${width}.png`) });
    checks.push({ width, height, controls, list, horizontalOverflow: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  return checks;
}

async function verifyAssignedWorkflow(original) {
  await assertRows([]);
  assert.equal(await page.getByTestId("scene-assigned-motions-empty").count(), 1);
  const choices = [["red-frame", 180, 200, "move-right"], ["blue-orbit", 700, 270, "float"],
    ["green-line", 500, 400, "bounce"], ["gold-circle", 480, 270, "pulse"]];
  for (const [id, x, y, motion] of choices) {
    await chooseElementAt(x, y, id);
    await applyMotion(motion);
    assert.equal((await savedScenes())[0].elements.find((element) => element.id === id).motion, motion);
  }
  const assigned = await savedScenes();
  await assertPreserved(assigned, original);
  await assertRows(choices.map(([id]) => id));
  assert.match(await page.getByTestId("scene-assigned-motion-select-red-frame").innerText(), /네모\s*1/);
  assert.match(await page.getByTestId("scene-assigned-motion-select-blue-orbit").innerText(), /동그라미\s*2/);
  await page.getByTestId("scene-assigned-motion-select-blue-orbit").click();
  await page.getByTestId("scene-assigned-motion-select-green-line").click({ modifiers: ["Shift"] });
  await assertSelected(["blue-orbit", "green-line"]);
  assert.deepEqual(await savedScenes(), assigned);
  report.layouts = await verifyListLayout("four", choices.map(([id]) => id));
  await page.getByTestId("scene-assigned-motion-select-red-frame").click();
  await assertSelected(["red-frame"]);
  assert.deepEqual(await savedScenes(), assigned, "Choosing a row must only select its complete canvas object");
  await page.getByTestId("scene-remove-element-motion-red-frame").click();
  const removedOne = await savedScenes();
  assert.equal(removedOne[0].elements[0].motion, undefined);
  assert.deepEqual(removedOne[0].elements.slice(1), assigned[0].elements.slice(1));
  await assertPreserved(removedOne, original);
  await assertRows(["blue-orbit", "green-line", "gold-circle"]);
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "scene-remove-element-motion-blue-orbit");
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(assigned);
  await assertRows(choices.map(([id]) => id));
  await page.getByRole("button", { name: "그림 다시 실행", exact: true }).click();
  await waitScenes(removedOne);
  await page.getByTestId("scene-assigned-motion-select-blue-orbit").click();
  await page.getByTestId("scene-assigned-motion-select-green-line").click({ modifiers: ["Shift"] });
  await assertSelected(["blue-orbit", "green-line"]);
  const bulk = page.getByTestId("scene-remove-selected-motions");
  assert.equal(await bulk.isDisabled(), false);
  await bulk.click();
  const removedThree = await savedScenes();
  assert.deepEqual(removedThree[0].elements.slice(0, 3).map((element) => element.motion), [undefined, undefined, undefined]);
  assert.equal(removedThree[0].elements[3].motion, "pulse");
  assert.deepEqual(removedThree[0].elements.slice(4), assigned[0].elements.slice(4));
  await assertPreserved(removedThree, original);
  await assertRows(["gold-circle"]);
  await page.reload();
  await openDrawing();
  assert.deepEqual(await savedScenes(), removedThree);
  await seekAssignedPreview(page, 0, "survivor-start");
  await captureAssignedPreview(page, outputDir, "assigned-after-removal-start.png");
  await seekAssignedPreview(page, 1 / 6, "survivor-peak");
  await captureAssignedPreview(page, outputDir, "assigned-after-removal-pulse.png");
  const pixels = await compareAssignedPreview(page, "survivor-start", "survivor-peak");
  for (const name of ["removedRectangle", "removedEllipse", "removedLine"]) assert.equal(pixels[name].exactChanged, 0);
  assert.ok(pixels.remainingCircle.changed > 150, "Deleting other effects must leave the remaining object's animation visible");
  report.exports = [];
  for (const animated of [true, false]) report.exports.push(await exportAssignedRemovalVideo(page, outputDir, animated));
  assert.deepEqual(await savedScenes(), removedThree);
  await page.getByRole("button", { name: "움직임 미리보기", exact: true }).click();
  await page.getByRole("button", { name: "미리보기 멈추기", exact: true }).waitFor();
  await page.getByTestId("scene-remove-element-motion-gold-circle").click();
  await assertRows([]);
  await page.getByRole("button", { name: "움직임 미리보기", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "미리보기 멈추기", exact: true }).count(), 0);
  const empty = await savedScenes();
  await assertPreserved(empty, original);
  assert.equal(await page.getByTestId("scene-assigned-motions-empty").count(), 1);
  await seekAssignedPreview(page, 0, "empty-start");
  await seekAssignedPreview(page, 1 / 6, "empty-later");
  const stoppedPixels = await compareAssignedPreview(page, "empty-start", "empty-later");
  for (const region of Object.values(stoppedPixels)) assert.equal(region.exactChanged, 0);
  const download = page.waitForEvent("download");
  await page.getByTestId("scene-save").click();
  const filename = path.join(outputDir, "removed-object-motions.scene.json");
  await (await download).saveAs(filename);
  assert.deepEqual(JSON.parse(await readFile(filename, "utf8")).scene, empty[0]);
  await page.getByTestId("scene-reset").click();
  await page.getByTestId("scene-import-file").setInputFiles(filename);
  await waitScenes(empty);
  await page.reload();
  await openDrawing();
  assert.deepEqual(await savedScenes(), empty);
  await assertRows([]);
  report.workflow = { actualDifferentMotions: 4, rowSelectsWholeObject: true, selectionDoesNotCommit: true,
    removeOne: true, removeSelectedTwoOnly: true, undoRedo: true, originalAndOtherScenePreserved: true,
    deletionPersisted: true, jsonSaveImportReload: true, lastRemovalStopsPlayback: true, pixels, stoppedPixels };
}

async function verifyStressList() {
  const stress = await page.evaluate((key) => {
    const draft = JSON.parse(localStorage.getItem(key));
    draft.musicVideoScenes[0] = { ...draft.musicVideoScenes[0], elements: Array.from({ length: 240 }, (_, index) => ({
      id: `stress-${index}`, tool: "line", color: "#4285f4", width: 2, motion: index % 2 ? "bounce" : "move-left",
      points: [[60 + index % 20 * 40, 100 + Math.floor(index / 20) * 28, .5],
        [80 + index % 20 * 40, 108 + Math.floor(index / 20) * 28, .5]] })) };
    localStorage.setItem(key, JSON.stringify(draft));
    return draft.musicVideoScenes;
  }, DRAFT_KEY);
  await page.reload();
  await openDrawing();
  const ids = stress[0].elements.map((element) => element.id);
  report.stressLayouts = await verifyListLayout("240", ids);
  await page.getByTestId("scene-assigned-motion-select-stress-239").click();
  await assertSelected(["stress-239"]);
  assert.deepEqual(await savedScenes(), stress);
  await page.getByTestId("scene-remove-element-motion-stress-239").click();
  const lastRemoved = await savedScenes();
  assert.equal(lastRemoved[0].elements.length, 240);
  assert.equal(lastRemoved[0].elements[239].motion, undefined);
  assert.deepEqual(lastRemoved[0].elements.slice(0, 239), stress[0].elements.slice(0, 239));
  await assertRows(ids.slice(0, 239));
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(stress);
  await page.getByRole("button", { name: "그림 다시 실행", exact: true }).click();
  await waitScenes(lastRemoved);
  await page.getByTestId("scene-assigned-motion-select-stress-0").click();
  await page.getByTestId("scene-assigned-motion-select-stress-238").click({ modifiers: ["Shift"] });
  await assertSelected(["stress-0", "stress-238"]);
  await page.getByTestId("scene-remove-selected-motions").click();
  const bulk = await savedScenes();
  assert.equal(bulk[0].elements.length, 240);
  assert.equal(bulk[0].elements[0].motion, undefined);
  assert.equal(bulk[0].elements[238].motion, undefined);
  assert.equal(bulk[0].elements[239].motion, undefined);
  assert.deepEqual(bulk[0].elements.slice(1, 238), stress[0].elements.slice(1, 238));
  assert.deepEqual(bulk[1], stress[1]);
  await assertRows(ids.slice(1, 238));
  report.stress = { objects: 240, lastObjectSelectable: true, lastObjectDeleteUndoRedo: true,
    bulkRemovesOnlyTwoSelected: true, all240DrawingsPreserved: true, remainingMotions: 237 };
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${baseUrl}?start=new`);
  report.assets = await page.locator('script[type="module"][src]').evaluateAll((scripts) => scripts.map((script) => script.src));
  const original = await seedDrawing();
  await page.reload();
  await openDrawing();
  await verifyAssignedWorkflow(original);
  console.log(JSON.stringify({ stage: "assignment-delete-save-two-mp4", success: true, exports: report.exports.length }));
  await verifyStressList();
  assert.deepEqual(report.errors, []);
  report.success = true;
  console.log(JSON.stringify({ success: true, layouts: report.layouts.length, stressLayouts: report.stressLayouts.length,
    workflow: report.workflow, stress: report.stress, exports: report.exports, errors: report.errors }, null, 2));
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
