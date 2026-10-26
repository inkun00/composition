import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = process.env.APP_URL ? null : await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server?.listen();
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/scene-files");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const errors = [];
const report = { baseUrl, errors };
let page;

async function savedScenes() {
  return page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes);
}

async function waitScenes(expected) {
  await page.waitForFunction((scenes) => JSON.stringify(JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes) ===
    JSON.stringify(scenes), expected);
}

async function downloadFile(trigger, filename) {
  const downloaded = page.waitForEvent("download");
  await trigger();
  const download = await downloaded;
  await download.saveAs(path.join(outputDir, filename));
  return { path: path.join(outputDir, filename), suggestedFilename: download.suggestedFilename() };
}

async function openSaveMenu() {
  await page.getByTestId("scene-save-options").click();
}

async function inspectPng(filename) {
  const bytes = await readFile(filename);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  const info = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixel = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data);
    return {
      width: image.naturalWidth, height: image.naturalHeight,
      background: pixel(900, 500), top: pixel(480, 20), fixedPoint: pixel(300, 300),
      movingPoint: pixel(450, 300), endPoint: pixel(480, 330), rectangle: pixel(100, 150), ellipse: pixel(650, 170)
    };
  }, bytes.toString("base64"));
  assert.equal(info.width, 960);
  assert.equal(info.height, 540);
  assert.deepEqual(info.background, [226, 243, 233, 255]);
  assert.deepEqual(info.top, info.background, "PNG must not include the video title bar");
  assert.deepEqual(info.endPoint, info.background, "PNG must not include the orange destination handle");
  for (const key of ["fixedPoint", "movingPoint"]) {
    assert.ok(info[key][0] > 180 && info[key][1] < 120 && info[key][2] < 140,
      "PNG must contain the original red drawing rather than colored action handles");
  }
  assert.ok(info.rectangle[0] < 60 && info.rectangle[1] < 80);
  assert.ok(info.ellipse[2] > info.ellipse[0] + 80);
  return { ...info, bytes: bytes.length };
}

async function verifyMobile(width) {
  await page.setViewportSize({ width, height: 844 });
  for (const mode of ["paint", "settings"]) {
    await page.getByRole("button", { name: mode === "paint" ? "그림판 보기" : "장면 설정 보기", exact: true }).click();
    for (const testId of ["scene-save", "scene-save-options", "scene-reset"]) {
      const button = page.getByTestId(testId);
      await button.waitFor({ state: "visible" });
      const box = await button.boundingBox();
      assert.ok(box && box.x >= -1 && box.x + box.width <= width + 1,
        `${width}px ${mode} ${testId} must fit the screen`);
    }
    const overflow = await page.locator(".mv-studio").evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    assert.equal(overflow, false, `${width}px ${mode} studio must not overflow horizontally`);
    await page.screenshot({ path: path.join(outputDir, `mobile-${width}-${mode}.png`) });
    await openSaveMenu();
    const menu = page.getByLabel("장면 파일 옵션", { exact: true });
    const menuBox = await menu.boundingBox();
    (report.mobileMenus ??= []).push({ viewportWidth: width, mode, ...menuBox });
    assert.ok(menuBox && menuBox.x >= -1 && menuBox.x + menuBox.width <= width + 1,
      `${width}px ${mode} save options must fit the screen`);
    await page.screenshot({ path: path.join(outputDir, `mobile-${width}-${mode}-options.png`) });
    await page.keyboard.press("Escape");
    await menu.waitFor({ state: "hidden" });
  }
}

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${baseUrl}?start=new`);
  report.seed = await page.evaluate(() => {
    const words = ["손으로눌러", "전등을꺼봐", "함께그려봐", "재미있는꿈", "다른장면도", "내가그릴게", "우리의노래", "모두들안녕"];
    const measures = words.map((word, index) => ({
      candidateId: "custom", candidateName: "장면 파일 검증", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word).map((lyric, noteIndex) => ({ id: `file-note-${index}-${noteIndex}`, pitch: 60, lyric,
        duration: { numerator: 4, denominator: word.length } }))
    }));
    const source = {
      id: "file-source", background: "#e2f3e9", motion: "sway", endLyric: null, endMeasureIndex: 3,
      elements: [
        { id: "source-brush", tool: "brush", color: "#e5484d", width: 18,
          points: Array.from({ length: 31 }, (_, index) => [300 + index * 5, 300, .5]) },
        { id: "source-rectangle", tool: "rectangle", color: "#1e293b", width: 10, points: [[100, 100, .5], [220, 200, .5]] },
        { id: "source-ellipse", tool: "ellipse", color: "#2563eb", width: 12, points: [[650, 130, .5], [730, 210, .5]] },
        { id: "source-line", tool: "line", color: "#7c3aed", width: 8, points: [[80, 380, .5], [180, 420, .5]] }
      ],
      choreography: {
        version: 1, description: "손가락의 동작도 장면 파일에 보관해요", actors: [{
          id: "file-hand", name: "손", elementIds: ["source-brush"], fixedPoint: [300, 300],
          movingPoint: [450, 300], endPoint: [480, 330]
        }], actions: [{ id: "file-press", actorId: "file-hand", kind: "press", startMeasureIndex: 0,
          startBeat: 0, durationBeats: 2, strength: 1.25 }]
      }
    };
    const destination = {
      id: "file-destination", background: "#e5efff", motion: "float", endLyric: null, endMeasureIndex: 7,
      elements: [{ id: "destination-line", tool: "line", color: "#16a34a", width: 12,
        points: [[600, 300, .5], [660, 360, .5]] }]
    };
    const draft = {
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "내 장면 저장과 초기화", creator: "검증",
      originalCreator: "", presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 8,
      instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
      bpm: 180, lyrics: words, measures, showArrangement: true, musicVideoScenes: [source, destination]
    };
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify(draft));
    return { source, destination };
  });
  await page.reload();
  await page.getByTestId("draw-music-video-scene").click();
  await page.getByTestId("scene-save").waitFor();
  await page.getByRole("dialog", { name: "장면 그리기", exact: true }).screenshot({ path: path.join(outputDir, "desktop-controls.png") });
  const json = await downloadFile(() => page.getByTestId("scene-save").click(), "saved-scene.json");
  const saved = JSON.parse(await readFile(json.path, "utf8"));
  assert.equal(saved.format, "maeum-melody-scene");
  assert.equal(saved.version, 1);
  const savedScene = saved.scene ?? saved;
  assert.deepEqual(savedScene, report.seed.source);
  report.json = { suggestedFilename: json.suggestedFilename, bytes: (await readFile(json.path)).length,
    artAndMotionPreserved: true };
  await openSaveMenu();
  const png = await downloadFile(() => page.getByRole("button", { name: /^이미지\(PNG\)로 저장/ }).click(), "saved-scene.png");
  report.png = await inspectPng(png.path);
  await page.getByTestId("scene-reset").click();
  await page.waitForFunction(() => {
    const scene = JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes?.[0];
    return scene?.elements.length === 0 && scene.background === "#ffffff" && !scene.choreography;
  });
  const reset = await savedScenes();
  assert.equal(reset[0].id, report.seed.source.id);
  assert.equal(reset[0].endMeasureIndex, report.seed.source.endMeasureIndex);
  assert.equal(reset[0].motion, "still");
  assert.deepEqual(reset[1], report.seed.destination);
  await page.getByRole("dialog", { name: "장면 그리기", exact: true }).screenshot({ path: path.join(outputDir, "reset.png") });
  await page.keyboard.press("Control+z");
  await waitScenes([report.seed.source, report.seed.destination]);
  report.reset = { onlyCurrentScene: true, keepsIdAndRange: true, undoRestoresDrawingAndActions: true };
  await page.getByRole("button", { name: "2번 장면 선택", exact: true }).click();
  await openSaveMenu();
  const chosen = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /^장면 파일 불러오기/ }).click();
  await (await chosen).setFiles(json.path);
  const imported = { ...report.seed.source, id: report.seed.destination.id, endMeasureIndex: report.seed.destination.endMeasureIndex };
  await waitScenes([report.seed.source, imported]);
  report.import = { keepsDestinationIdAndRange: true, restoresDrawingAndActions: true };
  const unchanged = await savedScenes();
  const previousStatus = await page.locator(".mv-footer").innerText();
  await page.getByTestId("scene-import-file").setInputFiles({ name: "invalid-scene.json", mimeType: "application/json",
    buffer: Buffer.from('{"version":1,"scene":{"elements":"invalid"}}') });
  await page.waitForFunction((previous) => document.querySelector(".mv-footer")?.innerText !== previous, previousStatus);
  assert.deepEqual(await savedScenes(), unchanged, "Invalid import must not mutate either scene");
  report.invalidFile = { rejectedWithoutMutation: true, message: await page.locator(".mv-footer").innerText() };
  for (const width of [390, 360]) await verifyMobile(width);
  report.mobile = { widths: [390, 360], paintingAndSettings: true, noOverflow: true };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
  await page.reload();
  assert.deepEqual(await savedScenes(), unchanged);
  report.persistence = true;
  assert.deepEqual(errors, []);
  delete report.seed;
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
