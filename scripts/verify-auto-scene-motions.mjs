import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import { seekAutoPreview, compareAutoFrames, captureAutoPreview, exportAutoMotionVideo } from "./scene-auto-motion-media.mjs";

// Actual built app only. The expected choices below come from the authored music:
// ascending → up, descending → down, dense repeated notes → pulse, long holds → float.
// No analysis helper, renderer, persistence, or MP4 API is mocked.
// VERIFY_AUTO_MODE=production retains actual UI/pixels/BPM/guards but skips
// re-encoding the two MP4s already checked locally against the same build.
const DRAFT_KEY = "maeum-melody:draft:v1";
const BPM = 90;
const EXPECTED = ["move-up", "move-down", "pulse", "float"];
const LABELS = ["위로 이동", "아래로 이동", "박자에 맞춰 팡팡", "둥실둥실"];
const verificationMode = process.env.VERIFY_AUTO_MODE || "full";
assert.ok(["full", "production", "guards"].includes(verificationMode), "VERIFY_AUTO_MODE must be full, production or guards");
const guardsOnly = verificationMode === "guards";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-auto-motions");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true
});
const report = { startedAt: new Date().toISOString(), baseUrl, mode: verificationMode,
  source: "actual score-based automatic scene motions", errors: [] };
let page;

async function seedFixture() {
  return page.evaluate((key) => {
    const pitches = [[60, 62, 64, 65], [67, 69, 71, 72], [72, 71, 69, 67], [65, 64, 62, 60],
      Array(8).fill(60), Array(8).fill(60), [60], [60]];
    const measures = pitches.map((notes, index) => ({ candidateId: "custom", candidateName: "자동 모션 음악 패턴",
      chords: [index % 2 ? "F" : "C"], notes: notes.map((pitch, noteIndex) => ({ id: `auto-${index}-${noteIndex}`,
        pitch, lyric: "별빛노래를따라서"[noteIndex % 8], duration: { numerator: 4, denominator: notes.length } })) }));
    const papers = ["#fff8ed", "#fce8e6", "#eaf2ff", "#e7f3ec"];
    const scenes = papers.map((background, index) => ({ id: `auto-scene-${index}`, background,
      motion: ["still", "rotate-in", "zoom", "fade"][index], endLyric: null, endMeasureIndex: index * 2 + 1,
      elements: [
        { id: `auto-${index}-frame`, tool: "rectangle", color: "#ea4335", width: 12, motion: "pulse",
          points: [[340, 180, .5], [500, 330, .5]] },
        { id: `auto-${index}-circle`, tool: "ellipse", color: "#4285f4", width: 12, motion: "float",
          points: [[550, 200, .5], [680, 330, .5]] },
        { id: `auto-${index}-line`, tool: "brush", color: "#fbbc04", width: 12,
          points: [[350, 360, .5], [450, 345, .5], [520, 365, .5]] }
      ] }));
    scenes[0].choreography = { version: 1, description: "이전 수동 연출", actors: [{ id: "old-actor", name: "선",
      elementIds: ["auto-0-line"], fixedPoint: [350, 360], movingPoint: [450, 345], endPoint: [520, 365] }],
      actions: [{ id: "old-action", actorId: "old-actor", kind: "jump", startMeasureIndex: 0, startBeat: 0, durationBeats: 2, strength: 1 }] };
    const draft = { version: 1, updatedAt: Date.now(), sourceHash: "", title: "음악을 따라 움직이는 그림", creator: "자동 모션 검증",
      originalCreator: "", presetId: "H001", songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 90,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      lyrics: measures.map((measure) => measure.notes.map((note) => note.lyric).join("")), measures,
      showArrangement: true, musicVideoScenes: scenes };
    localStorage.setItem(key, JSON.stringify(draft));
    return draft;
  }, DRAFT_KEY);
}

async function savedScenes() {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).musicVideoScenes, DRAFT_KEY);
}

async function waitScenes(expected) {
  await page.waitForFunction(({ key, expected }) => JSON.stringify(JSON.parse(localStorage.getItem(key)).musicVideoScenes) ===
    JSON.stringify(expected), { key: DRAFT_KEY, expected });
}

async function openDrawing() {
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-auto-motions").waitFor();
}

async function loadDraft(draft) {
  await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), { key: DRAFT_KEY, draft });
  await page.reload();
  await openDrawing();
}

async function showPanel(label) {
  const button = page.getByRole("button", { name: label, exact: true });
  if (await button.isVisible()) await button.click();
}

async function summaryRows(applied) {
  await showPanel("장면 설정 보기");
  const details = page.getByTestId("scene-auto-motions-summary");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  const rows = [];
  for (let index = 0; index < 4; index++) {
    const row = page.getByTestId(`scene-auto-motion-recommendation-auto-scene-${index}`);
    const status = page.getByTestId(`scene-auto-motion-status-auto-scene-${index}`);
    await row.scrollIntoViewIfNeeded();
    const text = await row.innerText();
    assert.ok(text.includes(LABELS[index]), `Scene ${index + 1} must explain the independently expected ${EXPECTED[index]} choice`);
    assert.ok(text.length > LABELS[index].length + 8, "The recommendation must include a musical reason");
    assert.equal(await status.getAttribute("data-applied"), String(applied));
    rows.push({ scene: index + 1, expected: EXPECTED[index], text, applied });
  }
  return rows;
}

function assertArtworkPreserved(actual, original) {
  assert.equal(actual.length, original.length);
  for (const [index, scene] of actual.entries()) {
    const { motion, choreography, elements, ...other } = scene;
    const { motion: oldMotion, choreography: oldChoreography, elements: oldElements, ...oldOther } = original[index];
    assert.deepEqual(other, oldOther, "Automatic choices must preserve scene IDs, backgrounds, and lyric/measure boundaries");
    assert.deepEqual(elements.map(({ motion, ...element }) => element), oldElements.map(({ motion, ...element }) => element),
      "Automatic choices must preserve every original stroke, shape, width, color, and point");
    assert.equal(choreography, undefined);
    assert.ok(elements.every((element) => element.motion === undefined), "Whole-scene automation must replace previous object effects");
  }
}

async function verifyOneClick(original) {
  report.recommendations = await summaryRows(false);
  await page.getByTestId("scene-auto-motions").click();
  await page.waitForFunction(({ key, expected }) => JSON.stringify(JSON.parse(localStorage.getItem(key)).musicVideoScenes
    .map((scene) => scene.motion)) === JSON.stringify(expected), { key: DRAFT_KEY, expected: EXPECTED });
  const chosen = await savedScenes();
  assertArtworkPreserved(chosen, original);
  report.appliedSummary = await summaryRows(true);
  for (let index = 0; index < 2; index++) {
    if (!await page.getByTestId("scene-auto-motions").isDisabled()) await page.getByTestId("scene-auto-motions").click();
    assert.deepEqual(await savedScenes(), chosen);
  }
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(original);
  assert.equal(await page.getByRole("button", { name: "그림 되돌리기", exact: true }).isDisabled(), true,
    "One undo must restore every scene, even after repeated automatic-button clicks");
  await page.getByRole("button", { name: "그림 다시 실행", exact: true }).click();
  await waitScenes(chosen);
  for (let index = 0; index < 4; index++) {
    const scene = page.getByRole("button", { name: `${index + 1}번 장면 선택`, exact: true });
    await scene.click();
    assert.equal(await scene.locator(".mv-scene-motion-label").innerText(), LABELS[index]);
    assert.equal(await page.getByTestId("scene-motion-selected-label").innerText(), LABELS[index]);
  }
  report.workflow = { oneClickAllFour: true, replacedObjectAndLegacyEffects: true, originalArtworkAndRangesPreserved: true,
    singleUndoRedo: true, repeatedClickNoHistory: true, timelineAndPreviewNames: true };
  return chosen;
}

async function verifyManualAndSave(chosen) {
  await page.getByRole("button", { name: "1번 장면 선택", exact: true }).click();
  await page.getByTestId("scene-motion-scope-whole").click();
  await page.getByTestId("scene-motion-category-atmosphere").click();
  await page.getByTestId("scene-motion-preset-pulse").click();
  const edited = await savedScenes();
  assert.equal(edited[0].motion, "pulse");
  assert.deepEqual(edited.slice(1), chosen.slice(1));
  assert.equal(await page.getByTestId("scene-auto-motion-status-auto-scene-0").getAttribute("data-applied"), "false");
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(chosen);
  await page.getByRole("button", { name: "4번 장면 선택", exact: true }).click();
  await page.getByRole("button", { name: "이 장면 삭제", exact: true }).click();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).musicVideoScenes.length === 3, DRAFT_KEY);
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(chosen);
  await page.getByRole("button", { name: "1번 장면 선택", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByTestId("scene-save").click();
  const filename = path.join(outputDir, "auto-first-scene.scene.json");
  await (await download).saveAs(filename);
  assert.deepEqual(JSON.parse(await readFile(filename, "utf8")).scene, chosen[0]);
  await page.getByTestId("scene-reset").click();
  await page.getByTestId("scene-import-file").setInputFiles(filename);
  await waitScenes(chosen);
  await page.reload();
  await openDrawing();
  assert.deepEqual(await savedScenes(), chosen);
  report.persistence = { manualEditStillWorks: true, deleteUndoStillWorks: true, sceneJsonSaveImport: true, reloadAllFour: true };
}

async function verifyLayouts(chosen) {
  const checks = [];
  for (const [width, height] of [[1440, 900], [390, 844], [375, 667]]) {
    await page.setViewportSize({ width, height });
    await showPanel("그림판 보기");
    await page.locator(".mv-workspace").evaluate((element) => { element.scrollTop = 0; });
    const button = page.getByTestId("scene-auto-motions");
    const box = await button.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1);
    if (!await button.isDisabled()) await button.click({ trial: true });
    const canvas = await page.getByTestId("scene-paint-canvas").boundingBox();
    const workspace = await page.locator(".mv-workspace").boundingBox();
    assert.ok(canvas && workspace);
    const visible = Math.max(0, Math.min(canvas.y + canvas.height, workspace.y + workspace.height) - Math.max(canvas.y, workspace.y));
    assert.ok(visible >= canvas.height - 2, `${width}px automatic button must not cause painting-canvas clipping`);
    if (width === 1440) assert.ok(canvas.width >= 700);
    assert.equal(await page.locator(".mv-studio").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
    await page.screenshot({ path: path.join(outputDir, `auto-layout-${width}-paint.png`) });
    await summaryRows(true);
    await page.screenshot({ path: path.join(outputDir, `auto-layout-${width}-summary.png`) });
    assert.deepEqual(await savedScenes(), chosen);
    checks.push({ width, height, autoButton: box, canvas, visibleCanvasHeight: visible, summaryAllApplied: true, overflow: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  report.layouts = checks;
}

async function verifyPixelsAndBpm(chosen) {
  report.pixels = [];
  for (const index of [0, 1]) {
    await page.getByRole("button", { name: `${index + 1}번 장면 선택`, exact: true }).click();
    const duration = Number(await page.getByLabel("움직임 미리보기 시간", { exact: true }).getAttribute("max"));
    await seekAutoPreview(page, 0, `direction-${index}-start`);
    await captureAutoPreview(page, outputDir, `auto-${EXPECTED[index]}-start.png`);
    await seekAutoPreview(page, duration - .01, `direction-${index}-end`);
    await captureAutoPreview(page, outputDir, `auto-${EXPECTED[index]}-end.png`);
    const pixels = await compareAutoFrames(page, `direction-${index}-start`, `direction-${index}-end`);
    const dy = pixels.bounds[1].centerY - pixels.bounds[0].centerY;
    assert.ok(pixels.changed > 150 && (index === 0 ? dy < -20 : dy > 20));
    assert.ok(Math.abs(pixels.bounds[1].width - pixels.bounds[0].width) <= 2);
    report.pixels.push({ scene: index + 1, motion: EXPECTED[index], duration, dy, pixels });
  }
  const durations = [[], []];
  for (const bpm of [90, 180]) {
    await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
    await page.getByTestId("tempo-number").fill(String(bpm));
    await openDrawing();
    for (const [slot, index] of [0, 2].entries()) {
      await page.getByRole("button", { name: `${index + 1}번 장면 선택`, exact: true }).click();
      await seekAutoPreview(page, 0, "bpm-warm");
      await seekAutoPreview(page, .1, "bpm-warm-small");
      await seekAutoPreview(page, .75 * 60 / bpm, `bpm-${index}-${bpm}`);
      durations[slot].push(Number(await page.getByLabel("움직임 미리보기 시간", { exact: true }).getAttribute("max")));
    }
    assert.deepEqual(await savedScenes(), chosen);
  }
  report.bpm = [];
  for (const [slot, index] of [0, 2].entries()) {
    const pixels = await compareAutoFrames(page, `bpm-${index}-90`, `bpm-${index}-180`);
    assert.equal(pixels.exactChanged, 0, "Stored automatic presets must retain the same musical pose at the same beat after changing BPM");
    assert.ok(Math.abs(durations[slot][0] / durations[slot][1] - 2) < 1e-9);
    report.bpm.push({ scene: index + 1, motion: EXPECTED[index], bpms: [90, 180], beat: .75, durations: durations[slot], pixels });
  }
  await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
  await page.getByTestId("tempo-number").fill(String(BPM));
  await openDrawing();
}

async function verifyGuards(draft) {
  const checks = [];
  for (const kind of ["late-invalid-range", "all-blank"]) {
    const variant = structuredClone(draft);
    // Keep the draft schema valid (<64) while pointing outside this 8-bar score.
    if (kind === "late-invalid-range") variant.musicVideoScenes[3].endMeasureIndex = 31;
    else variant.musicVideoScenes = variant.musicVideoScenes.map(({ choreography, ...scene }) => ({ ...scene, elements: [] }));
    await loadDraft(variant);
    const before = await savedScenes();
    assert.equal(before.length, 4);
    if (kind === "late-invalid-range") assert.equal(before[3].endMeasureIndex, 31);
    assert.equal(await page.getByTestId("scene-auto-motions").isDisabled(), true);
    assert.ok((await page.getByTestId("scene-auto-motions-hint").textContent()).trim().length > 0);
    await page.getByTestId("scene-auto-motions").evaluate((button) => button.click());
    assert.deepEqual(await savedScenes(), before, "An invalid late range must never apply earlier recommendations partially");
    checks.push({ kind, disabledWithReason: true, noPartialMutation: true });
  }
  const blank = structuredClone(draft);
  blank.musicVideoScenes[1].elements = [];
  await loadDraft(blank);
  const blankBefore = await savedScenes();
  await page.getByTestId("scene-auto-motions").click();
  const blankAfter = await savedScenes();
  assert.deepEqual(blankAfter[1], blankBefore[1], "A blank scene must be skipped without changing its metadata or old scene effect");
  assert.deepEqual(blankAfter.filter((scene) => scene.elements.length).map((scene) => scene.motion), ["move-up", "pulse", "float"]);
  checks.push({ kind: "one-blank", blankPreservedExactly: true, otherThreeApplied: true });
  const incomplete = structuredClone(draft);
  incomplete.lyrics = incomplete.lyrics.map(() => "");
  incomplete.measures = incomplete.measures.map((measure) => ({ ...measure, notes: measure.notes.map((note) => ({ ...note, lyric: "" })) }));
  incomplete.measures[0].notes = [incomplete.measures[0].notes[0]];
  await loadDraft(incomplete);
  assert.equal(await page.getByTestId("create-music-video").isDisabled(), true, "This fixture must actually be incomplete for MP4 creation");
  assert.equal(await page.getByTestId("scene-auto-motions").isDisabled(), false);
  await page.getByTestId("scene-auto-motions").click();
  const withoutLyrics = await savedScenes();
  assertArtworkPreserved(withoutLyrics, incomplete.musicVideoScenes);
  assert.notDeepEqual(withoutLyrics.map((scene) => scene.motion), incomplete.musicVideoScenes.map((scene) => scene.motion));
  checks.push({ kind: "no-lyrics-incomplete-score", automaticAllowed: true, wholeArtworkPreserved: true });
  report.guards = checks;
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, acceptDownloads: true });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${baseUrl}?start=new`);
  report.assets = await page.locator('script[type="module"][src]').evaluateAll((scripts) => scripts.map((script) => script.src));
  const draft = await seedFixture();
  await page.reload();
  await openDrawing();
  if (!guardsOnly) {
    const chosen = await verifyOneClick(draft.musicVideoScenes);
    await verifyManualAndSave(chosen);
    await verifyLayouts(chosen);
    await verifyPixelsAndBpm(chosen);
    report.exports = verificationMode === "full" ? [await exportAutoMotionVideo(page, outputDir, true, BPM),
      await exportAutoMotionVideo(page, outputDir, false, BPM)] : [];
    if (verificationMode === "production") report.exportNote = "Encoding skipped; pair this run with deployment hash verification and the local two-MP4 report.";
    assert.deepEqual(await savedScenes(), chosen);
  }
  await verifyGuards(draft);
  assert.deepEqual(report.errors, []);
  report.success = true;
  console.log(JSON.stringify({ success: true, mode: verificationMode, motions: EXPECTED, layouts: report.layouts, workflow: report.workflow,
    guards: report.guards, sameBeatCases: report.bpm?.length, exports: report.exports?.map(({ animated, bytes, checks }) => ({ animated, bytes, checks })),
    errors: report.errors }, null, 2));
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
