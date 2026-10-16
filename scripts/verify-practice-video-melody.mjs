import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4174/";
const outputDir = path.resolve("artifacts/practice-video-melody");
// Sample inside encoded frames, not exactly at a 24 fps/note boundary where
// HTMLVideoElement may resolve a seek to either adjacent frame.
const times = [0.2, 0.7, 1.2, 2.2, 3.2];
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
    window.practiceVideoSnapshots = { previews: {}, encoded: {} };
    window.practiceCanvasLabels = new WeakMap();
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
      if (x === 0 && y === 0 && width === this.canvas.width && height === this.canvas.height) {
        window.practiceCanvasLabels.set(this.canvas, []);
      }
      return fillRect.call(this, x, y, width, height);
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      const labels = window.practiceCanvasLabels.get(this.canvas) || [];
      labels.push(String(text));
      window.practiceCanvasLabels.set(this.canvas, labels);
      return fillText.call(this, text, ...args);
    };
    window.practiceStaffLines = (pixels, width, height) => {
      const rows = [];
      for (let y = 25; y < height - 25; y += 1) {
        let bright = 0;
        for (let x = 80; x < width - 80; x += 1) {
          const index = (y * width + x) * 4;
          if (Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 90) bright += 1;
        }
        if (bright / (width - 160) > 0.8 && (!rows.length || y - rows.at(-1) > 3)) rows.push(y);
      }
      return rows;
    };
  });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  await page.getByRole("button", { name: "리듬만들고 가락넣기", exact: true }).click();
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("2");
  await page.getByLabel("연습 빠르기", { exact: true }).selectOption("120");
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1")));
  const card = (score, measure) => page.getByTestId(score === 0
    ? `practice-measure-card-${measure}` : `practice-score-${score}-measure-card-${measure}`);
  const tools = (score) => page.getByTestId(`practice-score-tools-${score}`);
  async function fillBar(score, measure, duration, count, lyric = "") {
    await card(score, measure).getByTestId(score === 0
      ? `practice-measure-${measure}` : `practice-score-${score}-measure-${measure}`).click();
    if (lyric) await card(score, measure).locator(".practice-lyric-entry input").fill(lyric);
    for (let note = 0; note < count; note += 1) {
      await tools(score).getByTestId(`practice-duration-${duration}`).click();
    }
  }
  await fillBar(0, 0, 1, 4, "반짝별아");
  await fillBar(0, 1, 2, 2, "노래");
  await page.getByRole("button", { name: /악보 추가하기/ }).click();
  await page.getByLabel("2번 악보 리듬 연주 악기", { exact: true }).selectOption("flute");
  await fillBar(1, 0, 0.5, 8);
  await fillBar(1, 1, 0.5, 8);
  await page.getByRole("button", { name: /악보 추가하기/ }).click();
  await page.getByLabel("3번 악보 리듬 연주 악기", { exact: true }).selectOption("beat:kick");
  await fillBar(2, 0, 1, 4);
  await fillBar(2, 1, 2, 2);
  const retainedRhythms = (await draft()).rhythmLayers;
  assert.equal(retainedRhythms.length, 2);
  assert.ok(retainedRhythms.every((layer) => layer.measures.every((measure) =>
    measure.notes.length > 0 && measure.notes.every((note) => note.pitch !== null))));
  await page.getByRole("tab", { name: /가락 만들기/ }).click();
  await page.getByLabel("가락 연주 악기", { exact: true }).selectOption("flute");
  const authored = await draft();
  for (const [measureIndex, pitches] of [[60, 64, 67, 72], [72, 60]].entries()) {
    for (const [noteIndex, pitch] of pitches.entries()) {
      const note = authored.measures[measureIndex].notes[noteIndex];
      await card(0, measureIndex).getByTestId(`practice-melody-${note.id}-${pitch}`).click();
    }
  }
  const melodyMeasures = (await draft()).measures;
  const reports = {};

  async function inspectEncoded(key, bytes) {
    const metadata = await page.evaluate(async ({ key, bytes }) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.src = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "video/mp4" }));
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.id = "practice-verification-frame";
      canvas.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;width:1280px;height:720px";
      document.body.append(canvas);
      window.practiceDecodedVideo = { video, canvas };
      window.practiceVideoSnapshots.encoded[key] = [];
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    }, { key, bytes });
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
    assert.ok(Math.abs(metadata.duration - 4) < 0.2, JSON.stringify(metadata));
    const frames = [];
    for (const seconds of times) {
      frames.push(await page.evaluate(async ({ key, seconds }) => {
        const { video, canvas } = window.practiceDecodedVideo;
        await new Promise((resolve, reject) => {
          video.onseeked = resolve;
          video.onerror = reject;
          video.currentTime = seconds;
        });
        const context = canvas.getContext("2d");
        context.drawImage(video, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        window.practiceVideoSnapshots.encoded[key].push(pixels);
        return { seconds, staffLines: window.practiceStaffLines(pixels, canvas.width, canvas.height) };
      }, { key, seconds }));
      if (seconds === 0.2 || seconds === 2.2) {
        await page.locator("#practice-verification-frame").screenshot({
          path: path.join(outputDir, `encoded-${key}-${seconds}.png`)
        });
      }
    }
    await page.evaluate(() => {
      const { video, canvas } = window.practiceDecodedVideo;
      URL.revokeObjectURL(video.src);
      canvas.remove();
      delete window.practiceDecodedVideo;
    });
    return { ...metadata, frames };
  }

  async function captureCase(name) {
    await page.getByRole("tab", { name: /음악 저장하기/ }).click();
    const modes = page.getByRole("group", { name: "MP4 저장 모드", exact: true });
    for (const mode of ["bars", "score"]) {
      const key = `${name}-${mode}`;
      await modes.getByRole("button", { name: mode === "bars" ? "막대 모드" : "악보 모드", exact: true }).click();
      const canvas = page.getByRole("img", { name: `${mode === "bars" ? "막대" : "악보"} 모드 영상 미리보기`, exact: true });
      await canvas.waitFor({ state: "visible" });
      const position = page.getByLabel("영상 미리보기 위치", { exact: true });
      await position.waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector('[aria-label="영상 미리보기 위치"]').disabled);
      await page.evaluate((key) => { window.practiceVideoSnapshots.previews[key] = []; }, key);
      const previews = [];
      for (const seconds of times) {
        await position.evaluate((input, seconds) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(input, String(seconds));
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }, seconds);
        await page.waitForFunction((seconds) => document.querySelector(".practice-video-preview output")
          ?.textContent.startsWith(seconds.toFixed(1)), seconds);
        previews.push(await canvas.evaluate((canvas, { key, seconds }) => {
          const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          window.practiceVideoSnapshots.previews[key].push(pixels);
          return {
            seconds,
            staffLines: window.practiceStaffLines(pixels, canvas.width, canvas.height),
            rhythmLabels: (window.practiceCanvasLabels.get(canvas) || []).filter((label) => label === "리듬").length
          };
        }, { key, seconds }));
      }
      await canvas.screenshot({ path: path.join(outputDir, `preview-${key}.png`) });
      const downloadEvent = page.waitForEvent("download", { timeout: 60000 });
      await page.getByRole("button", { name: "MP4 저장", exact: true }).click();
      const download = await downloadEvent;
      const filePath = path.join(outputDir, `${key}.mp4`);
      await download.saveAs(filePath);
      const bytes = await readFile(filePath);
      assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
      const encoded = await inspectEncoded(key, [...bytes]);
      reports[key] = { previews, encoded };
      assert.deepEqual((await draft()).rhythmLayers, retainedRhythms);
      assert.deepEqual((await draft()).measures, melodyMeasures);
    }
  }

  async function changeMode(name) {
    await page.getByRole("button", { name: "모드 바꾸기", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
  }

  await captureCase("combined");
  await changeMode("가락만들기");
  await captureCase("pure");
  await changeMode("리듬만들기");
  await captureCase("rhythm");

  const comparisons = await page.evaluate(() => {
    const compare = (left, right) => {
      let maximum = 0;
      let total = 0;
      for (let index = 0; index < left.length; index += 1) {
        const difference = Math.abs(left[index] - right[index]);
        maximum = Math.max(maximum, difference);
        total += difference;
      }
      return { maximum, mean: total / left.length };
    };
    return Object.fromEntries(["previews", "encoded"].map((kind) => [kind,
      Object.fromEntries(["bars", "score"].map((mode) => [mode,
        window.practiceVideoSnapshots[kind][`combined-${mode}`].map((frame, index) => ({
          melody: compare(frame, window.practiceVideoSnapshots[kind][`pure-${mode}`][index]),
          rhythm: compare(frame, window.practiceVideoSnapshots[kind][`rhythm-${mode}`][index])
        }))
      ]))
    ]));
  });
  for (const [kind, modes] of Object.entries(comparisons)) {
    for (const [mode, frames] of Object.entries(modes)) {
      assert.ok(frames.every((frame) => frame.melody.maximum === 0), JSON.stringify({ kind, mode, frames }));
      assert.ok(frames.every((frame) => frame.rhythm.mean > 1), JSON.stringify({ kind, mode, frames }));
    }
  }
  for (const name of ["combined", "pure"]) {
    assert.ok(reports[`${name}-bars`].previews.every((frame) => frame.rhythmLabels === 0));
    assert.ok(reports[`${name}-score`].previews.every((frame) => frame.staffLines.length === 5), JSON.stringify(reports));
    assert.ok(reports[`${name}-score`].encoded.frames.every((frame) => frame.staffLines.length === 5), JSON.stringify(reports));
  }
  assert.ok(reports["rhythm-bars"].previews.every((frame) => frame.rhythmLabels === 0), JSON.stringify(reports));
  assert.ok(reports["rhythm-score"].previews.every((frame) => frame.staffLines.length === 15), JSON.stringify(reports));
  assert.ok(reports["rhythm-score"].encoded.frames.every((frame) => frame.staffLines.length === 15), JSON.stringify(reports));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", comparisons, reports, outputs: outputDir }, null, 2));
} finally {
  await browser.close();
}
