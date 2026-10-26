import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function captureIntroFrame(page, outputDir, key) {
  const png = await page.getByTestId("music-video-preview-canvas").evaluate(async (canvas, key) => {
    await new Promise(requestAnimationFrame);
    (window.__introFrames ??= {})[key] = canvas.getContext("2d").getImageData(0, 0, 1280, 720).data;
    return canvas.toDataURL("image/png").split(",")[1];
  }, key);
  await writeFile(path.join(outputDir, `${key}.png`), Buffer.from(png, "base64"));
  return inspectIntroFrame(page, key);
}

export async function inspectIntroFrame(page, key) {
  return page.evaluate((key) => {
    const data = window.__introFrames[key];
    const regions = { title: [60, 220, 1220, 385], composer: [60, 385, 1220, 500] };
    const white = {};
    for (const [name, [left, top, right, bottom]] of Object.entries(regions)) {
      let count = 0;
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const index = (y * 1280 + x) * 4;
        if (Math.min(data[index], data[index + 1], data[index + 2]) > 235) count++;
      }
      white[name] = count;
    }
    let black = 0, colored = 0;
    for (let index = 0; index < data.length; index += 4) {
      const channels = [data[index], data[index + 1], data[index + 2]];
      if (Math.max(...channels) <= 3) black++;
      if (Math.max(...channels) - Math.min(...channels) > 30) colored++;
    }
    const pixel = (x, y) => [...data.slice((y * 1280 + x) * 4, (y * 1280 + x) * 4 + 3)];
    return { key, blackFraction: black / (1280 * 720), colored, white, background: pixel(20, 120),
      corners: [pixel(0, 0), pixel(1279, 0), pixel(0, 719), pixel(1279, 719)] };
  }, key);
}

export function assertBlackIntroCard(frame) {
  assert.ok(frame.blackFraction > .96, "The fallback must be a black screen with only the white title and composer");
  assert.ok(frame.white.title > 300 && frame.white.composer > 70, "Both title and composer text regions must contain white glyphs");
  assert.equal(frame.colored, 0, "The fallback must not leak any normal-scene drawing or lyric highlight");
  for (const corner of frame.corners) assert.deepEqual(corner, [0, 0, 0]);
}

export function assertIntroBackground(frame, expected, tolerance = 0) {
  assert.ok(frame.background.every((channel, index) => Math.abs(channel - expected[index]) <= tolerance),
    `${frame.key} background ${frame.background} must match ${expected}`);
}

export async function compareIntroFrames(page, before, after, region = [0, 0, 1280, 720]) {
  return page.evaluate(({ before, after, region: [left, top, right, bottom] }) => {
    const a = window.__introFrames[before], b = window.__introFrames[after];
    let exactChanged = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const index = (y * 1280 + x) * 4;
      if (a[index] !== b[index] || a[index + 1] !== b[index + 1] || a[index + 2] !== b[index + 2]) exactChanged++;
    }
    return { exactChanged };
  }, { before, after, region });
}

export async function exportIntroVideo(page, outputDir, boundary) {
  await page.getByTestId("create-music-video").click();
  await page.getByRole("radio", { name: /애니메이션 있음/ }).check();
  const download = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("confirm-music-video").click();
  const file = path.join(outputDir, "intro-scene-and-song.mp4");
  await (await download).saveAs(file);
  const bytes = await readFile(file);
  // Native media decoding seeks into actual encoded samples. The exact boundary
  // is checked separately in the live canvas; MP4 also checks a safe post-edge sample.
  const times = [.1, boundary - .08, boundary, boundary + .08, boundary + 4.8 + .08];
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
    const pngs = [];
    window.__introFrames ??= {};
    for (const [index, time] of times.entries()) {
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = time; });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      context.drawImage(video, 0, 0);
      window.__introFrames[`mp4-intro-${index}`] = context.getImageData(0, 0, 1280, 720).data;
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
  assert.ok(media.avc && media.aac, "The actual MP4 must contain H.264 video and AAC music");
  const frames = [];
  for (const [index, png] of media.pngs.entries()) {
    await writeFile(path.join(outputDir, `mp4-intro-${index}.png`), Buffer.from(png, "base64"));
    frames.push(await inspectIntroFrame(page, `mp4-intro-${index}`));
  }
  for (const index of [0, 1]) assertIntroBackground(frames[index], [234, 242, 255], 8);
  const matches = (actual, expected) => actual.every((channel, index) => Math.abs(channel - expected[index]) <= 8);
  const exactBoundaryDecodedSample = matches(frames[2].background, [255, 248, 237]) ? "first-song"
    : matches(frames[2].background, [234, 242, 255]) ? "last-intro" : "unexpected";
  // Native HTML video seeking may choose the preceding 24fps sample at the
  // exact edit edge. Observe that sample and require the following frame region
  // to belong to the song; the live renderer above checks the exact instant.
  assert.notEqual(exactBoundaryDecodedSample, "unexpected");
  assertIntroBackground(frames[3], [255, 248, 237], 8);
  assertIntroBackground(frames[4], [252, 232, 230], 8);
  delete media.pngs;
  await page.waitForFunction(() => document.querySelector('[data-testid="create-music-video"]')?.disabled === false);
  return { ...media, animated: true, bytes: bytes.length, times, frames, exactBoundaryDecodedSample };
}
