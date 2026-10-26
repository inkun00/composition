import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const ASSIGNED_REGIONS = {
  removedRectangle: [175, 200, 550, 470],
  removedEllipse: [790, 230, 1080, 490],
  removedLine: [540, 510, 810, 560],
  remainingCircle: [550, 260, 740, 460]
};

export async function seekAssignedPreview(page, seconds, key) {
  const pause = page.getByRole("button", { name: "미리보기 멈추기", exact: true });
  if (await pause.count()) await pause.click();
  await page.getByLabel("움직임 미리보기 시간", { exact: true }).evaluate((element, seconds) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, String(seconds));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, seconds);
  await page.getByLabel("장면 움직임 미리보기", { exact: true }).evaluate(async (canvas, key) => {
    await new Promise(requestAnimationFrame);
    (window.__assignedFrames ??= {})[key] = canvas.getContext("2d").getImageData(0, 0, 1280, 720).data;
  }, key);
}

export async function compareAssignedPreview(page, before, after) {
  return page.evaluate(({ before, after, regions }) => {
    const a = window.__assignedFrames[before], b = window.__assignedFrames[after];
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
  }, { before, after, regions: ASSIGNED_REGIONS });
}

export async function captureAssignedPreview(page, outputDir, filename) {
  const png = await page.getByLabel("장면 움직임 미리보기", { exact: true })
    .evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  await writeFile(path.join(outputDir, filename), Buffer.from(png, "base64"));
}

export async function exportAssignedRemovalVideo(page, outputDir, animated) {
  await page.getByTestId("create-music-video").click();
  await page.getByRole("radio", { name: animated ? /애니메이션 있음/ : /애니메이션 없음/ }).check();
  const download = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("confirm-music-video").click();
  const filename = path.join(outputDir, `assigned-motion-removal-${animated ? "animated" : "static"}.mp4`);
  await (await download).saveAs(filename);
  const bytes = await readFile(filename);
  // First scene, actual music beats 4→4.5 after .08 seconds + 16 intro beats.
  const times = [.08 + 20 / 3 + .01, .08 + 20.5 / 3];
  const media = await decodeAssignedVideo(page, bytes, times);
  assert.deepEqual([media.width, media.height], [1280, 720]);
  assert.equal(media.avc, true);
  assert.equal(media.aac, true);
  for (const name of ["removedRectangle", "removedEllipse", "removedLine"]) {
    assert.ok(media.regions[name].changed < 80, `${name} must stay still in the real exported MP4 after removing its motion`);
  }
  if (animated) assert.ok(media.regions.remainingCircle.changed > 150, "The remaining object's pulse must still animate in the MP4");
  else assert.ok(media.regions.remainingCircle.changed < 80, "Static MP4 must ignore the remaining object's pulse");
  for (const [index, png] of media.pngs.entries()) {
    await writeFile(path.join(outputDir, `assigned-video-${animated ? "animated" : "static"}-${index}.png`), Buffer.from(png, "base64"));
  }
  delete media.pngs;
  return { ...media, animated, times, bytes: bytes.length };
}

async function decodeAssignedVideo(page, bytes, times) {
  return page.evaluate(async ({ base64, times, regions }) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
    const video = document.createElement("video");
    video.src = url;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const frames = [], pngs = [];
    for (const time of times) {
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = time; });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      context.drawImage(video, 0, 0);
      frames.push(context.getImageData(0, 0, 1280, 720).data);
      pngs.push(canvas.toDataURL("image/png").split(",")[1]);
    }
    const changes = {};
    for (const [name, [left, top, right, bottom]] of Object.entries(regions)) {
      let changed = 0;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const index = (y * 1280 + x) * 4;
        if (Math.abs(frames[0][index] - frames[1][index]) + Math.abs(frames[0][index + 1] - frames[1][index + 1]) +
          Math.abs(frames[0][index + 2] - frames[1][index + 2]) > 90) changed++;
      }
      changes[name] = { changed };
    }
    const signature = new TextDecoder("latin1").decode(bytes);
    const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration,
      avc: signature.includes("avc1"), aac: signature.includes("mp4a"), regions: changes, pngs };
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    return result;
  }, { base64: bytes.toString("base64"), times, regions: ASSIGNED_REGIONS });
}
