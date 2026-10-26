import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

export const TRAVEL_DIRECTIONS = {
  "move-left": [-1, 0], "move-right": [1, 0], "move-up": [0, -1], "move-down": [0, 1],
  "move-up-left": [-1, -1], "move-up-right": [1, -1],
  "move-down-left": [-1, 1], "move-down-right": [1, 1],
  "bounce-left": [-1, 0], "bounce-right": [1, 0]
};
export const TRAVEL_IDS = Object.keys(TRAVEL_DIRECTIONS);

export async function artworkMotion(page, before, after) {
  return page.evaluate(({ before, after }) => {
    const bounds = (frame) => {
      let left = 1280, right = -1, top = 720, bottom = -1, count = 0;
      for (let y = 105; y < 595; y++) {
        for (let x = 45; x < 1235; x++) {
          const offset = (y * 1280 + x) * 4;
          const r = frame[offset], g = frame[offset + 1], b = frame[offset + 2];
          if (Math.max(r, g, b) - Math.min(r, g, b) <= 55 || Math.min(r, g, b) >= 180) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          count++;
        }
      }
      return { left, right, top, bottom, count, width: right - left + 1, height: bottom - top + 1,
        centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
    };
    const a = bounds(window.__presetFrames[before]);
    const b = bounds(window.__presetFrames[after]);
    return { before: a, after: b, dx: b.centerX - a.centerX, dy: b.centerY - a.centerY,
      widthChange: b.width - a.width, heightChange: b.height - a.height };
  }, { before, after });
}

export function assertTravelDirection(id, movement) {
  const direction = TRAVEL_DIRECTIONS[id];
  assert.ok(movement.before.count > 1000 && movement.after.count > 1000, `${id}: original artwork must remain visible`);
  assert.ok(Math.abs(movement.widthChange) <= 2 && Math.abs(movement.heightChange) <= 2,
    `${id}: bounding-box size must stay constant during translation`);
  for (const [axis, expected] of [["dx", direction[0]], ["dy", direction[1]]]) {
    if (id.startsWith("bounce-") && axis === "dy") continue;
    if (expected) assert.ok(movement[axis] * expected > 10, `${id}: artwork must move along the expected ${axis} direction`);
    else assert.ok(Math.abs(movement[axis]) <= 2, `${id}: the perpendicular axis must stay fixed`);
  }
}

export async function compareFixedOverlay(page, movingKey, stillKey) {
  return page.evaluate(({ movingKey, stillKey }) => {
    const moving = window.__presetFrames[movingKey];
    const still = window.__presetFrames[stillKey];
    const count = (top, bottom) => {
      let changed = 0;
      for (let y = top; y < bottom; y++) {
        for (let x = 0; x < 1280; x++) {
          const offset = (y * 1280 + x) * 4;
          if (moving[offset] !== still[offset] || moving[offset + 1] !== still[offset + 1] ||
            moving[offset + 2] !== still[offset + 2]) changed++;
        }
      }
      return changed;
    };
    const background = [[45, 105], [1234, 105], [45, 594], [1234, 594]].map(([x, y]) => {
      const offset = (y * 1280 + x) * 4;
      return [0, 1, 2].every((channel) => moving[offset + channel] === still[offset + channel]);
    });
    return { title: count(0, 66), lyrics: count(616, 720), backgroundSamplesMatch: background.every(Boolean) };
  }, { movingKey, stillKey });
}

/**
 * Test full-frame strokes through the real graphics module on an isolated canvas.
 * The app intentionally places title/lyrics above the drawing, so this extra view
 * exposes the outer stroke edges without changing or mocking the app renderer.
 */
export async function loadActualSceneGraphics(page, outputDir) {
  if (await page.evaluate(() => Boolean(window.SceneTravelGraphics?.drawSceneMotionGraphics))) return;
  const bundled = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "travel-verification-entry.ts",
    contents: 'export { drawSceneMotionGraphics, sampleSceneGraphicPose } from "./src/video/sceneMotionGraphics.ts";\n' +
      'export { elementPath } from "./src/video/sceneDrawing.ts";' }, bundle: true,
    write: false, format: "iife", globalName: "SceneTravelGraphics", platform: "browser", target: "es2022" });
  const code = bundled.outputFiles[0].text;
  await writeFile(path.join(outputDir, "actual-travel-renderer.browser.js"), code);
  await page.addScriptTag({ content: code });
}

export async function verifyFilledCanvasTravel(page, outputDir) {
  await loadActualSceneGraphics(page, outputDir);
  const result = await page.evaluate((ids) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const elements = [
      { id: "full-outline", tool: "rectangle", color: "#ea4335", width: 8, points: [[0, 0, .5], [960, 540, .5]] },
      { id: "full-diagonal", tool: "line", color: "#4285f4", width: 6, points: [[0, 0, .5], [960, 540, .5]] },
      { id: "full-diagonal-other", tool: "line", color: "#fbbc04", width: 6, points: [[960, 0, .5], [0, 540, .5]] }
    ];
    const pressurePoints = [];
    for (let index = 0; index <= 32; index++) pressurePoints.push([index * 30, 0, 1]);
    for (let index = 1; index <= 18; index++) pressurePoints.push([960, index * 30, 1]);
    for (let index = 1; index <= 32; index++) pressurePoints.push([960 - index * 30, 540, 1]);
    for (let index = 1; index <= 18; index++) pressurePoints.push([0, 540 - index * 30, 1]);
    elements.push({ id: "full-pressure-brush", tool: "brush", color: "#a142f4", width: 60, points: pressurePoints });
    const originalElements = JSON.stringify(elements);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
    document.body.append(svg);
    const vectorBounds = elements.map((element) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", window.SceneTravelGraphics.elementPath(element));
      svg.append(path);
      const box = path.getBBox();
      const padding = element.tool === "brush" ? 0 : element.width / 2;
      return { left: box.x - padding, right: box.x + box.width + padding,
        top: box.y - padding, bottom: box.y + box.height + padding };
    });
    svg.remove();
    const bounds = { left: Math.min(...vectorBounds.map((box) => box.left)), right: Math.max(...vectorBounds.map((box) => box.right)),
      top: Math.min(...vectorBounds.map((box) => box.top)), bottom: Math.max(...vectorBounds.map((box) => box.bottom)) };
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const baseFit = Math.min(1, 956 / (bounds.right - bounds.left), 536 / (bounds.bottom - bounds.top));
    const results = [];
    const pngs = [];
    for (const id of ids) {
      const scene = { id: `filled-${id}`, background: "#ffffff", motion: id, endLyric: null, endMeasureIndex: 0, elements };
      const timed = { scene, startSeconds: 0, endSeconds: 4, lyricText: "" };
      const plan = { title: "", bpm: 180, introSeconds: 0, lyrics: { title: "", hasLyrics: false, frames: [] }, scenes: [timed] };
      const frames = [];
      for (const [index, time] of [0, 1 / 6, 2, 23 / 6, 4].entries()) {
        const pose = window.SceneTravelGraphics.sampleSceneGraphicPose(timed, 180, time);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 1280, 720);
        context.save();
        context.scale(4 / 3, 4 / 3);
        window.SceneTravelGraphics.drawSceneMotionGraphics(context, timed, plan, time);
        context.restore();
        const pixels = context.getImageData(0, 0, 1280, 720).data;
        let left = 1280, top = 720, right = -1, bottom = -1, count = 0;
        for (let y = 0; y < 720; y++) for (let x = 0; x < 1280; x++) {
          const offset = (y * 1280 + x) * 4;
          const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
          if (Math.max(r, g, b) - Math.min(r, g, b) <= 55 || Math.min(r, g, b) >= 180) continue;
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
        }
        const geometric = { left: centerX + (bounds.left - centerX) * pose.scale + pose.dx,
          right: centerX + (bounds.right - centerX) * pose.scale + pose.dx,
          top: centerY + (bounds.top - centerY) * pose.scale + pose.dy,
          bottom: centerY + (bounds.bottom - centerY) * pose.scale + pose.dy };
        frames.push({ time, pose, geometric, pixels: { left, right, top, bottom, count,
          width: right - left + 1, height: bottom - top + 1 } });
        if ([0, 2, 4].includes(index)) pngs.push({ filename: `full-frame-${id}-${index === 0 ? "start" : index === 2 ? "middle" : "end"}.png`,
          data: canvas.toDataURL("image/png").split(",")[1] });
      }
      results.push({ id, frames, originalArtworkPreserved: JSON.stringify(scene.elements) === originalElements });
    }
    return { results, pngs, bounds, baseFit, originalPressure: 1, originalWidth: 60 };
  }, TRAVEL_IDS);
  for (const { filename, data } of result.pngs) await writeFile(path.join(outputDir, filename), Buffer.from(data, "base64"));
  for (const item of result.results) {
    const scales = item.frames.map((frame) => frame.pose.scale);
    const counts = item.frames.map((frame) => frame.pixels.count);
    assert.ok(scales.every((scale) => scale >= result.baseFit * .88 - 1e-6 && scale <= result.baseFit + 1e-6),
      `${item.id}: full artwork must shrink by at most 12% after fitting its original brush outline`);
    assert.ok(Math.max(...scales) - Math.min(...scales) < 1e-9, `${item.id}: scale must stay fixed while traveling`);
    assert.ok(Math.min(...counts) / Math.max(...counts) > .97, `${item.id}: full-frame strokes must not disappear at scene edges`);
    for (const frame of item.frames) {
      assert.ok(frame.geometric.left >= -.001 && frame.geometric.top >= -.001 &&
        frame.geometric.right <= 960.001 && frame.geometric.bottom <= 540.001,
      `${item.id}: transformed stroke bounds must remain inside the canvas`);
    }
    assert.equal(item.originalArtworkPreserved, true);
  }
  return { source: "actual sceneMotionGraphics.ts, isolated full-artwork canvas", width: 1280, height: 720,
    originalBounds: result.bounds, baseFit: result.baseFit, originalPressure: 1, originalWidth: 60,
    maximumAdditionalShrink: .12, results: result.results };
}
