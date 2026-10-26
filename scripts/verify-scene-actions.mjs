import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = process.env.APP_URL ? null : await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server?.listen();
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-actions");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const errors = [];
const report = { baseUrl, errors };
let page;

async function verifyActionEditor() {
  await page.getByTestId("scene-action-editor").waitFor();
  await page.getByTestId("scene-actor-select").selectOption("finger");
  await page.getByText("포함할 선 선택", { exact: false }).click();
  assert.equal(await page.getByRole("checkbox", { name: "3번 선 포함", exact: true }).isChecked(), true);
  assert.equal(await page.getByRole("checkbox", { name: "1번 선 포함", exact: true }).isChecked(), false);
  await page.getByRole("checkbox", { name: "1번 선 포함", exact: true }).check();
  await page.getByRole("checkbox", { name: "1번 선 포함", exact: true }).uncheck();
  await page.getByLabel("1번 동작 종류", { exact: true }).selectOption("bend");
  await page.getByLabel("1번 동작 종류", { exact: true }).selectOption("press");
  await page.getByLabel("장면 동작 설명", { exact: true }).fill("손가락이 스위치를 누르고 원래 자세로 돌아와요");
  await page.getByLabel("1번 동작 길이", { exact: true }).click();
  await page.getByTestId("scene-recommend-actions").click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="scene-action-card"]').length > 1);
  report.recommendedActions = await page.getByTestId("scene-action-card").count() - 1;
  while (await page.getByTestId("scene-action-card").count() > 1) {
    await page.getByTestId("scene-action-card").last().getByRole("button", { name: /동작 삭제/ }).click();
  }
  await page.getByTestId("scene-actor-select").selectOption("light");
  while (await page.getByTestId("scene-action-card").count() > 1) {
    await page.getByTestId("scene-action-card").last().getByRole("button", { name: /동작 삭제/ }).click();
  }
  await page.getByTestId("scene-actor-select").selectOption("finger");
  const endHandle = page.getByTestId("scene-handle-endPoint");
  await endHandle.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => {
    const scene = JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes?.[0];
    return scene?.choreography?.description === "손가락이 스위치를 누르고 원래 자세로 돌아와요" &&
      scene.choreography.actions.length === 2 && scene.choreography.actions[0].kind === "press" &&
      scene.choreography.actors[0].elementIds.length === 1;
  });
  report.seed.scene = await page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")).musicVideoScenes[0]);
  report.actionEditor = true;
}

async function verifyPreview() {
  const time = page.getByLabel("움직임 미리보기 시간", { exact: true });
  const setTime = async (value) => {
    await time.evaluate((element, next) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, String(next));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await page.waitForTimeout(150);
  };
  const canvas = page.getByLabel("장면 움직임 미리보기", { exact: true });
  await setTime(.01);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[aria-label="장면 움직임 미리보기"]');
    if (!canvas) return false;
    const pixel = canvas.getContext("2d").getImageData(430, 400, 1, 1).data;
    return pixel[0] > 120 && pixel[0] > pixel[1] + 70;
  });
  await canvas.evaluate((element) => {
    window.__sceneActionFirst = element.getContext("2d").getImageData(0, 0, 1280, 720).data;
  });
  await canvas.screenshot({ path: path.join(outputDir, "preview-first.png") });
  await setTime(.3);
  const changes = await canvas.evaluate((element) => {
    const before = window.__sceneActionFirst;
    const after = element.getContext("2d").getImageData(0, 0, 1280, 720).data;
    const count = (rectangle) => {
      let changed = 0;
      for (let y = Math.ceil(rectangle[1] * 4 / 3); y < Math.floor(rectangle[3] * 4 / 3); y += 1) {
        for (let x = Math.ceil(rectangle[0] * 4 / 3); x < Math.floor(rectangle[2] * 4 / 3); x += 1) {
          const index = (y * 1280 + x) * 4;
          if (Math.abs(before[index] - after[index]) + Math.abs(before[index + 1] - after[index + 1]) +
            Math.abs(before[index + 2] - after[index + 2]) > 100) changed += 1;
        }
      }
      return changed;
    };
    const actorBounds = [1280, 720, 0, 0];
    for (let y = 320; y < 493; y += 1) {
      for (let x = 333; x < 706; x += 1) {
        const index = (y * 1280 + x) * 4;
        if (after[index] > after[index + 1] + 60 && after[index] > after[index + 2] + 40) {
          actorBounds[0] = Math.min(actorBounds[0], x);
          actorBounds[1] = Math.min(actorBounds[1], y);
          actorBounds[2] = Math.max(actorBounds[2], x);
          actorBounds[3] = Math.max(actorBounds[3], y);
        }
      }
    }
    const result = { target: count([340, 240, 510, 370]), fixed: count([90, 90, 240, 220]),
      anchor: count([292, 292, 307, 308]), actorBounds };
    return result;
  });
  assert.ok(changes.target > 200, "Preview must deform the selected finger");
  assert.ok(changes.fixed < 10, "Preview must leave the background still");
  assert.ok(changes.anchor < 60, "Preview must keep the finger's joint fixed");
  await canvas.screenshot({ path: path.join(outputDir, "preview-peak.png") });
  await setTime(3);
  changes.light = await canvas.evaluate((element) => {
    const before = window.__sceneActionFirst;
    const after = element.getContext("2d").getImageData(0, 0, 1280, 720).data;
    let count = 0;
    for (let y = 120; y < 320; y += 1) {
      for (let x = 934; x < 1133; x += 1) {
        const index = (y * 1280 + x) * 4;
        if (Math.abs(before[index] - after[index]) + Math.abs(before[index + 1] - after[index + 1]) +
          Math.abs(before[index + 2] - after[index + 2]) > 100) count += 1;
      }
    }
    delete window.__sceneActionFirst;
    return count;
  });
  assert.ok(changes.light > 200, "Preview must show the timed light state change");
  await canvas.screenshot({ path: path.join(outputDir, "preview-light-off.png") });
  await setTime(0);
  report.preview = changes;
}

async function exportVideo(animated) {
  await page.getByTestId("create-music-video").click();
  await page.getByRole("radio", { name: animated ? /애니메이션 있음/ : /애니메이션 없음/ }).check();
  const downloaded = page.waitForEvent("download", { timeout: 180_000 });
  const started = performance.now();
  await page.getByTestId("confirm-music-video").click();
  const download = await downloaded;
  const elapsedSeconds = (performance.now() - started) / 1000;
  const name = animated ? "animated.mp4" : "static.mp4";
  await download.saveAs(path.join(outputDir, name));
  await page.getByTestId("create-music-video").waitFor();
  const bytes = await readFile(path.join(outputDir, name));
  assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
  const media = await page.evaluate(async ({ base64, intro }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "auto";
    video.src = url;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const capture = async (time) => {
      await new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.onerror = reject;
        video.currentTime = time;
      });
      context.drawImage(video, 0, 0);
      return { pixels: context.getImageData(0, 0, 1280, 720).data, png: canvas.toDataURL("image/png") };
    };
    const frames = [];
    for (const offset of [.01, .15, .25, .35, .45, .55, .75, 1.1, 1.8, 3]) frames.push(await capture(intro + offset));
    const changed = (first, second, rectangle) => {
      let count = 0;
      for (let y = Math.ceil(rectangle[1] * 4 / 3); y < Math.floor(rectangle[3] * 4 / 3); y += 1) {
        for (let x = Math.ceil(rectangle[0] * 4 / 3); x < Math.floor(rectangle[2] * 4 / 3); x += 1) {
          const offset = (y * 1280 + x) * 4;
          const difference = Math.abs(first[offset] - second[offset]) + Math.abs(first[offset + 1] - second[offset + 1]) +
            Math.abs(first[offset + 2] - second[offset + 2]);
          if (difference > 100) count += 1;
        }
      }
      return count;
    };
    const differences = frames.slice(1).map((frame) => ({
      target: changed(frames[0].pixels, frame.pixels, [340, 240, 510, 370]),
      fixed: changed(frames[0].pixels, frame.pixels, [90, 90, 240, 220]),
      anchor: changed(frames[0].pixels, frame.pixels, [292, 292, 307, 308])
    }));
    const lightChanges = changed(frames[0].pixels, frames.at(-1).pixels, [700, 90, 850, 240]);
    const peakIndex = differences.reduce((best, item, index) => item.target > differences[best].target ? index : best, 0) + 1;
    const actorBounds = [1280, 720, 0, 0];
    const peakPixels = frames[peakIndex].pixels;
    for (let y = 320; y < 493; y += 1) {
      for (let x = 333; x < 706; x += 1) {
        const index = (y * 1280 + x) * 4;
        if (peakPixels[index] > peakPixels[index + 1] + 60 && peakPixels[index] > peakPixels[index + 2] + 40) {
          actorBounds[0] = Math.min(actorBounds[0], x);
          actorBounds[1] = Math.min(actorBounds[1], y);
          actorBounds[2] = Math.max(actorBounds[2], x);
          actorBounds[3] = Math.max(actorBounds[3], y);
        }
      }
    }
    const contextAudio = new AudioContext();
    const decoded = await contextAudio.decodeAudioData(await blob.arrayBuffer());
    await contextAudio.close();
    const samples = decoded.getChannelData(0);
    let square = 0;
    for (const value of samples) square += value * value;
    const signature = new TextDecoder("latin1").decode(bytes);
    const result = {
      width: video.videoWidth, height: video.videoHeight, duration: video.duration,
      videoCodec: signature.includes("avc1") ? "avc" : null, audioCodec: signature.includes("mp4a") ? "aac" : null,
      rms: Math.sqrt(square / samples.length), differences, lightChanges, actorBounds,
      firstPng: frames[0].png, peakPng: frames[peakIndex].png
    };
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    return result;
  }, { base64: bytes.toString("base64"), intro: report.seed.intro });
  for (const key of ["firstPng", "peakPng"]) {
    await writeFile(path.join(outputDir, `${name}-${key}.png`), Buffer.from(media[key].split(",")[1], "base64"));
    delete media[key];
  }
  assert.equal(media.width, 1280);
  assert.equal(media.height, 720);
  assert.equal(media.videoCodec, "avc");
  assert.equal(media.audioCodec, "aac");
  assert.ok(media.rms > .001);
  assert.ok(Math.abs(media.duration - report.seed.duration) < .15);
  const targetChanges = Math.max(...media.differences.map((item) => item.target));
  const fixedChanges = Math.max(...media.differences.map((item) => item.fixed));
  const anchorChanges = Math.max(...media.differences.map((item) => item.anchor));
  assert.ok(fixedChanges < 60, "Unassigned background must stay fixed in both output modes");
  assert.ok(anchorChanges < 60, "The finger's fixed joint must stay fixed");
  if (animated) {
    assert.ok(targetChanges > 200, "Animated output must deform the selected finger");
    assert.ok(media.lightChanges > 200, "The light must change state at its authored beat");
    assert.ok(media.actorBounds.every((value, index) => Math.abs(value - report.preview.actorBounds[index]) <= 3),
      "Animated MP4 and preview must show the same finger pose, allowing codec edge rounding");
  } else {
    assert.ok(targetChanges < 60, "Static output must ignore the choreography");
    assert.ok(media.lightChanges < 60, "Static output must keep the light's original drawing");
  }
  return { ...media, bytes: bytes.length, elapsedSeconds };
}

try {
  page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, acceptDownloads: true });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}?start=new`);
  report.seed = await page.evaluate(() => {
    const words = ["스위치를눌러", "전등을꺼봐", "손가락굽혀", "함께노래해", "천천히다시", "그림이움직여", "즐거운우리", "친구안녕해"];
    const measures = words.map((word, index) => ({
      candidateId: "custom", candidateName: "부분 동작 검증", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word).map((lyric, noteIndex) => ({
        id: `action-${index}-${noteIndex}`, pitch: [60, 64, 67, 64][noteIndex % 4], lyric,
        duration: { numerator: 4, denominator: word.length }
      }))
    }));
    const scene = {
      id: "action-scene", background: "#ffffff", motion: "auto", endLyric: null, endMeasureIndex: 7,
      elements: [
        { id: "background", tool: "rectangle", color: "#1e293b", width: 10, points: [[100, 100, .5], [220, 200, .5]] },
        { id: "switch", tool: "rectangle", color: "#1e293b", width: 10, points: [[485, 240, .5], [525, 350, .5]] },
        { id: "hand", tool: "brush", color: "#e5484d", width: 18,
          points: Array.from({ length: 31 }, (_, index) => [300 + index * 5, 300, .5]) },
        { id: "bulb", tool: "ellipse", color: "#1e293b", width: 12, points: [[740, 120, .5], [800, 200, .5]] }
      ],
      choreography: {
        version: 1, description: "검증용 손가락 누르기", actors: [{
          id: "finger", name: "손가락", elementIds: ["hand"], fixedPoint: [300, 300],
          movingPoint: [450, 300], endPoint: [480, 330]
        }, { id: "light", name: "전등", elementIds: ["bulb"], fixedPoint: [770, 200],
          movingPoint: [770, 120], endPoint: [770, 120] }],
        actions: [{ id: "finger-press", actorId: "finger", kind: "press", startMeasureIndex: 0,
          startBeat: 0, durationBeats: 2, strength: 1 },
        { id: "light-off", actorId: "light", kind: "light-off", startMeasureIndex: 1,
          startBeat: 0, durationBeats: 1, strength: 1 }]
      }
    };
    const draft = {
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "가사에 맞춘 손가락 동작", creator: "검증",
      originalCreator: "", presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      bpm: 180, lyrics: words, measures, showArrangement: true, musicVideoScenes: [scene]
    };
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify(draft));
    return { intro: .08 + 16 * 60 / 180, duration: .08 + 64 * 60 / 180 + .8, scene };
  });
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-paint-canvas").waitFor();
  await verifyActionEditor();
  await verifyPreview();
  await page.getByRole("dialog", { name: "장면 그리기", exact: true }).screenshot({ path: path.join(outputDir, "studio.png") });
  report.static = await exportVideo(false);
  report.animated = await exportVideo(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "장면 설정 보기", exact: true }).click();
  await page.getByTestId("scene-action-editor").scrollIntoViewIfNeeded();
  const mobileOverflow = await page.getByTestId("scene-action-editor").evaluate((element) =>
    element.scrollWidth > element.clientWidth + 1);
  assert.equal(mobileOverflow, false, "Mobile action controls must fit their panel");
  await page.screenshot({ path: path.join(outputDir, "mobile-actions.png") });
  await page.getByRole("button", { name: "그림판 보기", exact: true }).click();
  await page.getByTestId("scene-action-canvas").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(outputDir, "mobile-handles.png") });
  report.mobile = true;
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
  await page.reload();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes);
  assert.deepEqual(restored?.[0]?.choreography, report.seed.scene.choreography);
  report.persistence = true;
  assert.deepEqual(errors, []);
  delete report.seed.scene;
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
