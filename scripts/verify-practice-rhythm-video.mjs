import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4174/";
const outputDir = path.resolve("artifacts/practice-rhythm-video");
const bars = [
  [[0.25, false], [0.25, true], [0.5, false], [0.5, true], [1.5, false], [1, false]],
  [[2, false], [2, true]],
  [[4, false]],
  [[4, true]],
  [[3, false], [1, true]],
  [[3, true], [1, false]],
  [[1.5, true], [1.5, false], [0.5, false], [0.5, true]]
];
const pageTimes = [0.3, 4.3, 8.3, 12.3];
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.rhythmPreviewPixels = [];
    window.rhythmEncodedPixels = [];
    window.rhythmVideoLabels = new WeakMap();
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
      if (x === 0 && y === 0 && width === this.canvas.width && height === this.canvas.height) {
        window.rhythmVideoLabels.set(this.canvas, []);
      }
      return fillRect.call(this, x, y, width, height);
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      const labels = window.rhythmVideoLabels.get(this.canvas) || [];
      labels.push(String(text));
      window.rhythmVideoLabels.set(this.canvas, labels);
      return fillText.call(this, text, ...args);
    };
    window.rhythmGlyphMask = (pixels, x, y) => {
      const mask = [];
      for (let row = -18; row < 18; row += 1) {
        for (let column = -14; column < 14; column += 1) {
          const offset = ((Math.round(y) + row) * 1280 + Math.round(x) + column) * 4;
          mask.push(Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) > 180 ? 1 : 0);
        }
      }
      return mask;
    };
  });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  await page.getByRole("button", { name: "리듬만들기", exact: true }).click();
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("7");
  await page.getByLabel("연습 빠르기", { exact: true }).selectOption("120");
  await page.getByLabel("리듬 연주 악기", { exact: true }).selectOption("flute");
  const tools = page.getByTestId("practice-score-tools-0");
  const lyrics = ["반짝반짝", "넷", "쭉", "", "점", "별", "하늘"];
  for (const [index, notes] of bars.entries()) {
    const card = page.getByTestId(`practice-measure-card-${index}`);
    await card.getByTestId(`practice-measure-${index}`).click();
    if (lyrics[index]) await card.locator(".practice-lyric-entry input").fill(lyrics[index]);
    for (const [duration, rest] of notes) {
      await tools.getByTestId(`practice-${rest ? "rest" : "duration"}-${duration}`).click();
    }
  }
  const authored = await page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1")));
  assert.equal(authored.mode, "rhythm");
  assert.deepEqual(authored.measures.map((measure) => measure.notes.map((note) => [
    note.duration.numerator / note.duration.denominator, note.pitch === null
  ])), bars);
  await page.getByRole("tab", { name: /음악 저장하기/ }).click();
  const canvas = page.getByRole("img", { name: "막대 모드 영상 미리보기", exact: true });
  await canvas.waitFor({ state: "visible" });
  const position = page.getByLabel("영상 미리보기 위치", { exact: true });
  await page.waitForFunction(() => !document.querySelector('[aria-label="영상 미리보기 위치"]').disabled);
  const previewLabels = [];
  for (const [index, seconds] of pageTimes.entries()) {
    await position.evaluate((input, seconds) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, String(seconds));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, seconds);
    await page.waitForFunction((seconds) => document.querySelector(".practice-video-preview output")
      ?.textContent.startsWith(seconds.toFixed(1)), seconds);
    previewLabels.push(await canvas.evaluate((canvas) => {
      window.rhythmPreviewPixels.push(canvas.getContext("2d").getImageData(0, 0, 1280, 720).data);
      return window.rhythmVideoLabels.get(canvas) || [];
    }));
    await canvas.screenshot({ path: path.join(outputDir, `preview-page-${index + 1}.png`) });
  }
  assert.ok(previewLabels.flat().every((label) => label !== "리듬" && label !== "쉼"), JSON.stringify(previewLabels));
  assert.ok(previewLabels.flat().includes("반") && previewLabels.flat().includes("별"), JSON.stringify(previewLabels));

  const downloadEvent = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "MP4 저장", exact: true }).click();
  const download = await downloadEvent;
  const mp4Path = path.join(outputDir, "rhythm-durations-and-rests.mp4");
  await download.saveAs(mp4Path);
  const bytes = await readFile(mp4Path);
  assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
  const metadata = await page.evaluate(async (bytes) => {
    const context = new AudioContext();
    const audio = await context.decodeAudioData(Uint8Array.from(bytes).buffer);
    const samples = audio.getChannelData(0);
    const energy = (start, end) => {
      const values = samples.slice(Math.floor(start * audio.sampleRate), Math.floor(end * audio.sampleRate));
      return values.reduce((sum, value) => sum + value ** 2, 0) / values.length;
    };
    const audioReport = { duration: audio.duration, soundingBar: energy(4.1, 5.5), silentRestBar: energy(6.2, 7.5) };
    await context.close();
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "video/mp4" }));
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.id = "rhythm-encoded-frame";
    canvas.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;width:1280px;height:720px";
    document.body.append(canvas);
    window.rhythmDecoded = { video, canvas };
    return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, audio: audioReport };
  }, [...bytes]);
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 720);
  assert.ok(Math.abs(metadata.duration - 14) < 0.2, JSON.stringify(metadata));
  assert.ok(Math.abs(metadata.audio.duration - 14) < 0.2, JSON.stringify(metadata));
  // The preceding flute note can naturally ring into a rest; it must not be
  // retriggered there, and its residual energy stays far below the sounding bar.
  assert.ok(metadata.audio.soundingBar > 0.000001
    && metadata.audio.silentRestBar < metadata.audio.soundingBar * 0.01, JSON.stringify(metadata));
  for (const [index, seconds] of pageTimes.entries()) {
    await page.evaluate(async (seconds) => {
      const { video, canvas } = window.rhythmDecoded;
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = seconds; });
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0);
      window.rhythmEncodedPixels.push(context.getImageData(0, 0, 1280, 720).data);
    }, seconds);
    await page.locator("#rhythm-encoded-frame").screenshot({ path: path.join(outputDir, `encoded-page-${index + 1}.png`) });
  }
  const visuals = await page.evaluate((bars) => {
    const frames = window.rhythmPreviewPixels.map((preview, index) => {
      const encoded = window.rhythmEncodedPixels[index];
      let total = 0;
      for (let pixel = 0; pixel < preview.length; pixel += 1) total += Math.abs(preview[pixel] - encoded[pixel]);
      return { meanDifference: total / preview.length };
    });
    const glyphs = bars.flatMap((notes, barIndex) => {
      const pageIndex = Math.floor(barIndex / 2);
      const width = pageIndex === 3 ? 1184 : 584;
      const left = 48 + (barIndex % 2) * 600;
      let beat = 0;
      return notes.map(([duration, rest]) => {
        const x = left + (beat + duration / 2) / 4 * width - 0.5;
        beat += duration;
        const preview = window.rhythmGlyphMask(window.rhythmPreviewPixels[pageIndex], x, 348);
        const encoded = window.rhythmGlyphMask(window.rhythmEncodedPixels[pageIndex], x, 348);
        return {
          key: `${rest ? "rest" : "note"}-${duration}`,
          barIndex, x,
          previewInk: preview.reduce((sum, value) => sum + value, 0),
          encodedInk: encoded.reduce((sum, value) => sum + value, 0),
          difference: preview.reduce((sum, value, index) => sum + Math.abs(value - encoded[index]), 0) / preview.length,
          mask: encoded
        };
      });
    });
    const pairs = [
      ["note-0.25", "note-0.5"], ["note-0.5", "note-1"], ["note-1", "note-2"],
      ["note-2", "note-4"], ["note-1", "note-1.5"], ["note-2", "note-3"],
      ["rest-0.25", "rest-0.5"], ["rest-0.5", "rest-1"], ["rest-1", "rest-2"],
      ["rest-2", "rest-4"], ["rest-1", "rest-1.5"], ["rest-2", "rest-3"]
    ].map(([left, right]) => {
      const a = glyphs.find((glyph) => glyph.key === left).mask;
      const b = glyphs.find((glyph) => glyph.key === right).mask;
      const changedPixels = a.reduce((sum, value, index) => sum + Math.abs(value - b[index]), 0);
      return { left, right, changedPixels, difference: changedPixels / a.length };
    });
    return { frames, glyphs: glyphs.map(({ mask, ...glyph }) => glyph), pairs };
  }, bars);
  assert.ok(visuals.frames.every((frame) => frame.meanDifference < 2), JSON.stringify(visuals.frames));
  assert.ok(visuals.glyphs.every((glyph) => glyph.previewInk > 5 && glyph.encodedInk > 5 && glyph.difference < 0.1), JSON.stringify(visuals.glyphs));
  // An augmentation dot is only a few bright pixels after H.264 compression;
  // require a real visible shape difference without discarding those small dots.
  assert.ok(visuals.pairs.every((pair) => pair.changedPixels >= 3), JSON.stringify(visuals.pairs));
  await page.evaluate(() => {
    URL.revokeObjectURL(window.rhythmDecoded.video.src);
    window.rhythmDecoded.canvas.remove();
  });
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1"))), authored);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", metadata, visuals, previewLabels, outputs: outputDir }, null, 2));
} finally {
  await browser.close();
}
