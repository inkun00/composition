import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DRAFT_KEY = "maeum-melody:draft:v1";
const REGIONS = {
  selected: [175, 200, 585, 470],
  fixedEllipse: [790, 230, 1080, 490],
  fixedLine: [540, 510, 810, 560]
};

// All input below targets the actual built editor and its actual canvas/encoder.
// The saved draft is private synthetic artwork, never an existing user's work.
export async function verifyPartialSceneMotion({ page, outputDir, savedScenes, waitScenes,
  selectPreset, seekPreview, comparePreview, capturePreview, inspectVideo }) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await page.evaluate((key) => {
    const draft = JSON.parse(localStorage.getItem(key));
    draft.bpm = 180;
    // The brush outline overlaps itself here (nonzero winding 2). Its filled
    // interior must remain clickable even where the centerline tolerance misses.
    const foldedBrush = [];
    for (let index = 0; index <= 80; index++) foldedBrush.push([100 + index * 5, 100, 1]);
    for (let index = 1; index <= 16; index++) foldedBrush.push([500, 100 + index * 4, 1]);
    for (let index = 1; index <= 80; index++) foldedBrush.push([500 - index * 5, 164, 1]);
    const first = { id: "partial-first", background: "#fff8ed", motion: "still", endLyric: null, endMeasureIndex: 3,
      elements: [
        { id: "red-frame", tool: "rectangle", color: "#ea4335", width: 10, points: [[150, 170, .5], [350, 330, .5]] },
        { id: "blue-orbit", tool: "ellipse", color: "#4285f4", width: 10, points: [[610, 190, .5], [790, 350, .5]] },
        { id: "green-line", tool: "line", color: "#34a853", width: 12, points: [[420, 400, .5], [580, 400, .5]] },
        { id: "top-frame", tool: "rectangle", color: "#fbbc04", width: 6, points: [[220, 210, .5], [280, 280, .5]] },
        { id: "folded-brush", tool: "brush", color: "#a142f4", width: 48, points: foldedBrush }
      ] };
    draft.musicVideoScenes = [first, { ...draft.musicVideoScenes[1], motion: "still" }];
    localStorage.setItem(key, JSON.stringify(draft));
    return draft.musicVideoScenes;
  }, DRAFT_KEY);
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  await waitScenes(fixture);
  const result = { source: "actual single-click selection, preview canvas and MP4 encoder", hits: [], exports: [] };

  async function showPanel(label) {
    const tab = page.getByRole("button", { name: label, exact: true });
    if (await tab.isVisible()) await tab.click();
  }

  async function selectAt(x, y, expected, touch = false) {
    await showPanel("그림판 보기");
    const canvas = page.getByTestId("scene-paint-canvas");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box && box.width > 150 && box.height > 80);
    const point = [box.x + x / 960 * box.width, box.y + y / 540 * box.height];
    if (touch) await page.touchscreen.tap(...point);
    else await page.mouse.click(...point);
    await page.waitForFunction((expected) => {
      const ids = [...document.querySelectorAll('[data-testid="scene-selection-outline"] [data-element-id]')]
        .map((element) => element.getAttribute("data-element-id"));
      return JSON.stringify(ids) === JSON.stringify(expected ? [expected] : []);
    }, expected);
    const ids = await page.locator('[data-testid="scene-selection-outline"] [data-element-id]')
      .evaluateAll((items) => items.map((item) => item.getAttribute("data-element-id")));
    assert.deepEqual(ids, expected ? [expected] : []);
    return point;
  }

  async function applyPreset(id) {
    await showPanel("장면 설정 보기");
    if (id !== "still") return selectPreset(id);
    await page.getByTestId("scene-motion-category-atmosphere").click();
    await page.getByTestId("scene-motion-preset-still").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="scene-motion-preset-still"]')
      ?.getAttribute("aria-pressed") === "true");
  }

  await page.getByTestId("scene-select-tool").click();
  assert.equal(await page.getByRole("button", { name: "그림 되돌리기", exact: true }).isDisabled(), true);
  for (const [id, x, y] of [["green-line", 500, 400], ["red-frame", 160, 300],
    ["blue-orbit", 700, 270], ["top-frame", 250, 240], ["folded-brush", 160, 130]]) {
    await selectAt(x, y, id);
    assert.match(await page.getByTestId("scene-selection-status").innerText(), /1개/);
    assert.deepEqual(await savedScenes(), fixture, "Selection must not draw, mutate the draft, or create undo history");
    assert.equal(await page.getByRole("button", { name: "그림 되돌리기", exact: true }).isDisabled(), true);
    result.hits.push({ id, x, y, wholeObject: true });
  }
  await page.screenshot({ path: path.join(outputDir, "partial-nonzero-brush-selection.png") });
  // Moving the pointer with the selection tool must not start a drawing gesture.
  const dragPoint = await selectAt(500, 400, "green-line");
  await page.mouse.move(...dragPoint);
  await page.mouse.down();
  await page.mouse.move(dragPoint[0] + 35, dragPoint[1] - 20, { steps: 3 });
  await page.mouse.up();
  assert.deepEqual(await savedScenes(), fixture);
  await selectAt(900, 500, null);
  await showPanel("장면 설정 보기");
  assert.equal(await page.getByTestId("scene-motion-scope-selection").getAttribute("aria-pressed"), "true");
  const cards = page.getByRole("group", { name: "장면 움직임 선택", exact: true }).getByRole("button");
  assert.ok(await cards.count() > 0);
  for (const card of await cards.all()) assert.equal(await card.isDisabled(), true, "Blank selection must never apply to the whole drawing");
  assert.deepEqual(await savedScenes(), fixture);
  result.selectionOnly = { noAccidentalDrawing: true, noUndoEntry: true, blankClearsOnlySelection: true };

  await selectAt(160, 300, "red-frame");
  await applyPreset("move-right");
  const oneMoving = await savedScenes();
  assert.deepEqual(oneMoving[1], fixture[1]);
  assert.equal(oneMoving[0].motion, "still");
  assert.equal(oneMoving[0].elements[0].motion, "move-right");
  assert.deepEqual(oneMoving[0].elements.slice(1), fixture[0].elements.slice(1));
  await page.getByTestId("scene-clear-selection").click();
  assert.deepEqual(await savedScenes(), oneMoving, "Clearing the selection must retain its stored animation");
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(fixture);
  await page.getByRole("button", { name: "그림 다시 실행", exact: true }).click();
  await waitScenes(oneMoving);
  await selectAt(700, 270, "blue-orbit");
  await applyPreset("float");
  const twoMoving = await savedScenes();
  assert.deepEqual(twoMoving[0].elements.map((element) => element.motion), ["move-right", "float", undefined, undefined, undefined]);
  await page.getByTestId("scene-motion-scope-whole").click();
  assert.deepEqual(await savedScenes(), twoMoving, "Changing scope alone must not change any saved effect");
  await applyPreset("pulse");
  const whole = await savedScenes();
  assert.equal(whole[0].motion, "pulse");
  assert.ok(whole[0].elements.every((element) => element.motion === undefined));
  await page.getByRole("button", { name: "그림 되돌리기", exact: true }).click();
  await waitScenes(twoMoving);
  await page.getByTestId("scene-select-tool").click();
  await selectAt(700, 270, "blue-orbit");
  await applyPreset("still");
  const partial = await savedScenes();
  assert.deepEqual(partial[0].elements.map((element) => element.motion), ["move-right", "still", undefined, undefined, undefined]);
  assert.deepEqual(partial[1], fixture[1]);
  assert.equal(partial[0].background, fixture[0].background);
  assert.equal(partial[0].endMeasureIndex, fixture[0].endMeasureIndex);
  assert.deepEqual(partial[0].elements.map(({ motion, ...element }) => element), fixture[0].elements);
  result.scopes = { independentObjectEffects: true, clearKeepsEffects: true, undoRedo: true,
    wholeClearsObjectEffects: true, otherSceneAndOriginalPreserved: true };

  const sceneFilename = path.join(outputDir, "partial-motion.scene.json");
  const download = page.waitForEvent("download");
  await page.getByTestId("scene-save").click();
  await (await download).saveAs(sceneFilename);
  assert.deepEqual(JSON.parse(await readFile(sceneFilename, "utf8")).scene, partial[0]);
  await page.getByTestId("scene-reset").click();
  await page.waitForFunction((key) => !JSON.parse(localStorage.getItem(key)).musicVideoScenes[0].elements.length, DRAFT_KEY);
  await page.getByTestId("scene-import-file").setInputFiles(sceneFilename);
  await waitScenes(partial);
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  assert.deepEqual(await savedScenes(), partial);
  assert.equal(await page.getByTestId("scene-selection-outline").count(), 0, "Transient selection must not be stored with the drawing");
  result.persistence = { saveJson: true, resetImport: true, reload: true, selectionTransient: true };

  result.bpm = [];
  for (const bpm of [90, 180]) {
    await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
    await page.getByTestId("tempo-number").fill(String(bpm));
    await page.getByTestId("draw-music-video-scene").click();
    assert.deepEqual(await savedScenes(), partial);
    await seekPreview(0, "partial-bpm-warm");
    await seekPreview(.1, "partial-bpm-warm-small");
    await seekPreview(.75 * 60 / bpm, `partial-bpm-${bpm}`);
    const duration = Number(await page.getByLabel("움직임 미리보기 시간", { exact: true }).getAttribute("max"));
    result.bpm.push({ bpm, beat: .75, duration });
  }
  const sameBeat = await comparePreview("partial-bpm-90", "partial-bpm-180");
  assert.equal(sameBeat.changed, 0, "Partial animation must retain the same musical pose after changing BPM");
  assert.ok(Math.abs(result.bpm[0].duration / result.bpm[1].duration - 2) < 1e-9);
  result.bpmPixels = sameBeat;

  await seekPreview(.1, "partial-start");
  await capturePreview("partial-original-start.png");
  await seekPreview(3.5, "partial-end");
  await capturePreview("partial-move-right-in-progress.png");
  result.pixels = await compareRegions(page, "partial-start", "partial-end", REGIONS);
  assert.ok(result.pixels.selected.changed > 150, "The selected object's actual preview pixels must move");
  assert.equal(result.pixels.fixedEllipse.exactChanged, 0, "The other ellipse must remain completely fixed");
  assert.equal(result.pixels.fixedLine.exactChanged, 0, "The other line must remain completely fixed");
  await seekPreview(.1, "partial-repeat");
  assert.equal((await comparePreview("partial-start", "partial-repeat")).exactChanged, 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await showPanel("그림판 보기");
  await page.getByTestId("scene-select-tool").click();
  await selectAt(700, 270, "blue-orbit", true);
  assert.deepEqual(await savedScenes(), partial, "A real touchscreen tap must select without adding a stroke");
  await page.screenshot({ path: path.join(outputDir, "partial-touch-selection-390.png") });
  await showPanel("장면 설정 보기");
  for (const id of ["scene-motion-scope-whole", "scene-motion-scope-selection", "scene-save", "create-music-video"]) {
    const button = page.getByTestId(id);
    await button.click({ trial: true });
    const box = await button.boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= 391);
  }
  assert.equal(await page.locator(".mv-studio").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  await page.screenshot({ path: path.join(outputDir, "partial-controls-390.png") });
  result.touch = { actualTouchscreen: true, wholeClosedShape: true, noDrawingMutation: true, controlsReachable: true };

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const animated of [true, false]) {
    const media = await exportPartial(page, outputDir, animated, inspectVideo);
    result.exports.push(media);
    assert.deepEqual(await savedScenes(), partial);
  }
  result.success = true;
  return result;
}

async function compareRegions(page, before, after, regions) {
  return page.evaluate(({ before, after, regions }) => {
    const a = window.__presetFrames[before], b = window.__presetFrames[after];
    const result = {};
    for (const [name, [left, top, right, bottom]] of Object.entries(regions)) {
      let changed = 0, exactChanged = 0;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const offset = (y * 1280 + x) * 4;
        const delta = Math.abs(a[offset] - b[offset]) + Math.abs(a[offset + 1] - b[offset + 1]) + Math.abs(a[offset + 2] - b[offset + 2]);
        if (delta > 90) changed++;
        if (delta) exactChanged++;
      }
      result[name] = { changed, exactChanged };
    }
    return result;
  }, { before, after, regions });
}

async function exportPartial(page, outputDir, animated, inspectVideo) {
  await page.getByTestId("create-music-video").click();
  await page.getByRole("radio", { name: animated ? /애니메이션 있음/ : /애니메이션 없음/ }).check();
  const download = page.waitForEvent("download", { timeout: 180_000 });
  const started = performance.now();
  await page.getByTestId("confirm-music-video").click();
  const filename = path.join(outputDir, `scene-partial-move-right-${animated ? "animated" : "static"}.mp4`);
  await (await download).saveAs(filename);
  const bytes = await readFile(filename);
  // Both samples are inside the first scene's instrumental intro, with fixed text.
  const times = [.1, 3.5];
  const media = await inspectVideo(bytes, times, REGIONS);
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.equal(media.avc, true);
  assert.equal(media.aac, true);
  const regions = media.checks[0].regions;
  if (animated) assert.ok(regions.selected.changed > 150, "The selected object must move in the real animated MP4");
  else assert.ok(regions.selected.changed < 80, "Static MP4 must ignore the object's selected motion");
  assert.ok(regions.fixedEllipse.changed < 80, "Unselected ellipse must remain fixed in the real MP4");
  assert.ok(regions.fixedLine.changed < 80, "Unselected line must remain fixed in the real MP4");
  return { ...media, animated, motions: ["partial:move-right", "still"], bytes: bytes.length, times,
    elapsedSeconds: (performance.now() - started) / 1000 };
}
