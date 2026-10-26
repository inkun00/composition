import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DRAFT_KEY = "maeum-melody:draft:v1";

export async function verifyMobilePaintDock({ page, outputDir, width, height }) {
  const tools = page.getByRole("toolbar", { name: "그림판 도구", exact: true });
  const actions = [];
  for (const label of ["선택", "붓", "지우개", "직선", "네모", "동그라미",
    "그림 되돌리기", "그림 다시 실행", "현재 장면 비우기"]) {
    const button = tools.getByRole("button", { name: label, exact: true });
    await button.scrollIntoViewIfNeeded();
    const disabled = await button.isDisabled();
    if (!disabled) await button.click({ trial: true });
    const box = await button.boundingBox();
    const dock = await tools.boundingBox();
    assert.ok(box && dock && box.x >= dock.x - 1 && box.x + box.width <= dock.x + dock.width + 1,
      `${width}px ${label} must be reachable in the horizontal tool dock`);
    actions.push({ label, disabled, reachable: true });
  }
  await page.screenshot({ path: path.join(outputDir, `studio-tools-${width}-end.png`) });
  await tools.evaluate((element) => { element.scrollLeft = 0; });
  for (const label of ["색상 #1e293b", "색상 #ffffff", "붓 색상", "붓 굵기"]) {
    await page.getByLabel(label, { exact: true }).click({ trial: true });
  }
  await page.locator(".mv-color-grid").evaluate((element) => { element.scrollLeft = 0; });
  await page.locator(".mv-workspace").evaluate((element) => { element.scrollTop = 0; });
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="scene-paint-canvas"]').getBoundingClientRect();
    const workspace = document.querySelector(".mv-workspace").getBoundingClientRect();
    const tools = document.querySelector(".mv-paint-tools").getBoundingClientRect();
    return { toolsHeight: tools.height, canvasHeight: canvas.height,
      visibleCanvasHeight: Math.max(0, Math.min(canvas.bottom, workspace.bottom) - Math.max(canvas.top, workspace.top)) };
  });
  assert.ok(geometry.toolsHeight <= 101, `${width}px paint controls must fit the compact two-row design`);
  if (width === 375 && height === 667) assert.ok(geometry.visibleCanvasHeight >= geometry.canvasHeight - 2,
    `The short phone viewport must show the full canvas; got ${geometry.visibleCanvasHeight}/${geometry.canvasHeight}px`);
  await page.screenshot({ path: path.join(outputDir, `studio-tools-${width}-start.png`) });
  return { actions, ...geometry, paletteAndWidthReachable: true };
}

export async function verifyTwelveSceneWorkspace({ page, outputDir, savedScenes }) {
  const originalScenes = await savedScenes();
  const originalDraft = await page.evaluate((key) => localStorage.getItem(key), DRAFT_KEY);
  await page.evaluate((key) => {
    const draft = JSON.parse(localStorage.getItem(key));
    const base = draft.musicVideoScenes[0];
    draft.songLength = 16;
    draft.measures = Array.from({ length: 16 }, (_, index) => ({ ...draft.measures[index % draft.measures.length],
      notes: draft.measures[index % draft.measures.length].notes.map((note, noteIndex) =>
        ({ ...note, id: `layout-${index}-${noteIndex}` })) }));
    draft.lyrics = Array.from({ length: 16 }, (_, index) => draft.lyrics[index % draft.lyrics.length]);
    draft.musicVideoScenes = Array.from({ length: 12 }, (_, index) => ({ ...base,
      id: `layout-scene-${index}`, motion: "still", choreography: undefined,
      endMeasureIndex: index === 11 ? 15 : index,
      elements: base.elements.map(({ motion, ...element }) => ({ ...element, id: `layout-${index}-${element.id}` })) }));
    localStorage.setItem(key, JSON.stringify(draft));
  }, DRAFT_KEY);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  const sceneButtons = page.getByRole("button", { name: /^\d+번 장면 선택$/ });
  assert.equal(await sceneButtons.count(), 12);
  const before = await page.getByTestId("scene-paint-canvas").boundingBox();
  assert.ok(before && before.width >= 700, `Twelve scenes must leave a >=700px painting canvas at 1440×900; got ${before?.width}`);
  const rows = await sceneButtons.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  assert.ok(Math.max(...rows) - Math.min(...rows) <= 2, "Twelve scene cards must stay in one horizontal timeline row");
  const lastScene = page.getByRole("button", { name: "12번 장면 선택", exact: true });
  // Trigger the actual selection handler without Playwright scrolling the card
  // for us: the timeline's own selected-scene scroll must reveal the last card.
  await lastScene.evaluate((element) => element.click());
  await page.waitForFunction(() => document.querySelector('button[aria-label="12번 장면 선택"]')
    ?.getAttribute("aria-pressed") === "true");
  await page.waitForFunction(() => {
    const card = document.querySelector('button[aria-label="12번 장면 선택"]')?.getBoundingClientRect();
    const list = document.querySelector(".mv-scene-list")?.getBoundingClientRect();
    return card && list && card.left >= list.left - 1 && card.right <= list.right + 1;
  });
  const after = await page.getByTestId("scene-paint-canvas").boundingBox();
  const storyboard = await page.getByRole("region", { name: "뮤직비디오 장면 목록", exact: true }).boundingBox();
  assert.ok(after && after.width >= 700);
  assert.ok(Math.abs(after.width - before.width) < 1, "Selecting a later scene must not shrink the drawing surface");
  assert.ok(after.x >= 0 && after.x + after.width <= 1440);
  assert.ok(storyboard && after.y + after.height <= storyboard.y + 1, "The timeline must not overlap the painting canvas");
  assert.equal(await page.locator(".mv-studio").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  for (const id of ["scene-save", "scene-reset", "create-music-video"]) await page.getByTestId(id).click({ trial: true });
  await page.screenshot({ path: path.join(outputDir, "studio-12-scenes-1440x900.png") });
  await page.evaluate(({ key, draft }) => localStorage.setItem(key, draft), { key: DRAFT_KEY, draft: originalDraft });
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  assert.deepEqual(await savedScenes(), originalScenes);
  return { width: 1440, height: 900, scenes: 12, canvas: after, singleTimelineRow: true,
    laterSceneAutoScrolledIntoView: true, drawingNotOverlapped: true, actionsReachable: true };
}

export async function verifyResultDialog({ page, outputDir, savedScenes, expectedBytes }) {
  const originalScenes = await savedScenes();
  const checks = [];
  for (const [width, height] of [[1440, 900], [820, 1180], [390, 844], [360, 844], [375, 667]]) {
    await page.setViewportSize({ width, height });
    const trigger = page.getByTestId("music-video-result-open");
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "완성된 뮤직비디오", exact: true });
    await dialog.waitFor();
    await assertFocusInside(dialog);
    const box = await dialog.boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1 && box.y >= -1 && box.y + box.height <= height + 1,
      `${width}px completed-video dialog must fit without clipping`);
    assert.equal(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
    const video = dialog.getByLabel("완성된 뮤직비디오", { exact: true });
    await video.evaluate((element) => element.readyState >= 2 ? undefined : new Promise((resolve, reject) => {
      element.onloadeddata = resolve;
      element.onerror = reject;
    }));
    assert.deepEqual(await video.evaluate((element) => [element.videoWidth, element.videoHeight]), [1280, 720]);
    // Show a representative generated frame, rather than draw-on's deliberately
    // empty first instant, so screenshots also verify the artwork in the player.
    await video.evaluate(async (element) => {
      const time = Math.min(2.4, element.duration - .05);
      if (Math.abs(element.currentTime - time) > .001) {
        await new Promise((resolve, reject) => { element.onseeked = resolve; element.onerror = reject; element.currentTime = time; });
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const videoBox = await video.boundingBox();
    assert.ok(videoBox && videoBox.width > 200 && videoBox.x >= box.x && videoBox.x + videoBox.width <= box.x + box.width + 1);
    await page.screenshot({ path: path.join(outputDir, `studio-result-dialog-${width}.png`) });
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
      await assertFocusInside(dialog);
    }
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0, "Escape must close the result without closing the editor");
    await page.getByRole("dialog", { name: "장면 그리기", exact: true }).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "music-video-result-open");
    assert.deepEqual(await savedScenes(), originalScenes);
    const paint = page.getByRole("button", { name: "그림판 보기", exact: true });
    if (await paint.isVisible()) await paint.click();
    await page.getByTestId("scene-paint-canvas").click({ position: { x: 5, y: 5 }, trial: true });
    await page.getByTestId("create-music-video").click({ trial: true });
    await page.screenshot({ path: path.join(outputDir, `studio-after-result-${width}.png`) });
    checks.push({ width, height, dialogFits: true, videoReady: true, tabFocusContained: true,
      escapeKeepsEditorOpen: true, focusRestored: true, paintingAndCreateReachable: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId("music-video-result-open").click();
  const dialog = page.getByRole("dialog", { name: "완성된 뮤직비디오", exact: true });
  const video = dialog.getByLabel("완성된 뮤직비디오", { exact: true });
  await video.evaluate(async (element) => { element.currentTime = 0; await element.play(); });
  await page.waitForFunction(() => document.querySelector('video[aria-label="완성된 뮤직비디오"]')?.currentTime > .15);
  await video.evaluate((element) => element.pause());
  const download = page.waitForEvent("download");
  await page.getByTestId("music-video-result-download").click();
  const filename = path.join(outputDir, "studio-result-download.mp4");
  await (await download).saveAs(filename);
  const downloaded = await readFile(filename);
  if (expectedBytes !== undefined) assert.equal(downloaded.length, expectedBytes, "Re-saving must retain the actual generated MP4 bytes");
  await page.getByTestId("music-video-result-close").click();
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "music-video-result-open");
  assert.deepEqual(await savedScenes(), originalScenes);
  // Check the outer drawing dialog's keyboard workflow independently of the video.
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog", { name: "장면 그리기", exact: true }).count(), 0);
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "draw-music-video-scene");
  await page.getByTestId("draw-music-video-scene").click();
  await assertFocusInside(page.getByRole("dialog", { name: "장면 그리기", exact: true }));
  assert.deepEqual(await savedScenes(), originalScenes);
  return { checks, actualPlayback: true, actualDownloadBytes: downloaded.length,
    closeButtonRestoresFocus: true, studioEscapeRestoresOpener: true, artworkPreserved: true };
}

async function assertFocusInside(dialog) {
  await dialog.page().waitForFunction((element) => element.contains(document.activeElement), await dialog.elementHandle());
}
