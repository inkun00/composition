import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import LZString from "lz-string";

// Exercise the built editor with synthetic scores in fresh, isolated contexts.
// This never reads a signed-in profile, user drawings, cloud projects, or the MP4 encoder.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-range-overlap");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const KEY = "maeum-melody:draft:v1";
const report = { startedAt: new Date().toISOString(), baseUrl, isolatedContexts: true,
  syntheticDrawingsOnly: true, stage: "initializing", errors: [], cases: [], layouts: [] };

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
    const local = await readFile(path.join("dist", new URL(asset, baseUrl).pathname.replace(/^\//, "")));
    const sha = (value) => createHash("sha256").update(value).digest("hex");
    assert.equal(sha(bytes), sha(local), `${kind} must match the tested local build`);
    hashes[kind] = sha(bytes);
  }
  report.build = { assets, hashes, matchesLocalBuild: true };
}

function fixture(label, ends = [1, 3, 5, 7]) {
  const words = ["함께그려", "노래따라", "우리마음", "작은세상", "다시이어", "반짝이는", "마지막도", "함께불러"];
  return { version: 1, updatedAt: Date.now() - 1000, projectId: `range-overlap-${label}`, sourceHash: "",
    title: "장면 구간 충돌 브라우저 검증", creator: "검증용 작곡가", originalCreator: "", presetId: "H001",
    songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 128, instrumentId: "piano",
    accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"], lyrics: words, showArrangement: true,
    measures: words.map((word, index) => ({ candidateId: "custom", candidateName: "구간 편집 검증", chords: ["C"],
      notes: Array.from(word, (lyric, note) => ({ id: `range-note-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 4, denominator: word.length } })) })),
    musicVideoScenes: ends.map((endMeasureIndex, index) => ({
      id: `range-scene-${index + 1}`, background: ["#fff8ed", "#eefaff", "#f5efff", "#e7f3ec"][index],
      motion: ["pulse", "float", "snow", "bounce"][index], endLyric: null, endMeasureIndex,
      elements: [{ id: `range-drawing-${index + 1}`, tool: "rectangle", color: ["#ea4335", "#4285f4", "#a142f4", "#34a853"][index],
        width: 8, points: [[120 + index * 80, 160, .3], [300 + index * 80, 340, .8]] }]
    })) };
}

async function setup(label, ends) {
  const draft = fixture(label, ends);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route(/https:\/\/(?:firestore|identitytoolkit|securetoken)\.googleapis\.com\//, (route) => route.abort());
  await context.addInitScript(({ key, draft }) => {
    if (sessionStorage.getItem("range-overlap-seeded")) return;
    localStorage.setItem(key, JSON.stringify(draft));
    sessionStorage.setItem("range-overlap-seeded", "1");
  }, { key: KEY, draft });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ label, message: error.message }));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${baseUrl}?start=new`, { waitUntil: "domcontentloaded" });
  await openStudio(page);
  assert.equal(await page.getByTestId("lost-drawing-recovery-dialog").count(), 0);
  assert.equal(await page.getByTestId("create-music-video").isEnabled(), draft.musicVideoScenes.at(-1).endMeasureIndex === 7,
    "Only a score covered through its final bar may initially allow video creation");
  return { page, context, original: draft.musicVideoScenes };
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
  assert.fail(`${message}; last saved boundaries: ${saved?.map((item) => item.endMeasureIndex).join(", ")}`);
}

async function waitEnds(page, expected) {
  return waitScenes(page, (current) => JSON.stringify(current.map((item) => item.endMeasureIndex)) ===
    JSON.stringify(expected), `Expected boundaries ${expected.join(", ")}`);
}

async function selectSlide(page, number) {
  await page.getByRole("button", { name: `${number}번 장면 선택`, exact: true }).click();
}

async function showSettings(page) {
  const toggle = page.getByRole("button", { name: "장면 설정 보기", exact: true });
  if (await toggle.isVisible()) await toggle.click();
}

async function undo(page, redo = false) {
  await page.locator(".mv-studio").focus();
  await page.keyboard.press(redo ? "Control+Shift+z" : "Control+z");
}

async function setEnd(page, end) {
  await showSettings(page);
  const select = page.getByTestId("scene-end-measure");
  const option = select.locator(`option[value="${end}"]`);
  assert.equal(await option.isEnabled(), true, `Song bar ${end + 1} must remain selectable during conflicts`);
  await select.selectOption(String(end));
}

function assertArtwork(current, original) {
  for (const item of current) {
    const before = original.find((old) => old.id === item.id);
    assert.ok(before, `Existing artwork ${item.id} must retain its identity`);
    assert.deepEqual({ elements: item.elements, motion: item.motion, background: item.background },
      { elements: before.elements, motion: before.motion, background: before.background });
  }
}

async function assertBlocked(page) {
  const warning = page.getByTestId("scene-range-warning");
  await warning.waitFor();
  assert.match(await warning.innerText(), /겹|충돌/);
  assert.equal(await page.getByTestId("create-music-video").isDisabled(), true,
    "Overlapping boundaries must prevent MP4 creation");
  assert.equal(await page.getByTestId("music-video-preview-open").isDisabled(), true,
    "Conflicting scenes must not enter the timed full-song preview");
  assert.equal(await page.getByTestId("confirm-music-video").count(), 0);
  return warning;
}

async function verifySelectableOverlapAndShift() {
  const { page, context, original } = await setup("shift", [1, 3, 4, 5]);
  try {
    report.stage = "choose a currently occupied bar and resolve by shifting following boundaries";
    await selectSlide(page, 2);
    await setEnd(page, 4);
    const overlapping = await waitEnds(page, [1, 4, 4, 5]);
    assert.deepEqual(overlapping.map((item) => item.startMeasureIndex), [0, 2, 4, 5],
      "Changing one scene must retain the other scenes' original start bars");
    assertArtwork(overlapping, original);
    await assertBlocked(page);
    await page.screenshot({ path: path.join(outputDir, "occupied-bar-warning.png") });
    await page.getByTestId("scene-range-shift-forward").click();
    const shifted = await waitEnds(page, [1, 4, 5, 6]);
    assert.deepEqual(shifted.map((item) => item.startMeasureIndex), [0, 2, 5, 6]);
    assertArtwork(shifted, original);
    assert.equal(await page.getByTestId("scene-range-conflict-row").count(), 0,
      "Shifting must resolve the actual overlap even while final-bar coverage still needs editing");
    assert.equal(await page.getByTestId("create-music-video").isDisabled(), true,
      "Resolving overlap must not disguise a still-uncovered final score bar");
    await undo(page);
    await waitEnds(page, [1, 4, 4, 5]);
    await assertBlocked(page);
    await undo(page, true);
    await waitEnds(page, [1, 4, 5, 6]);
    await selectSlide(page, 4);
    await setEnd(page, 7);
    await waitEnds(page, [1, 4, 5, 7]);
    assert.equal(await page.getByTestId("create-music-video").isEnabled(), true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await openStudio(page);
    assertArtwork(await waitEnds(page, [1, 4, 5, 7]), original);
    assert.equal(await page.getByTestId("create-music-video").isEnabled(), true);
    report.cases.push({ name: "occupied-bar selection is saved, warned and blocked; shift preserves drawings and supports undo, redo and reload" });
  } finally { await context.close(); }
}

async function verifyBackwardSelection() {
  const { page, context, original } = await setup("backward");
  try {
    report.stage = "select an earlier occupied start bar and undo the resulting overlap";
    await selectSlide(page, 2);
    await showSettings(page);
    const select = page.getByTestId("scene-start-measure");
    assert.equal(await select.locator('option[value="1"]').isEnabled(), true);
    await select.selectOption("1");
    const overlapping = await waitScenes(page, (current) => current[1].startMeasureIndex === 1,
      "The earlier occupied start bar must be saved");
    assert.deepEqual(overlapping.map((item) => item.endMeasureIndex), [1, 3, 5, 7]);
    assert.deepEqual(overlapping.map((item) => item.startMeasureIndex), [0, 1, 4, 6]);
    assertArtwork(overlapping, original);
    await assertBlocked(page);
    await undo(page);
    await waitScenes(page, (current) => current.every((item) => item.startMeasureIndex === undefined),
      "Undo must restore the complete original range schema");
    assert.equal(await page.getByTestId("create-music-video").isEnabled(), true);
    report.cases.push({ name: "an occupied earlier start remains selectable; only the chosen start changes and undo restores the complete valid score" });
  } finally { await context.close(); }
}

async function verifyOverflowAndDelete() {
  const { page, context, original } = await setup("overflow");
  try {
    report.stage = "explain insufficient song bars without clipping or deleting authored scenes";
    await selectSlide(page, 2);
    await setEnd(page, 5);
    const overlapping = await waitEnds(page, [1, 5, 5, 7]);
    assert.deepEqual(overlapping.map((item) => item.startMeasureIndex), [0, 2, 4, 6]);
    const warning = await assertBlocked(page);
    assert.match(await warning.innerText(), /부족|넘|마지막|늘|줄|삭제/);
    const shift = page.getByTestId("scene-range-shift-forward");
    assert.equal(await shift.isDisabled(), true, "A shift beyond the score must be unavailable");
    assertArtwork(overlapping, original);
    await page.reload({ waitUntil: "domcontentloaded" });
    await openStudio(page);
    await assertBlocked(page);
    await waitEnds(page, [1, 5, 5, 7]);
    await page.screenshot({ path: path.join(outputDir, "insufficient-song-bars.png") });
    report.cases.push({ name: "overflow guidance explains manual repair, retains conflicting edits after reload, and never truncates or silently deletes drawings" });

    report.stage = "select a conflict, delete an unnecessary slide, and undo the complete removal";
    await page.getByRole("button", { name: "겹친 장면 3 선택", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "3번 장면 선택", exact: true }).getAttribute("aria-pressed"), "true");
    await page.getByTestId("delete-storyboard-scene").click();
    const removed = await waitScenes(page, (current) => current.length === 3, "Conflict deletion was not saved");
    assert.deepEqual(removed.map((item) => item.id), ["range-scene-1", "range-scene-2", "range-scene-4"]);
    assertArtwork(removed, original);
    assert.equal(await page.getByTestId("create-music-video").isEnabled(), true);
    await undo(page);
    const restored = await waitEnds(page, [1, 5, 5, 7]);
    assertArtwork(restored, original);
    await assertBlocked(page);
    report.cases.push({ name: "warning selects the conflicting slide for explicit deletion; deletion restores a valid score and undo restores the complete drawing and warning" });

    report.stage = "keep overlap guidance and repair actions within a narrow mobile inspector";
    await page.setViewportSize({ width: 375, height: 667 });
    await page.getByRole("button", { name: "겹친 장면 3 선택", exact: true }).click();
    await page.waitForFunction(() => {
      const workspace = document.querySelector(".mv-workspace")?.getBoundingClientRect();
      const start = document.querySelector('[data-testid="scene-start-measure"]')?.getBoundingClientRect();
      const end = document.querySelector('[data-testid="scene-end-measure"]')?.getBoundingClientRect();
      return workspace && start && end && start.top >= workspace.top && end.bottom <= workspace.bottom;
    });
    const mobileWarning = await assertBlocked(page);
    await mobileWarning.scrollIntoViewIfNeeded();
    const box = await mobileWarning.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 376, "Mobile warning must fit the viewport");
    const layout = await page.evaluate(() => {
      const box = (selector) => {
        const bounds = document.querySelector(selector)?.getBoundingClientRect();
        return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
      };
      return { width: window.innerWidth, height: window.innerHeight,
        documentWidth: document.documentElement.scrollWidth, studio: box(".mv-studio"),
        workspace: box(".mv-workspace"), footer: box(".mv-footer"), warning: box(".mv-range-warning"),
        startControl: box('[data-testid="scene-start-measure"]'), endControl: box('[data-testid="scene-end-measure"]') };
    });
    assert.ok(layout.documentWidth <= layout.width + 1, "The modal must not cause horizontal page overflow");
    assert.ok(layout.footer && layout.footer.y >= 0 && layout.footer.y + layout.footer.height <= layout.height + 1,
      "The overlap warning must leave the export and preview footer within the mobile viewport");
    assert.ok(layout.workspace && layout.workspace.height >= 120,
      "Mobile overlap guidance must leave enough inspector space to edit the scene start and end bars");
    report.layouts.push(layout);
    await page.screenshot({ path: path.join(outputDir, "mobile-overlap-guidance.png") });
    report.cases.push({ name: "mobile conflict selection reveals both range controls; guidance and footer fit the viewport while export remains blocked" });
  } finally { await context.close(); }
}

try {
  if (process.env.VERIFY_BUILD_HASHES !== "0") await verifyBuildHashes();
  await verifySelectableOverlapAndShift();
  await verifyBackwardSelection();
  await verifyOverflowAndDelete();
  assert.deepEqual(report.errors, [], "Range conflict editing must not cause uncaught application errors");
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
