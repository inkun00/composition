import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4174/";
const outputDir = path.resolve("artifacts/practice-direct-melody");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.practicePlaybackBuffers = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.context instanceof AudioContext && this.buffer) {
        window.practicePlaybackBuffers.push({
          duration: this.buffer.duration,
          sampleRate: this.buffer.sampleRate,
          samples: new Float32Array(this.buffer.getChannelData(0))
        });
      }
      return start.apply(this, args);
    };
  });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("1");
  await page.getByLabel("연습 빠르기", { exact: true }).selectOption("60");
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1")));
  const main = page.getByTestId("practice-score-workspace-0");
  const tools = main.getByTestId("practice-score-tools-0");
  const preview = page.getByTestId("practice-measure-preview-0");
  const melodyTab = page.getByRole("tab", { name: /가락 만들기/ });
  const rhythmTab = page.getByRole("tab", { name: /리듬 만들기/ });
  const empty = await draft();
  assert.ok(empty.measures.every((measure) => measure.notes.length === 0));
  assert.equal(await melodyTab.isEnabled(), true);
  await page.getByRole("button", { name: "가락 만들기로", exact: true }).click();
  assert.equal(await melodyTab.getAttribute("aria-selected"), "true");
  assert.deepEqual(await draft(), empty);
  assert.equal(await preview.innerText(), "미리 듣기");
  assert.equal(await preview.getAttribute("aria-label"), "1마디 가락 미리 듣기");
  assert.equal(await preview.isEnabled(), false);

  await page.getByLabel("가락 연주 악기", { exact: true }).selectOption("flute");
  await tools.getByTestId("practice-duration-0.25").click();
  const first = (await draft()).measures[0].notes[0];
  await page.getByTestId(`practice-melody-${first.id}-67`).click();
  await tools.getByTestId("practice-duration-1").click();
  const second = (await draft()).measures[0].notes[1];
  await page.getByTestId(`practice-melody-${second.id}-64`).click();
  const partial = await draft();
  assert.deepEqual(partial.measures[0].notes.map((note) => note.pitch), [67, 64]);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole("button", { name: "MP4 저장", exact: true }).isEnabled(), false);

  async function capture() {
    const count = await page.evaluate(() => window.practicePlaybackBuffers.length);
    await preview.click();
    await page.waitForFunction((before) => window.practicePlaybackBuffers.length > before, count);
    await page.getByRole("button", { name: "1마디 연주 멈추기", exact: true }).click();
    return count;
  }

  const melodyBuffer = await capture();
  await rhythmTab.click();
  assert.deepEqual(await draft(), partial);
  assert.equal(await preview.innerText(), "미리듣기");
  await page.getByLabel("리듬 연주 악기", { exact: true }).selectOption("flute");
  const rhythmBuffer = await capture();
  await page.getByRole("button", { name: /악보 추가하기/ }).click();
  await page.getByLabel("2번 악보 리듬 연주 악기", { exact: true }).selectOption("beat:clap");
  await page.getByTestId("practice-score-tools-1").getByTestId("practice-duration-1").click();
  const extra = (await draft()).rhythmLayers;
  await melodyTab.click();
  assert.equal(await page.getByTestId("practice-score-select-0").getAttribute("aria-pressed"), "true");
  assert.equal(await preview.innerText(), "미리 듣기");
  assert.equal(await page.getByTestId("practice-score-1-measure-preview-0").innerText(), "미리듣기");
  assert.deepEqual((await draft()).measures, partial.measures);
  const isolatedMelodyBuffer = await capture();
  assert.deepEqual((await draft()).rhythmLayers, extra);

  const media = await page.evaluate(({ melodyBuffer, rhythmBuffer, isolatedMelodyBuffer }) => {
    const buffers = window.practicePlaybackBuffers;
    const frequencyAt = (buffer, seconds) => {
      const start = Math.floor(buffer.sampleRate * seconds);
      const length = 4096;
      let bestFrequency = 0;
      let bestPower = 0;
      for (let frequency = 240; frequency <= 545; frequency += 1) {
        let real = 0;
        let imaginary = 0;
        for (let index = 0; index < length; index += 1) {
          const value = (buffer.samples[start + index] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * index / (length - 1)));
          const angle = 2 * Math.PI * frequency * index / buffer.sampleRate;
          real += value * Math.cos(angle);
          imaginary += value * Math.sin(angle);
        }
        const power = real ** 2 + imaginary ** 2;
        if (power > bestPower) {
          bestPower = power;
          bestFrequency = frequency;
        }
      }
      return bestFrequency;
    };
    const melody = buffers[melodyBuffer];
    const rhythm = buffers[rhythmBuffer];
    const isolated = buffers[isolatedMelodyBuffer];
    let isolationError = 0;
    for (let index = 0; index < melody.samples.length; index += 1) {
      isolationError = Math.max(isolationError, Math.abs(melody.samples[index] - isolated.samples[index]));
    }
    return {
      melodyFrequencies: [0.035, 0.35].map((seconds) => frequencyAt(melody, seconds)),
      rhythmFrequencies: [0.035, 0.35].map((seconds) => frequencyAt(rhythm, seconds)),
      melodyDuration: melody.duration,
      rhythmDuration: rhythm.duration,
      isolationError,
      isolatedDuration: isolated.duration
    };
  }, { melodyBuffer, rhythmBuffer, isolatedMelodyBuffer });
  for (const [index, expected] of [392, 330].entries()) {
    assert.ok(Math.abs(media.melodyFrequencies[index] - expected) < 12, JSON.stringify(media));
  }
  assert.ok(media.rhythmFrequencies.every((frequency) => Math.abs(frequency - 523) < 12), JSON.stringify(media));
  assert.ok(Math.abs(media.melodyDuration - 1.25) < 0.01, JSON.stringify(media));
  assert.ok(Math.abs(media.rhythmDuration - 1.25) < 0.01, JSON.stringify(media));
  assert.equal(media.isolatedDuration, media.melodyDuration);
  assert.ok(media.isolationError < 0.000001, JSON.stringify(media));

  // Finish the melody created from scratch; incomplete rhythm layers still prevent export.
  await tools.getByTestId("practice-rest-0.25").click();
  await tools.getByTestId("practice-duration-0.5").click();
  await tools.getByTestId("practice-duration-2").click();
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  await page.getByTestId("practice-score-tools-1").getByTestId("practice-duration-3").click();
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole("button", { name: "MP4 저장", exact: true }).isEnabled(), true);
  const completed = await draft();
  await page.screenshot({ path: path.join(outputDir, "direct-melody-desktop.png"), fullPage: true });
  await rhythmTab.click();
  await melodyTab.click();
  assert.deepEqual(await draft(), completed);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "direct-melody-mobile.png"), fullPage: true });
  const mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
    previewsFit: [...document.querySelectorAll(".practice-measure-preview")].every((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    })
  }));
  assert.equal(mobile.width, mobile.viewport);
  assert.equal(mobile.previewsFit, true);
  await page.getByRole("tab", { name: /음악 저장하기/ }).click();
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "가락 편집으로", exact: true }).click();
  assert.deepEqual(await draft(), completed);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", media, mobile, screenshots: outputDir }, null, 2));
} finally {
  await browser.close();
}
