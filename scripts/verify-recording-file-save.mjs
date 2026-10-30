import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// Only microphone capture is replaced, inside this test server's transform.
// The production source, MP3 processing, recording matching and MP4 encoder stay real.
const syntheticRecording = `
import { encodeAudioBufferToMp3 as encodeFixtureMp3 } from "./audioExport";
export async function recordKaraokeComposition(measures, _instrument, bpm, _accompaniment, callbacks = {}, _countIn, signal) {
  if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
  const introSeconds = .3;
  const songSeconds = measures.flatMap(measure => measure.notes).reduce((sum, note) =>
    sum + note.duration.numerator / note.duration.denominator * 60 / bpm, 0);
  const durationSeconds = introSeconds + songSeconds + .4;
  const sampleRate = 48000;
  const length = Math.ceil(durationSeconds * sampleRate);
  const audioBuffer = new AudioBuffer({ length, sampleRate, numberOfChannels: 2 });
  const vocalAudioBuffer = new AudioBuffer({ length, sampleRate, numberOfChannels: 1 });
  const backingAudioBuffer = new AudioBuffer({ length, sampleRate, numberOfChannels: 2 });
  for (let index = 0; index < length; index += 1) {
    const seconds = index / sampleRate;
    const singing = seconds >= introSeconds && seconds < introSeconds + songSeconds;
    const voice = singing ? Math.sin(2 * Math.PI * 657 * seconds) * .16 : 0;
    const backing = Math.sin(2 * Math.PI * 219 * seconds) * .055;
    vocalAudioBuffer.getChannelData(0)[index] = voice;
    for (let channel = 0; channel < 2; channel += 1) {
      backingAudioBuffer.getChannelData(channel)[index] = backing;
      audioBuffer.getChannelData(channel)[index] = voice + backing;
    }
  }
  callbacks.onPhase?.("done");
  callbacks.onStatus?.("테스트 녹음을 준비했어요.");
  window.__recordingFixture = { introSeconds, songSeconds, durationSeconds };
  return { blob: encodeFixtureMp3(audioBuffer), audioBuffer, vocalAudioBuffer,
    backingAudioBuffer, durationSeconds, introSeconds };
}
`;

let mockedModules = 0;
const server = await createServer({
  optimizeDeps: { entries: ["index.html"] },
  plugins: [{
    name: "test-only-synthetic-song-recording",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0].replaceAll("\\", "/").endsWith("/src/audio/player.ts")) return null;
      const original = "export async function recordKaraokeComposition(";
      assert.ok(code.includes(original), "The recording test override must target the real capture function");
      mockedModules += 1;
      return code.replace(original, "export async function originalRecordKaraokeComposition(") + syntheticRecording;
    }
  }],
  server: { host: "127.0.0.1", port: 0 }
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const outputDir = path.resolve("artifacts/recording-file-save");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const report = { baseUrl, errors: [], downloads: [] };
let page;

async function seedPage(withVideo) {
  const next = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page = next;
  next.setDefaultTimeout(30_000);
  next.on("pageerror", (error) => report.errors.push(error.message));
  await next.addInitScript((includeScenes) => {
    const words = ["함께노래", "우리친구", "햇살가득", "꿈을그려", "하늘높이", "구름따라", "노래하며", "친구안녕"];
    const measures = words.map((word, index) => ({
      candidateId: "custom", candidateName: "녹음 저장 검증", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word).map((lyric, n) => ({ id: `record-${index}-${n}`, pitch: [60, 64, 67, 64][n],
        lyric, duration: { numerator: 1, denominator: 1 } }))
    }));
    const scenes = ["#c2efda", "#bed5ff"].map((background, index) => ({
      id: `record-scene-${index}`, background, motion: "still", endLyric: null,
      startMeasureIndex: index * 4, endMeasureIndex: index * 4 + 3,
      elements: [{ id: `record-shape-${index}`, tool: "rectangle", color: "#cf3c55", width: 24,
        points: [[200, 140, .5], [650, 400, .5]] }]
    }));
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify({
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "녹음 파일 선택 검증", creator: "테스트",
      originalCreator: "", presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      bpm: 180, lyrics: words, measures, musicVideoScenes: includeScenes ? scenes : [], showArrangement: true
    }));
    navigator.mediaDevices.getUserMedia = async () => { throw new Error("This test must never access a microphone"); };
  }, withVideo);
  await next.goto(baseUrl);
  await next.getByRole("button", { name: "이어 만들기", exact: true }).click();
  await next.getByRole("tab", { name: "저장·발표", exact: true }).click();
  await next.getByRole("button", { name: "노래 녹음", exact: true }).click();
  await next.getByRole("button", { name: "합창 녹음", exact: false }).click();
  await next.getByRole("button", { name: "합창 녹음 시작", exact: true }).click();
  await next.locator(".karaoke-post-panel audio").waitFor();
  await next.getByRole("button", { name: "이 느낌으로 파일 저장", exact: true }).waitFor({ state: "visible" });
  return next;
}

async function inspectAudio(bytes) {
  return page.evaluate(async (base64) => {
    const context = new AudioContext();
    const audio = await context.decodeAudioData(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer);
    await context.close();
    const samples = audio.getChannelData(0);
    let energy = 0;
    for (const value of samples) energy += value * value;
    const magnitude = (frequency) => {
      let real = 0;
      let imaginary = 0;
      const start = Math.round(audio.sampleRate * 1);
      const end = Math.min(samples.length, start + Math.round(audio.sampleRate));
      for (let index = start; index < end; index += 1) {
        const phase = 2 * Math.PI * frequency * index / audio.sampleRate;
        real += samples[index] * Math.cos(phase);
        imaginary += samples[index] * Math.sin(phase);
      }
      return Math.hypot(real, imaginary) / (end - start);
    };
    return { duration: audio.duration, rms: Math.sqrt(energy / samples.length),
      voice: magnitude(657), backing: magnitude(219), unrelated: magnitude(440) };
  }, bytes.toString("base64"));
}

async function inspectVideo(bytes) {
  return page.evaluate(async (base64) => {
    const blob = new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = url;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const captures = [];
    const fixture = window.__recordingFixture;
    for (const seconds of [fixture.introSeconds + .4, fixture.introSeconds + fixture.songSeconds / 2 + .4]) {
      await new Promise((resolve, reject) => { video.onseeked = resolve; video.onerror = reject; video.currentTime = seconds; });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const offset = (200 * canvas.width + 1200) * 4;
      let paintedPixels = 0;
      for (let y = 90; y < 600; y += 1) {
        for (let x = 100; x < 1000; x += 1) {
          const at = (y * canvas.width + x) * 4;
          if (data[at] > data[at + 1] + 60 && data[at] > data[at + 2] + 20) paintedPixels += 1;
        }
      }
      captures.push({ seconds, background: Array.from(data.slice(offset, offset + 3)),
        paintedPixels, png: canvas.toDataURL("image/png") });
    }
    const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration, captures };
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    return result;
  }, bytes.toString("base64"));
}

try {
  page = await seedPage(true);
  const sourceBefore = await page.locator(".karaoke-post-panel audio").getAttribute("src");
  await page.getByRole("button", { name: "더 부드럽게", exact: true }).click();
  await page.waitForFunction((previous) => document.querySelector(".karaoke-post-panel audio")?.src !== previous, sourceBefore);
  const sourceAfter = await page.locator(".karaoke-post-panel audio").getAttribute("src");
  assert.notEqual(sourceBefore, sourceAfter, "Post-processing must produce a new recording source");
  const processedBytes = Buffer.from(await page.evaluate(async (url) =>
    Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), sourceAfter));
  let downloads = 0;
  page.on("download", () => downloads += 1);
  const save = page.getByRole("button", { name: "이 느낌으로 파일 저장", exact: true });
  await save.click();
  const dialog = page.getByRole("dialog", { name: "녹음 파일로 저장", exact: true });
  await dialog.waitFor();
  assert.equal(downloads, 0, "Opening the popup must not download a file");
  assert.equal(await dialog.getByRole("button", { name: "뮤직비디오와 MP4로 저장", exact: true }).isEnabled(), true);
  await dialog.screenshot({ path: path.join(outputDir, "format-choice-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await dialog.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 845);
  await page.screenshot({ path: path.join(outputDir, "format-choice-mobile.png") });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.equal(downloads, 0, "Canceling must leave the recording unsaved");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await save.click();
  let downloading = page.waitForEvent("download", { timeout: 120_000 });
  await dialog.getByRole("button", { name: "MP3로 저장", exact: true }).click();
  const mp3 = await downloading;
  const mp3Path = path.join(outputDir, "processed-recording.mp3");
  await mp3.saveAs(mp3Path);
  const mp3Bytes = await readFile(mp3Path);
  assert.equal(createHash("sha256").update(mp3Bytes).digest("hex"), createHash("sha256").update(processedBytes).digest("hex"),
    "MP3 must download the current processed recording, not the raw take");
  const mp3Audio = await inspectAudio(mp3Bytes);
  assert.ok(mp3Audio.voice > .01 && mp3Audio.voice > mp3Audio.unrelated * 100);
  report.downloads.push({ format: "mp3", bytes: mp3Bytes.length, audio: mp3Audio });

  await save.click();
  downloading = page.waitForEvent("download", { timeout: 180_000 });
  await dialog.getByRole("button", { name: "뮤직비디오와 MP4로 저장", exact: true }).click();
  await dialog.getByRole("progressbar", { name: "녹음 뮤직비디오 만들기 진행률", exact: true }).waitFor();
  const mp4 = await downloading;
  const mp4Path = path.join(outputDir, "recording-music-video.mp4");
  await mp4.saveAs(mp4Path);
  const mp4Bytes = await readFile(mp4Path);
  assert.equal(mp4Bytes.subarray(4, 8).toString(), "ftyp");
  const mp4Audio = await inspectAudio(mp4Bytes);
  assert.ok(mp4Audio.voice > .01 && mp4Audio.voice > mp4Audio.unrelated * 100,
    "The MP4 must contain the synthetic recorded voice rather than regenerated instrumental music");
  assert.ok(Math.abs(mp4Audio.rms - mp3Audio.rms) / mp3Audio.rms < .15, "The MP4 must retain the processed mix level");
  const media = await inspectVideo(mp4Bytes);
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.ok(Math.abs(media.duration - mp3Audio.duration) < .15);
  assert.ok(media.captures[0].background[1] > media.captures[0].background[2] + 10);
  assert.ok(media.captures[1].background[2] > media.captures[1].background[0] + 20);
  for (const [index, capture] of media.captures.entries()) {
    assert.ok(capture.paintedPixels > 500, "The video must contain the authored drawing");
    await writeFile(path.join(outputDir, `recording-scene-${index + 1}.png`), Buffer.from(capture.png.split(",")[1], "base64"));
    delete capture.png;
  }
  report.downloads.push({ format: "mp4", bytes: mp4Bytes.length, audio: mp4Audio, ...media });
  assert.equal(downloads, 2);
  await page.close();

  page = await seedPage(false);
  await page.getByRole("button", { name: "이 느낌으로 파일 저장", exact: true }).click();
  const unavailable = page.getByRole("dialog", { name: "녹음 파일로 저장", exact: true });
  assert.equal(await unavailable.getByRole("button", { name: "뮤직비디오와 MP4로 저장", exact: true }).isEnabled(), false);
  assert.equal(await unavailable.getByRole("button", { name: "MP3로 저장", exact: true }).isEnabled(), true);
  assert.ok((await unavailable.textContent()).includes("장면을 먼저 만들어"));
  await unavailable.screenshot({ path: path.join(outputDir, "no-video-choice.png") });
  assert.ok(mockedModules > 0);
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
  await server.close();
}
