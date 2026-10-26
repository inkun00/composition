import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = process.env.APP_URL ? null : await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server?.listen();
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const outputDir = path.resolve("artifacts/practice-video-choice");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const report = { baseUrl, errors: [], exports: [] };
let page;

async function inspectMp4(filePath) {
  const bytes = await readFile(filePath);
  assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
  return page.evaluate(async (base64) => {
    const blob = new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "auto";
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = reject;
    });
    await new Promise((resolve, reject) => {
      video.onseeked = resolve;
      video.onerror = reject;
      video.currentTime = .2;
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let black = 0;
    let white = 0;
    let colored = 0;
    let topVisible = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const [r, g, b] = data.subarray(offset, offset + 3);
        if (Math.max(r, g, b) < 15) black += 1;
        if (Math.min(r, g, b) > 220) white += 1;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 20) colored += 1;
        if (y < 140 && Math.max(r, g, b) > 30) topVisible += 1;
      }
    }
    let power = 0;
    const audioContext = new AudioContext();
    const audio = await audioContext.decodeAudioData(await blob.arrayBuffer());
    await audioContext.close();
    const samples = audio.getChannelData(0);
    for (const value of samples) power += value * value;
    const result = { width: canvas.width, height: canvas.height, blackRatio: black / (canvas.width * canvas.height),
      white, colored, topVisible, rms: Math.sqrt(power / samples.length), duration: video.duration,
      png: canvas.toDataURL("image/png") };
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    return result;
  }, bytes.toString("base64"));
}

try {
  for (const stage of ["rhythm", "melody"]) {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    page.setDefaultTimeout(30_000);
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.addInitScript((mode) => {
      const lyrics = Array.from("함께노래");
      localStorage.setItem("maeum-melody-practice-v1", JSON.stringify({
        version: 1, mode, title: "MP4 선택 검증", meter: { beats: 4, beatUnit: 4 }, bpm: 180,
        melodyInstrumentId: "piano", rhythmInstrumentId: "beat:woodblock", rhythmLayers: [],
        measures: [{ id: "practice-measure-1", chord: "C", lyric: lyrics.join(""),
          notes: lyrics.map((lyric, index) => ({ id: `choice-${index}`, pitch: [60, 64, 67, 72][index], lyric,
            duration: { numerator: 1, denominator: 1 } })) }]
      }));
    }, stage);
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "리듬·가락 직접 만들기", exact: false }).first().click();
    await page.getByTestId("practice-measure-card-0").waitFor();
    const together = stage === "rhythm" ? "리듬과 함께 재생" : "가락과 함께 재생";
    const mp4 = page.getByRole("button", { name: "음악 영상(MP4)", exact: true });
    let downloads = 0;
    page.on("download", () => downloads += 1);
    await mp4.click();
    const popup = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "가사만 재생", exact: true }) });
    await popup.waitFor();
    assert.equal(downloads, 0, "Opening the popup must not export");
    await popup.getByRole("button", { name: together, exact: true }).waitFor();
    await popup.screenshot({ path: path.join(outputDir, `${stage}-popup-desktop.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await popup.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 845);
    await page.screenshot({ path: path.join(outputDir, `${stage}-popup-mobile.png`) });
    await page.keyboard.press("Escape");
    await popup.waitFor({ state: "hidden" });
    assert.equal(downloads, 0, "Closing the popup must not export");
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const choice of ["lyrics", "music"]) {
      await mp4.click();
      const downloading = page.waitForEvent("download", { timeout: 90_000 });
      await popup.getByRole("button", { name: choice === "lyrics" ? "가사만 재생" : together, exact: true }).click();
      const download = await downloading;
      const filePath = path.join(outputDir, `${stage}-${choice}.mp4`);
      await download.saveAs(filePath);
      const media = await inspectMp4(filePath);
      await writeFile(path.join(outputDir, `${stage}-${choice}.png`), Buffer.from(media.png.split(",")[1], "base64"));
      delete media.png;
      assert.equal(media.width, 1280);
      assert.equal(media.height, 720);
      assert.ok(media.rms > .001, "Both choices must retain the original music audio");
      if (choice === "lyrics") {
        assert.ok(media.blackRatio > .95, "Lyrics-only background must be black");
        assert.ok(media.white > 500, "Lyrics must be white and visible");
        assert.ok(media.colored < 20, "Lyrics-only must have no colored bars or highlights");
        assert.equal(media.topVisible, 0, "Lyrics-only must omit the header and other decorations");
      } else assert.ok(media.colored > 100, "Together mode must keep the music visualization");
      report.exports.push({ stage, choice, ...media });
      await mp4.waitFor({ state: "visible" });
      assert.equal(await mp4.isEnabled(), true);
    }
    assert.equal(downloads, 2);
    await page.close();
  }
  assert.deepEqual(report.errors, []);
  report.result = "passed";
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  await page?.screenshot({ path: path.join(outputDir, "failure.png") }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await server?.close();
}
