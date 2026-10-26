import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import LZString from "lz-string";

// Built-app regression with synthetic drawings in fresh private browser contexts.
// No signed-in profile, cloud account, user projects or MP4 encoder is accessed.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-slide-editing");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const KEY = "maeum-melody:draft:v1";
const A_IDS = ["a-frame", "a-line"];
const report = { startedAt: new Date().toISOString(), baseUrl, isolatedContexts: true,
  stage: "initializing", errors: [], cases: [], layouts: [] };

async function verifyBuildHashes() {
  const response = await fetch(baseUrl, { cache: "no-store" });
  assert.equal(response.status, 200);
  const html = await response.text();
  const assets = { javascript: /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html)?.[1],
    stylesheet: /href="([^"]*\/assets\/index-[^"]+\.css)"/.exec(html)?.[1] };
  const hashes = {};
  for (const [kind, asset] of Object.entries(assets)) {
    assert.ok(asset, `${kind} entry must exist`);
    const deployed = await fetch(new URL(asset, baseUrl), { cache: "no-store" });
    assert.equal(deployed.status, 200);
    const bytes = Buffer.from(await deployed.arrayBuffer());
    const local = await readFile(path.join("dist", new URL(asset, baseUrl).pathname));
    const sha = (value) => createHash("sha256").update(value).digest("hex");
    assert.equal(sha(bytes), sha(local), `${kind} must match the tested local build`);
    hashes[kind] = sha(bytes);
  }
  report.build = { assets, hashes, matchesLocalBuild: true };
}

function fixture(label) {
  const words = ["우리그림", "함께움직", "노래따라", "반짝이는", "작은마음", "이어붙여", "함께불러", "끝까지가"];
  return { version: 1, updatedAt: Date.now() - 1000, projectId: `slide-editing-${label}`, sourceHash: "",
    title: "장면 편집 실제 브라우저 검증", creator: "검증용 작곡가", originalCreator: "", presetId: "H001",
    songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 128, instrumentId: "piano",
    accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"], lyrics: words, showArrangement: true,
    measures: words.map((word, index) => ({ candidateId: "custom", candidateName: "장면 편집 검증", chords: ["C"],
      notes: Array.from(word, (lyric, note) => ({ id: `slide-note-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 4, denominator: word.length } })) })),
    musicVideoScenes: [
      { id: "scene-a", background: "#fff8ed", motion: "still", endLyric: null, endMeasureIndex: 1, elements: [
        { id: A_IDS[0], tool: "rectangle", color: "#ea4335", width: 10, motion: "pulse", motionGroupId: "source-group",
          points: [[120, 160, .2], [300, 340, .8]] },
        { id: A_IDS[1], tool: "line", color: "#4285f4", width: 12, motion: "pulse", motionGroupId: "source-group",
          points: [[430, 180, .3], [650, 180, .9]] }
      ] },
      { id: "scene-b", background: "#eefaff", motion: "float", endLyric: null, endMeasureIndex: 3, elements: [
        { id: "b-circle", tool: "ellipse", color: "#34a853", width: 8, points: [[700, 300, .5], [850, 440, .7]] }
      ] },
      { id: "scene-c", background: "#f5efff", motion: "snow", endLyric: null, endMeasureIndex: 7, elements: [
        { id: "c-line", tool: "brush", color: "#a142f4", width: 14,
          points: [[120, 400, .2], [260, 350, .6], [380, 410, .9]] }
      ] }
    ] };
}

async function setup(label) {
  const original = fixture(label);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, draft }) => {
    if (sessionStorage.getItem("slide-editing-seeded")) return;
    localStorage.setItem(key, JSON.stringify(draft));
    sessionStorage.setItem("slide-editing-seeded", "1");
  }, { key: KEY, draft: original });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ label, message: error.message }));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${baseUrl}?start=new`, { waitUntil: "domcontentloaded" });
  await openStudio(page);
  assert.equal(await page.getByTestId("lost-drawing-recovery-dialog").count(), 0,
    "The active drawing is already represented and must not trigger an old-record popup");
  return { page, context, original: original.musicVideoScenes };
}

async function openStudio(page) {
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-paint-canvas").waitFor();
}

async function scenes(page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), KEY);
  assert.ok(raw, "The active project must remain durably saved");
  return JSON.parse(raw.startsWith("lz16:") ? LZString.decompressFromUTF16(raw.slice(5)) : raw).musicVideoScenes;
}

async function waitScenes(page, predicate, message) {
  const until = Date.now() + 10_000;
  let saved;
  while (Date.now() < until) {
    saved = await scenes(page);
    if (predicate(saved)) return saved;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  assert.fail(`${message}; last saved scene IDs: ${saved?.map((item) => item.id).join(", ")}`);
}

function same(value, expected) { return JSON.stringify(value) === JSON.stringify(expected); }
async function waitExact(page, expected) {
  return waitScenes(page, (current) => same(current, expected), "Saved drawings did not match the expected edit");
}
async function selectSlide(page, number) {
  await page.getByRole("button", { name: `${number}번 장면 선택`, exact: true }).click();
}
async function showPanel(page, name) {
  const tab = page.getByRole("button", { name, exact: true });
  if (await tab.isVisible()) await tab.click();
}

function assertSequence(current, originalIds = []) {
  const ends = current.filter((item) => item.section !== "intro").map((item) => item.endMeasureIndex);
  assert.equal(ends.at(-1), 7, "The last song bar must remain covered");
  assert.ok(ends.every((end, index) => Number.isInteger(end) && end >= 0 && (!index || end > ends[index - 1])),
    "Scene ranges must consist of strictly ordered whole song bars");
  if (originalIds.length) assert.deepEqual(current.filter((item) => originalIds.includes(item.id)).map((item) => item.id), originalIds);
}

function assertOriginalArtwork(current, original) {
  for (const old of original) {
    const retained = current.find((item) => item.id === old.id);
    assert.ok(retained, `Original scene ${old.id} must remain`);
    assert.equal(retained.background, old.background);
    assert.equal(retained.motion, old.motion);
    assert.deepEqual(retained.elements, old.elements);
  }
}

async function verifyInsertionsAndHistory() {
  const { page, context, original } = await setup("insert");
  try {
    report.stage = "insert before a middle scene and preserve authored drawings";
    await selectSlide(page, 2);
    await page.getByTestId("insert-music-video-scene-before").click();
    const before = await waitScenes(page, (current) => current.length === 4, "Middle insertion before was not saved");
    assert.deepEqual(before.filter((item) => ["scene-a", "scene-b", "scene-c"].includes(item.id)).map((item) => item.id),
      ["scene-a", "scene-b", "scene-c"]);
    assert.equal(before[0].id, "scene-a");
    assert.equal(before[2].id, "scene-b");
    assert.equal(before[1].elements.length, 0);
    assert.equal(await page.getByRole("button", { name: "2번 장면 선택", exact: true }).getAttribute("aria-pressed"), "true");
    assertSequence(before, original.map((item) => item.id));
    assertOriginalArtwork(before, original);
    await page.keyboard.press("Control+z");
    await waitExact(page, original);
    await page.keyboard.press("Control+Shift+z");
    await waitExact(page, before);
    await page.getByTestId("delete-storyboard-scene").click();
    await waitExact(page, original);
    await page.keyboard.press("Control+z");
    await waitExact(page, before);
    await page.keyboard.press("Control+Shift+z");
    await waitExact(page, original);
    report.cases.push({ name: "middle-before insertion keeps original drawings, selects a blank slide, and supports atomic delete/undo/redo" });

    report.stage = "insert after a middle scene";
    await selectSlide(page, 2);
    await page.getByTestId("insert-music-video-scene-after").click();
    const after = await waitScenes(page, (current) => current.length === 4, "Middle insertion after was not saved");
    assert.equal(after[1].id, "scene-b");
    assert.equal(after[3].id, "scene-c");
    assert.equal(after[2].elements.length, 0);
    assertSequence(after, original.map((item) => item.id));
    assertOriginalArtwork(after, original);
    await page.screenshot({ path: path.join(outputDir, "middle-slide-inserted.png") });
    await page.reload({ waitUntil: "domcontentloaded" });
    await openStudio(page);
    await waitExact(page, after);
    report.cases.push({ name: "middle-after insertion preserves ordering and last bar, and survives reload" });
  } finally { await context.close(); }
}

async function verifyTailDeletion() {
  const { page, context, original } = await setup("delete");
  try {
    report.stage = "delete the tail and protect the last normal slide";
    await selectSlide(page, 3);
    await page.getByTestId("delete-storyboard-scene").click();
    const removed = await waitScenes(page, (current) => current.length === 2, "Tail deletion was not saved");
    assert.deepEqual(removed.map((item) => item.id), ["scene-a", "scene-b"]);
    assert.equal(removed[1].endMeasureIndex, 7);
    assert.deepEqual(removed[1].elements, original[1].elements);
    await page.keyboard.press("Control+z");
    await waitExact(page, original);
    await page.keyboard.press("Control+Shift+z");
    await waitExact(page, removed);
    await selectSlide(page, 2);
    await page.getByTestId("delete-storyboard-scene").click();
    const last = await waitScenes(page, (current) => current.length === 1, "Second deletion was not saved");
    assert.equal(last[0].id, "scene-a");
    assert.equal(last[0].endMeasureIndex, 7);
    assert.deepEqual(last[0].elements, original[0].elements);
    assert.equal(await page.getByTestId("delete-storyboard-scene").isDisabled(), true);
    assertSequence(last);
    await page.screenshot({ path: path.join(outputDir, "last-normal-slide-protected.png") });
    report.cases.push({ name: "tail deletion transfers the final bar, undo/redo restores drawings, and the final normal slide cannot be removed" });
  } finally { await context.close(); }
}

async function assertSelected(page, expected) {
  await page.waitForFunction((expected) => JSON.stringify([...document.querySelectorAll(
    '[data-testid="scene-selection-outline"] [data-element-id]')].map((element) => element.dataset.elementId)) ===
    JSON.stringify(expected), expected);
}

async function selectSourceObjects(page) {
  await showPanel(page, "그림판 보기");
  await page.getByTestId("scene-select-tool").click();
  const box = await page.getByTestId("scene-paint-canvas").boundingBox();
  assert.ok(box);
  await page.mouse.click(box.x + 210 / 960 * box.width, box.y + 240 / 540 * box.height);
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + 540 / 960 * box.width, box.y + 180 / 540 * box.height);
  await page.keyboard.up("Shift");
  await assertSelected(page, A_IDS);
}

function assertPastedElements(pasted, source, previousGroup) {
  assert.equal(pasted.length, source.length);
  const dx = pasted[0].points[0][0] - source[0].points[0][0];
  const dy = pasted[0].points[0][1] - source[0].points[0][1];
  assert.ok(Math.abs(dx) <= 128 && Math.abs(dy) <= 128, "Pasted objects use a small shared translation");
  assert.equal(new Set(pasted.map((item) => item.id)).size, pasted.length);
  for (const [index, item] of pasted.entries()) {
    const old = source[index];
    assert.notEqual(item.id, old.id);
    assert.deepEqual([item.tool, item.color, item.width, item.motion], [old.tool, old.color, old.width, old.motion]);
    assert.deepEqual(item.points, old.points.map(([x, y, pressure]) => [x + dx, y + dy, pressure]));
    assert.ok(item.points.every(([x, y]) => x >= 0 && x <= 960 && y >= 0 && y <= 540));
    assert.equal(item.motionGroupId, pasted[0].motionGroupId);
  }
  assert.equal(typeof pasted[0].motionGroupId, "string");
  assert.notEqual(pasted[0].motionGroupId, "source-group");
  if (previousGroup) assert.notEqual(pasted[0].motionGroupId, previousGroup);
}

async function snapshotLayouts(page) {
  for (const [width, height] of [[1440, 900], [375, 667]]) {
    await page.setViewportSize({ width, height });
    await showPanel(page, "그림판 보기");
    const buttonIds = ["insert-music-video-scene-before", "insert-music-video-scene-after", "delete-storyboard-scene",
      "scene-copy-elements", "scene-paste-elements"];
    for (const id of buttonIds) {
      const button = page.getByTestId(id);
      await button.click({ trial: true });
      const box = await button.boundingBox();
      assert.ok(box && box.width >= 24 && box.height >= 24, `${id} must provide an accessible click target`);
      assert.ok(box.x >= -1 && box.x + box.width <= width + 1, `${id} must fit horizontally at ${width}px`);
      assert.ok(box.y >= -1 && box.y + box.height <= height + 1, `${id} must remain visible at ${height}px height`);
    }
    const canvas = await page.getByTestId("scene-paint-canvas").boundingBox();
    assert.ok(canvas);
    if (width <= 820) {
      assert.ok(canvas.width >= 250 && canvas.height >= 140,
        `The mobile canvas must remain usable, received ${canvas.width.toFixed(1)}×${canvas.height.toFixed(1)}`);
      const more = page.getByRole("button", { name: "장면 옵션", exact: true });
      await more.click();
      assert.equal(await page.getByTestId("scene-save").isVisible(), true);
      assert.equal(await page.getByTestId("scene-reset").isVisible(), true);
      assert.equal(await page.getByRole("button", { name: "이전 그림 찾기", exact: true }).isVisible(), true);
      await page.screenshot({ path: path.join(outputDir, `scene-options-open-${width}.png`) });
      await page.keyboard.press("Escape");
      await page.getByTestId("scene-save").waitFor({ state: "hidden" });
      assert.equal(await more.evaluate((element) => element === document.activeElement), true,
        "Closing scene options with Escape must restore focus to its trigger");
      assert.equal(await page.getByTestId("scene-paint-canvas").isVisible(), true,
        "Escape must close only the options popup, retaining the studio");
    }
    for (const selector of [".mv-studio", ".mv-scene-toolbar", ".mv-storyboard-heading"]) {
      assert.equal(await page.locator(selector).evaluate((element) => element.scrollWidth > element.clientWidth + 1), false,
        `${selector} must not overflow horizontally at ${width}px`);
    }
    await page.screenshot({ path: path.join(outputDir, `clipboard-and-slide-controls-${width}.png`) });
    report.layouts.push({ width, height, canvas: { width: canvas.width, height: canvas.height },
      buttonsAccessible: true, noHorizontalOverflow: true,
      ...(width <= 820 ? { sceneOptionsAccessible: true, sceneOptionsEscapeFocus: true } : {}) });
  }
}

async function verifyCrossSlideClipboard() {
  const { page, context, original } = await setup("clipboard");
  try {
    report.stage = "copy selected objects with Shift and paste into a different scene with Ctrl+V";
    await selectSourceObjects(page);
    await page.getByTestId("scene-copy-elements").click();
    assert.deepEqual(await scenes(page), original, "Copy and selection must not mutate the project");
    await selectSlide(page, 2);
    await assertSelected(page, []);
    assert.equal(await page.getByTestId("scene-paste-elements").isEnabled(), true);
    await page.keyboard.press("Control+v");
    const pastedOnce = await waitScenes(page, (current) => current[1].elements.length === 3, "Cross-slide Ctrl+V was not saved");
    assert.deepEqual(pastedOnce[0], original[0]);
    assert.deepEqual(pastedOnce[2], original[2]);
    assert.equal(pastedOnce[1].motion, original[1].motion);
    assert.equal(pastedOnce[1].background, original[1].background);
    assert.deepEqual(pastedOnce[1].elements[0], original[1].elements[0]);
    const firstCopy = pastedOnce[1].elements.slice(1);
    assertPastedElements(firstCopy, original[0].elements);
    await assertSelected(page, firstCopy.map((item) => item.id));
    await page.keyboard.press("Control+a");
    await assertSelected(page, pastedOnce[1].elements.map((item) => item.id));
    await page.getByTestId("scene-clear-selection").click();
    await assertSelected(page, []);
    assert.equal(await page.getByTestId("scene-paste-elements").isEnabled(), true);
    await page.getByTestId("scene-paste-elements").click();
    const twice = await waitScenes(page, (current) => current[1].elements.length === 5, "Repeated button paste was not saved");
    const secondCopy = twice[1].elements.slice(3);
    assertPastedElements(secondCopy, original[0].elements, firstCopy[0].motionGroupId);
    assert.equal(new Set(twice[1].elements.map((item) => item.id)).size, 5);
    await assertSelected(page, secondCopy.map((item) => item.id));
    await page.keyboard.press("Control+z");
    await waitExact(page, pastedOnce);
    await page.keyboard.press("Control+Shift+z");
    await waitExact(page, twice);
    report.cases.push({ name: "Shift selection, button copy, cross-slide Ctrl+V, new object/group identities, preserved artwork/motion, clear-selection and repeated paste" });

    report.stage = "copied objects are immediately selectable for a different motion";
    await page.getByTestId("scene-assigned-motion-select-" + secondCopy[0].motionGroupId).click();
    await assertSelected(page, secondCopy.map((item) => item.id));
    await showPanel(page, "장면 설정 보기");
    await page.getByTestId("scene-motion-category-atmosphere").click();
    await page.getByTestId("scene-motion-preset-bounce").click();
    const animated = await waitScenes(page, (current) => current[1].elements.slice(3).every((item) => item.motion === "bounce"),
      "The selected pasted objects did not receive their new motion");
    assert.deepEqual(animated[0], original[0]);
    assert.deepEqual(animated[1].elements.slice(0, 3), twice[1].elements.slice(0, 3));
    report.cases.push({ name: "pasted objects can receive a grouped motion without changing the source or other objects" });

    report.stage = "keyboard copy and button paste into a third slide";
    await selectSlide(page, 1);
    await showPanel(page, "그림판 보기");
    await page.getByTestId("scene-select-tool").click();
    await page.keyboard.press("Control+a");
    await assertSelected(page, A_IDS);
    await page.keyboard.press("Control+c");
    await selectSlide(page, 3);
    await page.getByTestId("scene-paste-elements").click();
    const final = await waitScenes(page, (current) => current[2].elements.length === 3, "Third-slide paste was not saved");
    assert.deepEqual(final[0], original[0]);
    assertPastedElements(final[2].elements.slice(1), original[0].elements);
    await assertSelected(page, final[2].elements.slice(1).map((item) => item.id));
    await snapshotLayouts(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await openStudio(page);
    await waitExact(page, final);
    assert.equal(await page.getByTestId("lost-drawing-recovery-dialog").count(), 0);
    report.cases.push({ name: "Ctrl+A/C and button paste work across a third slide; both responsive layouts and durable reload preserve all drawings" });
  } finally { await context.close(); }
}

try {
  if (process.env.VERIFY_BUILD_HASHES !== "0") await verifyBuildHashes();
  await verifyInsertionsAndHistory();
  await verifyTailDeletion();
  await verifyCrossSlideClipboard();
  assert.deepEqual(report.errors, [], "Scene editing must not cause uncaught application errors");
  report.stage = "complete";
  report.success = true;
} catch (error) {
  report.success = false;
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await server?.close();
}
console.log(JSON.stringify({ success: report.success, stage: report.stage, cases: report.cases.length,
  layouts: report.layouts, errors: report.errors, failure: report.failure, report: path.join(outputDir, "report.json") }, null, 2));
