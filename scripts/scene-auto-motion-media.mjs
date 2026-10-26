import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function seekAutoPreview(page, time, key) {
  const pause = page.getByRole("button", { name: "미리보기 멈추기", exact: true });
  if (await pause.count()) await pause.click();
  await page.getByLabel("움직임 미리보기 시간", { exact: true }).evaluate((input, time) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(time));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, time);
  await page.getByLabel("장면 움직임 미리보기", { exact: true }).evaluate(async (canvas, key) => {
    await new Promise(requestAnimationFrame);
    (window.__autoFrames ??= {})[key] = canvas.getContext("2d").getImageData(0, 0, 1280, 720).data;
  }, key);
}

export async function compareAutoFrames(page, first, second) {
  return page.evaluate(({ first, second }) => {
    const a = window.__autoFrames[first], b = window.__autoFrames[second];
    let changed = 0, exactChanged = 0;
    const bounds = [0, 1].map(() => ({ left: 1280, right: -1, top: 720, bottom: -1 }));
    for (let y = 105; y < 595; y++) for (let x = 45; x < 1235; x++) {
      const index = (y * 1280 + x) * 4;
      const delta = Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
      if (delta > 90) changed++;
      if (delta) exactChanged++;
      for (const [slot, frame] of [a, b].entries()) {
        const channels = [frame[index], frame[index + 1], frame[index + 2]];
        if (Math.max(...channels) - Math.min(...channels) > 55 && Math.min(...channels) < 180) {
          bounds[slot].left = Math.min(bounds[slot].left, x);
          bounds[slot].right = Math.max(bounds[slot].right, x);
          bounds[slot].top = Math.min(bounds[slot].top, y);
          bounds[slot].bottom = Math.max(bounds[slot].bottom, y);
        }
      }
    }
    return { changed, exactChanged, bounds: bounds.map((box) => ({ ...box, width: box.right - box.left + 1,
      centerX: (box.left + box.right) / 2, centerY: (box.top + box.bottom) / 2 })) };
  }, { first, second });
}

export async function captureAutoPreview(page, outputDir, filename) {
  const png = await page.getByLabel("장면 움직임 미리보기", { exact: true })
    .evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  await writeFile(path.join(outputDir, filename), Buffer.from(png, "base64"));
}

export async function exportAutoMotionVideo(page, outputDir, animated, bpm) {
  await page.getByTestId("create-music-video").click();
  await page.getByRole("radio", { name: animated ? /애니메이션 있음/ : /애니메이션 없음/ }).check();
  const download = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("confirm-music-video").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="scene-auto-motions"]')?.disabled === true);
  const filename = path.join(outputDir, `auto-four-scenes-${animated ? "animated" : "static"}.mp4`);
  await (await download).saveAs(filename);
  const bytes = await readFile(filename);
  const beat = 60 / bpm;
  const intro = .08 + 16 * beat;
  const secondStart = intro + 8 * beat;
  const times = [intro + 2 * beat, intro + 7.5 * beat, secondStart + .2 * beat, secondStart + 7.6 * beat];
  const media = await page.evaluate(async ({ base64, times }) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
    const video = document.createElement("video");
    video.src = url;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    window.__autoFrames ??= {};
    const pngs = [];
    for (const [index, time] of times.entries()) {
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = time; });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      context.drawImage(video, 0, 0);
      window.__autoFrames[`mp4-${index}`] = context.getImageData(0, 0, 1280, 720).data;
      pngs.push(canvas.toDataURL("image/png").split(",")[1]);
    }
    const signature = new TextDecoder("latin1").decode(bytes);
    const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration,
      avc: signature.includes("avc1"), aac: signature.includes("mp4a"), pngs };
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    return result;
  }, { base64: bytes.toString("base64"), times });
  assert.deepEqual([media.width, media.height], [1280, 720]);
  assert.equal(media.avc, true);
  assert.equal(media.aac, true);
  const checks = [await compareAutoFrames(page, "mp4-0", "mp4-1"), await compareAutoFrames(page, "mp4-2", "mp4-3")];
  for (const [index, check] of checks.entries()) {
    if (animated) {
      assert.ok(check.changed > 150, "The automatically assigned scene motion must appear in the actual MP4");
      const dy = check.bounds[1].centerY - check.bounds[0].centerY;
      assert.ok(index === 0 ? dy < -8 : dy > 20, "Upward/downward musical passages must retain their matching travel direction in MP4");
      assert.ok(Math.abs(check.bounds[1].width - check.bounds[0].width) <= 4);
    } else assert.ok(check.changed < 80, "Static MP4 must ignore the automatically selected scene presets");
  }
  for (const [index, png] of media.pngs.entries()) {
    await writeFile(path.join(outputDir, `auto-video-${animated ? "animated" : "static"}-${index}.png`), Buffer.from(png, "base64"));
  }
  delete media.pngs;
  await page.waitForFunction(() => document.querySelector('[data-testid="create-music-video"]')?.disabled === false);
  return { ...media, animated, bpm, times, checks, bytes: bytes.length, workingGuard: true };
}
