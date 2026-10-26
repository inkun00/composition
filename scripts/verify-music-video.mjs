import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = process.env.APP_URL ? null : await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server?.listen();
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/music-video");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--autoplay-policy=no-user-gesture-required"]
});
const errors = [];
const report = { baseUrl, errors };
let page;

async function draw(tool, from, to) {
  await page.getByRole("button", { name: tool, exact: true }).click();
  const box = await page.getByTestId("scene-paint-canvas").boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 16 });
  await page.mouse.up();
}

async function exportVideo(animated) {
  await page.getByTestId("create-music-video").click();
  await page.getByRole("radio", { name: animated ? /애니메이션 있음/ : /애니메이션 없음/ }).check();
  await page.getByRole("dialog", { name: "그림에 움직임을 더할까요?" }).screenshot({
    path: path.join(outputDir, animated ? "animated-choice.png" : "static-choice.png")
  });
  const downloaded = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("confirm-music-video").click();
  await page.getByRole("progressbar", { name: "뮤직비디오 만들기 진행률" }).waitFor();
  const download = await downloaded;
  const name = animated ? "animated.mp4" : "static.mp4";
  await download.saveAs(path.join(outputDir, name));
  await page.getByTestId("create-music-video").waitFor({ state: "visible" });
  const bytes = await readFile(path.join(outputDir, name));
  assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
  assert.ok(bytes.length > 100_000);
  const media = await page.evaluate(async ({ base64, intro }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "auto";
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = reject;
    });
    const capture = async (time) => {
      await new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.onerror = reject;
        video.currentTime = time;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      return { data: ctx.getImageData(0, 0, 1280, 720).data, png: canvas.toDataURL("image/png") };
    };
    const early = await capture(intro + .04);
    const later = await capture(intro + .2);
    const second = await capture(intro + 16 * 60 / 180 + .1);
    let changed = 0;
    for (let y = 80; y < 600; y += 1) {
      for (let x = 50; x < 1150; x += 1) {
        const offset = (y * 1280 + x) * 4;
        if (Math.abs(early.data[offset] - later.data[offset]) + Math.abs(early.data[offset + 1] - later.data[offset + 1]) +
          Math.abs(early.data[offset + 2] - later.data[offset + 2]) > 100) changed += 1;
      }
    }
    const pixel = (data) => Array.from(data.slice((200 * 1280 + 1200) * 4, (200 * 1280 + 1200) * 4 + 3));
    let square = 0;
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    await context.close();
    const samples = decoded.getChannelData(0);
    for (const value of samples) square += value * value;
    const boxText = new TextDecoder("latin1").decode(bytes);
    const result = { width: video.videoWidth, height: video.videoHeight,
      videoCodec: boxText.includes("avc1") ? "avc" : null, audioCodec: boxText.includes("mp4a") ? "aac" : null,
      duration: video.duration, rms: Math.sqrt(square / samples.length), changedPixels: changed,
      firstColor: pixel(early.data), secondColor: pixel(second.data), firstPng: early.png, secondPng: second.png };
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    return result;
  }, { base64: bytes.toString("base64"), intro: report.seed.intro });
  await writeFile(path.join(outputDir, `${name}-first.png`), Buffer.from(media.firstPng.split(",")[1], "base64"));
  await writeFile(path.join(outputDir, `${name}-second.png`), Buffer.from(media.secondPng.split(",")[1], "base64"));
  delete media.firstPng;
  delete media.secondPng;
  assert.equal(media.videoCodec, "avc");
  assert.equal(media.audioCodec, "aac");
  assert.ok(media.rms > .001);
  assert.ok(Math.abs(media.duration - report.seed.duration) < .15);
  assert.ok(media.firstColor[1] > media.firstColor[2] + 5, "First scene must have green background");
  assert.ok(media.secondColor[2] > media.secondColor[0] + 10, "Second scene must have blue background");
  if (animated) assert.ok(media.changedPixels > 200, "Animated drawing must actually move between lyric boundaries");
  else assert.ok(media.changedPixels < 50, "Static drawing must stay still between lyric boundaries");
  return { ...media, bytes: bytes.length };
}

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}?start=new`);
  report.seed = await page.evaluate(() => {
    const words = ["달려보자", "우리함께", "햇살가득", "꿈을그려", "하늘높이", "구름따라", "노래하며", "친구안녕"];
    const measures = words.map((word, index) => ({
      candidateId: "custom", candidateName: "뮤직비디오 검증", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word).map((lyric, n) => ({ id: `mv-${index}-${n}`, pitch: [60, 64, 67, 64][n],
        lyric, duration: { numerator: 1, denominator: 1 } }))
    }));
    const draft = { version: 1, updatedAt: Date.now(), sourceHash: "", title: "우리가 그린 노래", creator: "검증",
      originalCreator: "", presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      bpm: 180, lyrics: words, measures, showArrangement: true };
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify(draft));
    return { intro: .08 + 16 * 60 / 180, duration: .08 + 64 * 60 / 180 + .8 };
  });
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  const measureOptions = await page.getByTestId("scene-end-measure").locator("option").allTextContents();
  assert.equal(measureOptions.length, 8, "Each measure must have exactly one endpoint choice");
  assert.ok(measureOptions.every((label) => !label.includes("번째 가사") && !label.includes("’까지")));
  report.measureChoices = measureOptions;
  await page.getByLabel("도화지 색", { exact: true }).fill("#e2f3e9");
  await page.getByLabel("붓 굵기", { exact: true }).fill("35");
  await draw("동그라미", [.25, .25], [.45, .65]);
  await page.getByTestId("add-music-video-scene").click();
  await page.getByLabel("도화지 색", { exact: true }).fill("#e5efff");
  await draw("네모", [.4, .3], [.65, .65]);
  await page.getByRole("button", { name: "1번 장면 선택" }).click();
  await page.getByRole("dialog", { name: "장면 그리기", exact: true }).screenshot({ path: path.join(outputDir, "desktop-studio.png") });
  await page.getByRole("button", { name: "움직임 미리보기", exact: true }).click();
  await page.getByRole("button", { name: "미리보기 멈추기", exact: true }).click();
  await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
  await page.waitForFunction(() => {
    const draft = JSON.parse(localStorage.getItem("maeum-melody:draft:v1"));
    return draft?.musicVideoScenes?.length === 2 && draft.musicVideoScenes.every((scene) => scene.elements.length === 1);
  });
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  assert.equal(await page.locator(".mv-scene-card").count(), 2);
  report.persistence = true;
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.locator(".mv-studio").evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  assert.equal(overflow, false, "Mobile studio must fit the screen");
  await page.screenshot({ path: path.join(outputDir, "mobile-studio.png") });
  await page.getByRole("button", { name: "장면 설정 보기", exact: true }).click();
  await page.getByTestId("scene-end-measure").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(outputDir, "mobile-settings.png") });
  await page.getByRole("button", { name: "그림판 보기", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  report.static = await exportVideo(false);
  report.animated = await exportVideo(true);
  await page.getByTestId("create-music-video").click();
  await page.getByTestId("confirm-music-video").click();
  await page.getByRole("button", { name: "만들기 취소", exact: true }).click();
  await page.getByTestId("create-music-video").waitFor();
  assert.match(await page.locator(".mv-footer").innerText(), /취소/);
  report.cancellation = true;
  assert.deepEqual(errors, []);
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await page?.screenshot({ path: path.join(outputDir, "failure.png") }).catch(() => undefined);
  throw error;
} finally {
  await browser.close();
  await server?.close();
}
