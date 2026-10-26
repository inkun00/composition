import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4188/";
const outputDir = path.resolve("artifacts/mp4-import-regression");
await mkdir(outputDir, { recursive: true });
const buildGraph = await inspectBuildGraph();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const report = { baseUrl, buildGraph, blockedJavaScript: [], pageErrors: [], exports: [] };
let page;

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  await page.addInitScript(() => {
    const syllables = ["높", "은", "가", "락"];
    localStorage.setItem("maeum-melody-practice-v1", JSON.stringify({
      version: 1, mode: "melody", title: "MP4 모듈 회귀 검증", meter: { beats: 4, beatUnit: 4 }, bpm: 120,
      melodyInstrumentId: "piano", rhythmInstrumentId: "beat:woodblock", rhythmLayers: [],
      measures: [{ id: "practice-measure-1", chord: "C", lyric: syllables.join(""), notes:
        [60, 64, 67, 84].map((pitch, index) => ({
          id: `regression-note-${index}`, pitch, lyric: syllables[index],
          duration: { numerator: 1, denominator: 1 }
        })) }]
    }));
  });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "리듬·가락 직접 만들기", exact: false }).first().click();
  await page.getByTestId("practice-measure-card-0").waitFor();
  // The staff and its fonts are part of the initial editor. Once ready, emulate a
  // deployment that has removed every JavaScript file not fetched by this page.
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.route("**/assets/*.js", async (route) => {
    report.blockedJavaScript.push(route.request().url());
    await route.fulfill({ status: 404, contentType: "text/plain", body: "Old deployment chunk removed" });
  });
  await page.getByRole("tab", { name: /음악 저장하기/ }).click();
  const modes = page.getByRole("group", { name: "MP4 저장 모드", exact: true });
  for (const [mode, title] of [["bars", "막대 모드"], ["score", "악보 모드"]]) {
    await modes.getByRole("button", { name: title, exact: true }).click();
    await page.getByRole("img", { name: `${title} 영상 미리보기`, exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[aria-label="영상 미리보기 위치"]')?.disabled);
    const downloadEvent = page.waitForEvent("download", { timeout: 90_000 });
    await page.getByRole("button", { name: "음악 영상(MP4)", exact: true }).click();
    await page.getByRole("button", { name: "가락과 함께 재생", exact: true }).click();
    const download = await downloadEvent;
    const filePath = path.join(outputDir, `${mode}.mp4`);
    await download.saveAs(filePath);
    const bytes = await readFile(filePath);
    assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
    assert.ok(bytes.length > 10_000);
    const metadata = await page.evaluate(async (bytes) => {
      const blob = new Blob([Uint8Array.from(bytes)], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      try {
        const video = document.createElement("video");
        video.src = url;
        await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
        const context = new AudioContext();
        const audio = await context.decodeAudioData(await blob.arrayBuffer());
        await context.close();
        const samples = audio.getChannelData(0);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, rms };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, [...bytes]);
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
    assert.ok(Math.abs(metadata.duration - 2) < .2);
    assert.ok(metadata.rms > .001);
    report.exports.push({ mode, bytes: bytes.length, fileName: download.suggestedFilename(), ...metadata });
    await page.getByRole("img", { name: `${title} 영상 미리보기`, exact: true })
      .screenshot({ path: path.join(outputDir, `${mode}-preview.png`) });
    await page.waitForFunction(() => ![...document.querySelectorAll("button")]
      .find((button) => button.textContent.includes("음악 영상(MP4)"))?.disabled);
  }
  assert.deepEqual(report.blockedJavaScript, [], "Export must not fetch JavaScript after the app has loaded");
  assert.deepEqual(report.pageErrors, []);
  report.result = "passed";
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  await page?.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

async function inspectBuildGraph() {
  const distDir = path.resolve("dist");
  const html = await readFile(path.join(distDir, "index.html"), "utf8");
  const entries = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)]
    .map((match) => path.join(distDir, match[1].replace(/^\//, "")));
  assert.ok(entries.length, "Build HTML must have an application entry");
  const loaded = new Map();
  const visit = async (file) => {
    if (loaded.has(file)) return;
    const source = await readFile(file, "utf8");
    loaded.set(file, source);
    // Static ESM dependencies are downloaded with the entry, before the app runs.
    for (const match of source.matchAll(/\b(?:from|import)\s*["'](\.\/[^"']+\.js)["']/g)) {
      await visit(path.resolve(path.dirname(file), match[1]));
    }
  };
  for (const entry of entries) await visit(entry);
  const initialSource = [...loaded.values()].join("\n");
  for (const marker of [
    "화면으로 연습 곡 MP4를 만들고 있어요.", "악보 화면을 만들 수 없어요.",
    "source must be a VideoSource.", "audioBuffer must be an AudioBuffer."
  ]) {
    assert.ok(initialSource.includes(marker), `Initial ESM graph must include the MP4 dependency: ${marker}`);
  }
  const lateTargets = [...loaded.values()].flatMap((source) =>
    [...source.matchAll(/\bimport\(\s*["']([^"']+\.js)["']\s*\)/g)].map((match) => match[1]));
  assert.ok(lateTargets.every((target) => !/exportPracticeVideoMp4|practiceVideoScore|exportCompositionLyricsMp4|exportLyricMp4/.test(target)),
    "MP4 export modules must not remain behind deployment-sensitive lazy imports");
  return { initialAssets: [...loaded.keys()].map((file) => path.relative(distDir, file)),
    initialJavaScriptBytes: [...loaded.values()].reduce((bytes, source) => bytes + Buffer.byteLength(source), 0),
    optionalLateModules: lateTargets.length };
}
