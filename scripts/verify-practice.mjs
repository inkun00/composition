import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4175/";
const outputDir = path.resolve("artifacts/practice");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("4");
  const card = (index) => page.getByTestId(`practice-measure-card-${index}`);
  const workspace = page.getByTestId("practice-score-workspace-0");
  const tools = workspace.getByTestId("practice-score-tools-0");
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1")));
  const melodyTab = page.getByRole("tab", { name: /가락 만들기/ });
  assert.equal(await page.locator(".practice-measure-card").count(), 4);
  assert.equal(await tools.getByTestId("practice-duration-0.5").count(), 1);
  assert.equal(await tools.getByTestId("practice-rest-0.5").count(), 1);
  assert.equal(await page.getByTestId("practice-add-note").count(), 0);
  assert.equal(await page.getByTestId("practice-add-rest").count(), 0);
  const toolsBounds = await tools.boundingBox();
  const firstCardBounds = await card(0).boundingBox();
  assert.ok(toolsBounds.y + toolsBounds.height <= firstCardBounds.y);
  for (const beats of [4, 3, 2, 1.5, 1, 0.5]) {
    const noteBounds = await tools.getByTestId(`practice-duration-${beats}`).boundingBox();
    const restBounds = await tools.getByTestId(`practice-rest-${beats}`).boundingBox();
    assert.ok(Math.abs(noteBounds.y - restBounds.y) < 1);
    assert.ok(restBounds.x >= noteBounds.x + noteBounds.width);
  }
  const fourMeasureLayout = await Promise.all(
    [0, 1, 2, 3].map((index) => card(index).boundingBox())
  );
  assert.ok(fourMeasureLayout.every((bounds) => Math.abs(bounds.y - fourMeasureLayout[0].y) < 1));

  // Listen to one entered beat while the remaining three measures are still empty.
  for (let index = 0; index < 4; index += 1) {
    assert.equal(await page.getByTestId(`practice-measure-preview-${index}`).isEnabled(), false);
  }
  await page.getByLabel("연습 빠르기", { exact: true }).selectOption("60");
  await page.getByTestId("practice-measure-2").click();
  await tools.getByTestId("practice-duration-1").click();
  await card(2).getByLabel("3마디 가사", { exact: true }).fill("봄");
  const incomplete = await draft();
  assert.equal(incomplete.measures[2].notes.length, 1);
  assert.deepEqual(incomplete.measures[2].notes[0].duration, { numerator: 1, denominator: 1 });
  assert.ok(incomplete.measures.every((measure, index) => index === 2 || measure.notes.length === 0));
  assert.equal(await page.getByTestId("practice-measure-preview-2").isEnabled(), true);
  assert.equal(await page.getByRole("button", { name: "리듬 미리듣기", exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole("button", { name: "MP4 저장", exact: true }).isEnabled(), false);
  assert.equal(await melodyTab.isEnabled(), false);
  await page.getByTestId("practice-measure-preview-2").click();
  await page.getByRole("button", { name: "3마디 연주 멈추기", exact: true }).waitFor();
  const partialPlayback = await page.evaluate(() => {
    const preview = document.querySelector('[data-testid="practice-measure-preview-2"]');
    const otherPreview = document.querySelector('[data-testid="practice-measure-preview-0"]');
    const wholePreview = document.querySelector(".practice-listen-card .practice-preview");
    const save = [...document.querySelectorAll(".practice-listen-card button")]
      .find((button) => button.textContent.trim() === "MP3 저장");
    const result = {
      stopLabel: preview.textContent.trim(),
      otherDisabled: otherPreview.disabled,
      wholeDisabled: wholePreview.disabled,
      saveDisabled: save.disabled,
      draft: JSON.parse(localStorage.getItem("maeum-melody-practice-v1"))
    };
    if (result.stopLabel !== "3마디 연주 멈추기") throw new Error("마디 연주가 너무 일찍 끝났습니다.");
    preview.click();
    return result;
  });
  assert.equal(partialPlayback.otherDisabled, true);
  assert.equal(partialPlayback.wholeDisabled, true);
  assert.equal(partialPlayback.saveDisabled, true);
  assert.deepEqual(partialPlayback.draft, incomplete);
  await page.getByRole("button", { name: "3마디 리듬 미리듣기", exact: true }).waitFor();
  assert.equal(await page.getByTestId("practice-measure-preview-2").isEnabled(), true);
  assert.deepEqual(await draft(), incomplete);
  await tools.getByTestId("practice-delete-note").click();
  await card(2).getByLabel("3마디 가사", { exact: true }).fill("");
  await page.getByLabel("연습 빠르기", { exact: true }).selectOption("96");

  for (let index = 0; index < 4; index += 1) {
    assert.equal(await card(index).isVisible(), true);
    const bounds = await card(index).boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 1440);
    const rhythmBounds = await card(index).locator(".practice-rhythm-timeline").boundingBox();
    const lyricBounds = await card(index).getByLabel(`${index + 1}마디 가사`, { exact: true }).boundingBox();
    assert.ok(lyricBounds.y >= rhythmBounds.y + rhythmBounds.height);
    assert.equal(await melodyTab.isEnabled(), false);
    await card(index).getByLabel(`${index + 1}마디 가사`, { exact: true }).fill("반짝별아");
    await page.getByTestId(`practice-measure-${index}`).click();
    for (let beat = 0; beat < 4; beat += 1) {
      await tools.getByTestId("practice-duration-1").click();
    }
    assert.equal(await melodyTab.isEnabled(), index === 3);
  }
  const workspaceBounds = await page.locator(".practice-workspace").boundingBox();
  const listenBounds = await page.locator(".practice-listen-card").boundingBox();
  assert.ok(listenBounds.y >= workspaceBounds.y + workspaceBounds.height);
  assert.equal(await page.locator("aside .practice-listen-card").count(), 0);
  assert.equal(await tools.getByTestId("practice-duration-0.5").locator("small").innerText(), "0.5박");
  assert.equal(await tools.getByTestId("practice-duration-0.5").getByText("8분음표", { exact: true }).innerText(), "8분음표");
  assert.doesNotMatch(await tools.getByTestId("practice-duration-0.5").innerText(), /반 박|·/);
  await page.getByRole("button", { name: "리듬 미리듣기", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "리듬 미리듣기", exact: true }).isEnabled(), true);
  await page.screenshot({ path: path.join(outputDir, "rhythm-desktop.png"), fullPage: true });
  const initial = await draft();
  const noteIds = initial.measures[0].notes.map((note) => note.id);
  const initialDurations = initial.measures[0].notes.map((note) => note.duration);

  // Overflow must remain visible and block completion, rather than being clipped.
  await page.getByTestId("practice-measure-0").click();
  await tools.getByTestId("practice-duration-2").click();
  assert.match(await card(0).locator(".practice-measure-validation").innerText(), /맞지 않아요/);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  assert.equal(await melodyTab.isEnabled(), false);
  assert.equal(await page.getByRole("tab", { name: /리듬 만들기/ }).getAttribute("aria-selected"), "true");
  await tools.getByTestId("practice-delete-note").click();
  assert.deepEqual((await draft()).measures[0].notes, initial.measures[0].notes);

  // Preview local percussion and exercise the stop button.
  await page.getByRole("button", { name: "리듬 미리듣기", exact: true }).click();
  await page.getByRole("button", { name: "연주 멈추기", exact: true }).waitFor();
  await page.getByRole("button", { name: "연주 멈추기", exact: true }).click();
  await melodyTab.click();
  assert.equal(await page.locator(".practice-pitch-row-label").count(), 32);
  await page.getByTestId(`practice-melody-${noteIds[0]}-62`).click();
  assert.match(await card(0).locator(".practice-harmony-warning").innerText(), /C 화음의 구성음이 아니에요/);
  const melody = [60, 64, 67, 72];
  for (const [index, pitch] of melody.entries()) {
    await page.getByTestId(`practice-melody-${noteIds[index]}-${pitch}`).click();
  }
  const made = await draft();
  assert.deepEqual(made.measures[0].notes.map((note) => note.duration), initialDurations);
  assert.deepEqual(made.measures[0].notes.map((note) => note.pitch), melody);
  assert.equal(made.measures[0].notes.map((note) => note.lyric).join(""), "반짝별아");
  await page.screenshot({ path: path.join(outputDir, "melody-desktop.png"), fullPage: true });

  // Melody editing can change rhythm without losing pitches or per-note lyrics.
  await card(0).getByLabel("1번째 음표 가사", { exact: true }).fill("");
  const lyricsEdited = (await draft()).measures[0].notes;
  assert.equal(lyricsEdited[0].lyric, "");
  assert.deepEqual(lyricsEdited.slice(1).map((note) => note.lyric), ["짝", "별", "아"]);
  await page.getByTestId(`practice-melody-${noteIds[0]}-62`).click();
  assert.deepEqual((await draft()).measures[0].notes.map((note) => note.lyric), lyricsEdited.map((note) => note.lyric));
  await page.getByTestId(`practice-melody-${noteIds[0]}-60`).click();
  await tools.getByTestId("practice-edit-duration").selectOption("2");
  assert.match(await card(0).locator(".practice-measure-validation").innerText(), /맞지 않아요/);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  assert.equal(await melodyTab.getAttribute("aria-selected"), "true");
  assert.deepEqual((await draft()).measures[0].notes.map((note) => ({ pitch: note.pitch, lyric: note.lyric })),
    lyricsEdited.map((note) => ({ pitch: note.pitch, lyric: note.lyric })));
  await tools.getByTestId("practice-edit-duration").selectOption("1");
  await tools.getByTestId("practice-rest-1.5").click();
  const addedRest = (await draft()).measures[0].notes.at(-1);
  assert.equal(addedRest.pitch, null);
  assert.deepEqual(addedRest.duration, { numerator: 3, denominator: 2 });
  assert.equal(addedRest.dotted, true);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  await tools.getByTestId("practice-delete-note").click();
  assert.deepEqual((await draft()).measures[0].notes, lyricsEdited);
  await tools.getByTestId("practice-duration-0.5").click();
  assert.equal((await draft()).measures[0].notes.length, lyricsEdited.length + 1);
  const addedNote = (await draft()).measures[0].notes.at(-1);
  assert.equal(addedNote.pitch, 60);
  assert.deepEqual(addedNote.duration, { numerator: 1, denominator: 2 });
  await tools.getByTestId("practice-delete-note").click();
  assert.deepEqual((await draft()).measures[0].notes, lyricsEdited);
  await card(0).getByLabel("1번째 음표 가사", { exact: true }).fill("반");
  assert.deepEqual((await draft()).measures[0].notes, made.measures[0].notes);

  // Keep the actual media checks short after proving the four-measure workflow.
  page.once("dialog", async (dialog) => {
    assert.match(dialog.message(), /마디 수를 줄이면/);
    await dialog.accept();
  });
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("1");
  assert.equal(await page.locator(".practice-measure-card").count(), 1);
  assert.deepEqual((await draft()).measures[0].notes, made.measures[0].notes);

  await page.getByRole("button", { name: "악보에 넣기", exact: true }).click();
  await page.locator('[data-vex-ready="true"]').waitFor();
  await page.screenshot({ path: path.join(outputDir, "score-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "칸 채우기", exact: true }).click();

  // Trigger real downloads through the same buttons a learner uses.
  const mp3Download = page.waitForEvent("download");
  await page.getByRole("button", { name: "MP3 저장", exact: true }).click();
  const mp3 = await mp3Download;
  const mp3Path = path.join(outputDir, "practice.mp3");
  await mp3.saveAs(mp3Path);
  const mp3Bytes = await readFile(mp3Path);
  assert.ok(mp3Bytes.length > 1000);
  const mp4Download = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "MP4 저장", exact: true }).click();
  const mp4 = await mp4Download;
  const mp4Path = path.join(outputDir, "practice.mp4");
  await mp4.saveAs(mp4Path);
  const mp4Bytes = await readFile(mp4Path);
  assert.equal(mp4Bytes.subarray(4, 8).toString(), "ftyp");

  const media = await page.evaluate(async ({ mp3Data, mp4Data }) => {
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(Uint8Array.from(mp3Data).buffer);
    const samples = buffer.getChannelData(0);
    const energy = samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
    const frequencies = [0.2, 0.825, 1.45, 2.075].map((seconds) => {
      const start = Math.floor(seconds * buffer.sampleRate);
      const windowLength = 8192;
      let bestFrequency = 0;
      let bestPower = 0;
      // Narrow frequency scan for the C4..C5 practice range.
      for (let frequency = 240; frequency <= 545; frequency += 1) {
        let real = 0;
        let imaginary = 0;
        for (let index = 0; index < windowLength; index += 1) {
          const value = samples[start + index] || 0;
          const angle = 2 * Math.PI * frequency * index / buffer.sampleRate;
          real += value * Math.cos(angle);
          imaginary += value * Math.sin(angle);
        }
        const power = real * real + imaginary * imaginary;
        if (power > bestPower) { bestPower = power; bestFrequency = frequency; }
      }
      return bestFrequency;
    });
    const videoAudio = await context.decodeAudioData(Uint8Array.from(mp4Data).buffer);
    const videoSamples = videoAudio.getChannelData(0);
    const videoAudioEnergy = videoSamples.reduce((sum, value) => sum + value * value, 0) / videoSamples.length;
    await context.close();
    const video = document.createElement("video");
    const url = URL.createObjectURL(new Blob([Uint8Array.from(mp4Data)], { type: "video/mp4" }));
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const drawing = canvas.getContext("2d");
    const playheadPositions = [];
    let blackBackground = true;
    for (const seconds of [0.2, 2.1]) {
      await new Promise((resolve) => { video.onseeked = resolve; video.currentTime = seconds; });
      drawing.drawImage(video, 0, 0);
      const corner = drawing.getImageData(10, 10, 1, 1).data;
      blackBackground &&= corner[0] < 15 && corner[1] < 15 && corner[2] < 15;
      const pixels = drawing.getImageData(0, 64, canvas.width, 560).data;
      let bestColumn = null;
      let longestLine = 0;
      // The current black-and-white video has a tall moving playback line.
      for (let x = 0; x < canvas.width; x += 1) {
        let whitePixels = 0;
        for (let y = 0; y < 560; y += 2) {
          const index = (y * canvas.width + x) * 4;
          const red = pixels[index];
          const green = pixels[index + 1];
          const blue = pixels[index + 2];
          if (Math.min(red, green, blue) > 90 && Math.max(red, green, blue) - Math.min(red, green, blue) < 20) {
            whitePixels += 1;
          }
        }
        if (whitePixels > longestLine) {
          longestLine = whitePixels;
          bestColumn = x;
        }
      }
      playheadPositions.push(longestLine > 150 ? bestColumn : null);
    }
    const result = {
      audioDuration: buffer.duration, energy, frequencies, videoDuration: video.duration,
      videoAudioDuration: videoAudio.duration, videoAudioEnergy,
      videoWidth: video.videoWidth, videoHeight: video.videoHeight, blackBackground, playheadPositions
    };
    URL.revokeObjectURL(url);
    return result;
  }, { mp3Data: [...mp3Bytes], mp4Data: [...mp4Bytes] });
  assert.ok(Math.abs(media.audioDuration - 2.5) < 0.2);
  assert.ok(media.energy > 0.000001);
  for (const [index, expected] of [262, 330, 392, 523].entries()) {
    assert.ok(Math.abs(media.frequencies[index] - expected) < 12, JSON.stringify(media.frequencies));
  }
  assert.ok(Math.abs(media.videoDuration - 2.5) < 0.2);
  assert.ok(Math.abs(media.videoAudioDuration - 2.5) < 0.2);
  assert.ok(media.videoAudioEnergy > 0.000001);
  assert.equal(media.videoWidth, 1280);
  assert.equal(media.videoHeight, 720);
  assert.equal(media.blackBackground, true);
  assert.ok(media.playheadPositions[0] > 0 && media.playheadPositions[1] > media.playheadPositions[0], JSON.stringify(media));

  // Reloading and returning to practice preserves all entered data.
  await page.reload();
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  assert.deepEqual((await draft()).measures[0].notes.map((note) => note.pitch), melody);
  await page.getByRole("tab", { name: /가락 만들기/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "melody-mobile.png"), fullPage: true });
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth, pageWidth: document.documentElement.scrollWidth,
    gridScrolls: document.querySelector(".practice-grid-scroll").scrollWidth > document.querySelector(".practice-grid-scroll").clientWidth,
    cardLeft: document.querySelector(".practice-measure-card").getBoundingClientRect().left,
    cardRight: document.querySelector(".practice-measure-card").getBoundingClientRect().right
  }));
  assert.equal(layout.pageWidth, layout.viewport);
  assert.ok(layout.cardLeft >= 0 && layout.cardRight <= layout.viewport);
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  await page.locator(".opening-screen").waitFor();
  await page.screenshot({ path: path.join(outputDir, "opening-mobile.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", fourMeasureLayout, media, layout, outputs: outputDir }, null, 2));
} finally {
  await browser.close();
}
