import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { seekAssignedPreview, captureAssignedPreview } from "./scene-assigned-motion-media.mjs";

// Focused actual built-app regression. Build/freeze first; APP_URL runs the
// identical group/save/delete workflow on production. No APIs are replaced.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-grouped-motions");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const KEY = "maeum-melody:draft:v1";
const A_IDS = ["red-frame", "blue-circle", "green-line"];
const B_IDS = ["gold-frame", "purple-circle"];
const report = { startedAt: new Date().toISOString(), baseUrl, errors: [], downloads: [], layouts: [] };
let page;

async function seedFixture() {
  return page.evaluate((key) => {
    const words = ["함께움직여", "그룹을골라", "그림은그대", "동작만지워", "다시불러와", "음악을따라", "우리의그림", "끝까지함께"];
    const measures = words.map((word, index) => ({ candidateId: "custom", candidateName: "그룹 동작 검증", chords: ["C"],
      notes: Array.from(word, (lyric, note) => ({ id: `group-note-${index}-${note}`, pitch: 60,
        lyric, duration: { numerator: 4, denominator: word.length } })) }));
    const scenes = [{ id: "group-first", background: "#fff8ed", motion: "still", endLyric: null, endMeasureIndex: 3, elements: [
      { id: "red-frame", tool: "rectangle", color: "#ea4335", width: 10, points: [[100, 100, .5], [220, 240, .5]] },
      { id: "blue-circle", tool: "ellipse", color: "#4285f4", width: 10, points: [[350, 100, .5], [510, 240, .5]] },
      { id: "green-line", tool: "line", color: "#34a853", width: 12, points: [[640, 180, .5], [760, 180, .5]] },
      { id: "gold-frame", tool: "rectangle", color: "#fbbc04", width: 10, points: [[140, 300, .5], [260, 420, .5]] },
      { id: "purple-circle", tool: "ellipse", color: "#a142f4", width: 10, points: [[350, 300, .5], [510, 440, .5]] }
    ] }, { id: "group-legacy", background: "#ffffff", motion: "still", endLyric: null, endMeasureIndex: 7, elements: [
      { id: "legacy-left", tool: "rectangle", color: "#4285f4", width: 10, motion: "float", points: [[200, 180, .5], [340, 330, .5]] },
      { id: "legacy-right", tool: "ellipse", color: "#ea4335", width: 10, motion: "float", points: [[600, 180, .5], [740, 330, .5]] }
    ] }];
    localStorage.setItem(key, JSON.stringify({ version: 1, updatedAt: Date.now(), sourceHash: "", title: "모아 고르고 한 번에 지우기",
      creator: "실제 브라우저 검증", originalCreator: "", presetId: "H001", songLength: 8,
      meter: { beats: 4, beatUnit: 4 }, instrumentId: "piano", accompanimentStyleId: "arpeggio",
      accompanimentInstrumentIds: ["piano"], bpm: 180, lyrics: words, measures, showArrangement: true, musicVideoScenes: scenes }));
    return scenes;
  }, KEY);
}

async function scenes() {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).musicVideoScenes, KEY);
}

async function waitScenes(expected) {
  await page.waitForFunction(({ key, expected }) => JSON.stringify(JSON.parse(localStorage.getItem(key)).musicVideoScenes) ===
    JSON.stringify(expected), { key: KEY, expected });
}

async function openStudio() {
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-assigned-motions").waitFor({ state: "attached" });
}

async function showPanel(name) {
  const button = page.getByRole("button", { name, exact: true });
  if (await button.isVisible()) await button.click();
}

async function assertSelected(expected) {
  await page.waitForFunction((expected) => JSON.stringify([...document.querySelectorAll(
    '[data-testid="scene-selection-outline"] [data-element-id]')].map((element) => element.dataset.elementId)) === JSON.stringify(expected), expected);
}

async function selectCanvasObjects(points, ids) {
  await showPanel("그림판 보기");
  await page.getByTestId("scene-select-tool").click();
  const box = await page.getByTestId("scene-paint-canvas").boundingBox();
  assert.ok(box);
  for (const [index, [x, y]] of points.entries()) {
    if (index) await page.keyboard.down("Shift");
    await page.mouse.click(box.x + x / 960 * box.width, box.y + y / 540 * box.height);
    if (index) await page.keyboard.up("Shift");
  }
  await assertSelected(ids);
}

async function applyPulse(ids) {
  await showPanel("장면 설정 보기");
  await page.getByTestId("scene-motion-category-atmosphere").click();
  await page.getByTestId("scene-motion-preset-pulse").click();
  await page.waitForFunction(({ key, ids }) => JSON.parse(localStorage.getItem(key)).musicVideoScenes[0].elements
    .filter((element) => ids.includes(element.id)).every((element) => element.motion === "pulse" && element.motionGroupId), { key: KEY, ids });
  const elements = (await scenes())[0].elements.filter((element) => ids.includes(element.id));
  const groupId = elements[0].motionGroupId;
  assert.equal(typeof groupId, "string");
  assert.equal(new Set(elements.map((element) => element.motionGroupId)).size, 1);
  return groupId;
}

async function rows() {
  return page.getByTestId("scene-assigned-motion-row").evaluateAll((items) => items.map((item) => ({
    id: item.dataset.motionGroupId, ids: JSON.parse(item.dataset.elementIds), text: item.innerText,
    selected: item.querySelector(".mv-assigned-select")?.getAttribute("aria-pressed")
  })));
}

async function assertGroupRows(expected) {
  const current = await rows();
  assert.deepEqual(current.map(({ id, ids }) => ({ id, ids })), expected);
  for (const row of current) if (row.ids.length > 1) assert.match(row.text, new RegExp(`개체\\s*${row.ids.length}개`));
  return current;
}

function assertArtworkAndOtherScene(current, original) {
  const artwork = (scene) => scene.elements.map(({ motion, motionGroupId, ...element }) => element);
  assert.deepEqual(artwork(current[0]), artwork(original[0]));
  assert.equal(current[0].background, original[0].background);
  assert.equal(current[0].endMeasureIndex, original[0].endMeasureIndex);
  assert.deepEqual(current[1], original[1]);
}

async function snapshotLayout(name, expected) {
  const checks = [];
  for (const [width, height] of [[1440, 900], [375, 667]]) {
    await page.setViewportSize({ width, height });
    await showPanel("장면 설정 보기");
    await page.getByTestId("scene-assigned-motions").scrollIntoViewIfNeeded();
    await assertGroupRows(expected);
    for (const { id } of expected) {
      const remove = page.getByTestId(`scene-remove-element-motion-${id}`);
      await remove.click({ trial: true });
      const box = await remove.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= -1 && box.x + box.width <= width + 1);
      assert.ok(box.y >= -1 && box.y + box.height <= height + 1);
    }
    assert.equal(await page.locator(".mv-studio").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
    await page.screenshot({ path: path.join(outputDir, `groups-${name}-${width}.png`) });
    checks.push({ width, height, groupedRows: expected.length, deleteTargets44px: true, noHorizontalOverflow: true });
  }
  return checks;
}

async function saveScene(name, expected) {
  const download = page.waitForEvent("download");
  await page.getByTestId("scene-save").click();
  const file = path.join(outputDir, name);
  await (await download).saveAs(file);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")).scene, expected);
  return file;
}

async function verifyDeletedPixels() {
  await seekAssignedPreview(page, 0, "group-static-zero");
  await captureAssignedPreview(page, outputDir, "groups-deleted-motion-start.png");
  await seekAssignedPreview(page, 1 / 6, "group-static-halfbeat");
  await captureAssignedPreview(page, outputDir, "groups-deleted-motion-halfbeat.png");
  const result = await page.evaluate(() => {
    const a = window.__assignedFrames["group-static-zero"], b = window.__assignedFrames["group-static-halfbeat"];
    const regions = { deletedGroup: [85, 110, 1060, 355], remainingGroup: [130, 375, 760, 605] };
    return Object.fromEntries(Object.entries(regions).map(([name, [left, top, right, bottom]]) => {
      let exactChanged = 0, changed = 0;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const index = (y * 1280 + x) * 4;
        const delta = Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
        if (delta) exactChanged++;
        if (delta > 90) changed++;
      }
      return [name, { exactChanged, changed }];
    }));
  });
  assert.equal(result.deletedGroup.exactChanged, 0, "All three deleted group effects must stop, keeping the drawing visible");
  assert.ok(result.remainingGroup.changed > 150, "The separate group with the same effect must keep animating");
  return result;
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, acceptDownloads: true });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("download", (download) => report.downloads.push(download.suggestedFilename()));
  await page.goto(`${baseUrl}?start=new`);
  report.bundle = await page.locator('script[type="module"][src]').evaluateAll((items) => items.map((item) => item.src));
  const original = await seedFixture();
  await page.reload();
  await openStudio();
  report.stage = "create two separate groups with the same effect";
  await assertGroupRows([]);
  await selectCanvasObjects([[150, 180], [430, 180], [700, 180]], A_IDS);
  const groupA = await applyPulse(A_IDS);
  await assertGroupRows([{ id: groupA, ids: A_IDS }]);
  await selectCanvasObjects([[200, 370], [430, 370]], B_IDS);
  const groupB = await applyPulse(B_IDS);
  assert.notEqual(groupA, groupB, "Separate applications of the same preset must retain separate groups");
  const expectedGroups = [{ id: groupA, ids: A_IDS }, { id: groupB, ids: B_IDS }];
  await assertGroupRows(expectedGroups);
  const grouped = await scenes();
  assertArtworkAndOtherScene(grouped, original);
  const groupedFile = await saveScene("two-separate-motion-groups.scene.json", grouped[0]);
  const selectA = page.getByTestId(`scene-assigned-motion-select-${groupA}`);
  await selectA.click();
  await assertSelected(A_IDS);
  assert.equal(await selectA.getAttribute("aria-pressed"), "true");
  assert.deepEqual(await scenes(), grouped, "Selecting a group must not commit a draft change");
  report.layouts.push(...await snapshotLayout("two-groups", expectedGroups));
  report.stage = "atomic group removal, undo and redo";
  await page.getByTestId(`scene-remove-element-motion-${groupA}`).click();
  const removed = await scenes();
  for (const element of removed[0].elements.slice(0, 3)) {
    assert.equal(element.motion, undefined);
    assert.equal(element.motionGroupId, undefined);
  }
  assert.deepEqual(removed[0].elements.slice(3), grouped[0].elements.slice(3));
  assertArtworkAndOtherScene(removed, original);
  await assertGroupRows([{ id: groupB, ids: B_IDS }]);
  await page.waitForFunction((id) => document.activeElement?.dataset.testid === `scene-remove-element-motion-${id}`, groupB);
  await page.keyboard.press("Control+z");
  await waitScenes(grouped);
  await assertGroupRows(expectedGroups);
  await page.keyboard.press("Control+Shift+z");
  await waitScenes(removed);
  await assertGroupRows([{ id: groupB, ids: B_IDS }]);
  report.stage = "JSON import and draft reload preserve group identity";
  await page.getByTestId("scene-import-file").setInputFiles(groupedFile);
  await waitScenes(grouped);
  await page.reload();
  await openStudio();
  await showPanel("장면 설정 보기");
  await assertGroupRows(expectedGroups);
  await page.getByTestId(`scene-assigned-motion-select-${groupA}`).click();
  await assertSelected(A_IDS);
  await page.getByTestId(`scene-remove-element-motion-${groupA}`).click();
  await waitScenes(removed);
  const removedFile = await saveScene("three-effects-removed.scene.json", removed[0]);
  await page.getByTestId("scene-reset").click();
  await page.getByTestId("scene-import-file").setInputFiles(removedFile);
  await waitScenes(removed);
  await page.reload();
  await openStudio();
  await showPanel("장면 설정 보기");
  await assertGroupRows([{ id: groupB, ids: B_IDS }]);
  report.layouts.push(...await snapshotLayout("after-delete-reload", [{ id: groupB, ids: B_IDS }]));
  report.pixels = await verifyDeletedPixels();
  report.stage = "legacy same-motion objects form one selectable removable group";
  await page.getByRole("button", { name: "2번 장면 선택", exact: true }).click();
  const legacy = await rows();
  assert.equal(legacy.length, 1);
  assert.deepEqual(legacy[0].ids, ["legacy-left", "legacy-right"]);
  assert.match(legacy[0].text, /개체\s*2개/);
  await page.getByTestId(`scene-assigned-motion-select-${legacy[0].id}`).click();
  await assertSelected(["legacy-left", "legacy-right"]);
  await page.screenshot({ path: path.join(outputDir, "groups-legacy-375.png") });
  await page.getByTestId(`scene-remove-element-motion-${legacy[0].id}`).click();
  await assertGroupRows([]);
  const legacyRemoved = await scenes();
  assert.deepEqual(legacyRemoved[0], removed[0]);
  assert.equal(legacyRemoved[1].elements.length, 2);
  assert.deepEqual(legacyRemoved[1].elements.map(({ motion, motionGroupId, ...element }) => element),
    original[1].elements.map(({ motion, ...element }) => element));
  assert.ok(legacyRemoved[1].elements.every((element) => element.motion === undefined && element.motionGroupId === undefined));
  await page.waitForFunction(() => document.querySelector('[data-testid="scene-assigned-motions"] h5') === document.activeElement);
  await showPanel("그림판 보기");
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(removed);
  assert.deepEqual(report.errors, []);
  assert.ok(report.downloads.every((name) => name.endsWith(".scene.json")), "This focused QA must not encode or download MP4");
  report.groups = { first: groupA, second: groupB, sizes: [3, 2], sameEffectStaysSeparate: true,
    rowSelectsAllMembersWithoutCommit: true, atomicDeleteUndoRedo: true, originalDrawingAndOtherScenePreserved: true,
    jsonAndDraftRoundtrip: true, deletionPersists: true, legacyGroupedSelectAndDelete: true, deleteFocusRestored: true };
  report.stage = "complete";
  report.success = true;
  console.log(JSON.stringify({ success: true, groups: report.groups, layouts: report.layouts, pixels: report.pixels, errors: report.errors }, null, 2));
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
