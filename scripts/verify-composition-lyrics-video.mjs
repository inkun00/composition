import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.COMPOSITION_VIDEO_URL || "http://127.0.0.1:4178/";
const outputDir = path.resolve("artifacts/composition-lyrics-video");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const errors = [];
const warnings = [];
const sampleUrls = new Set();
const downloads = [];
const report = { baseUrl, errors, warnings };
let page;

async function savePng(name, dataUrl) {
  await writeFile(path.join(outputDir, name), Buffer.from(dataUrl.split(",")[1], "base64"));
}

async function exportButtonsLayout(viewport, name) {
  await page.setViewportSize(viewport);
  const mp3 = page.getByTestId("export-backing-mp3");
  const mp4 = page.getByTestId("export-lyrics-mp4");
  await mp4.scrollIntoViewIfNeeded();
  const [audio, video] = await Promise.all([mp3.boundingBox(), mp4.boundingBox()]);
  assert.ok(audio && video, `${name}: both export buttons must be visible`);
  assert.ok(video.x >= 0 && video.x + video.width <= viewport.width + 1, `${name}: video button must fit`);
  assert.ok(audio.x >= 0 && audio.x + audio.width <= viewport.width + 1, `${name}: audio button must fit`);
  assert.ok(Math.abs(audio.y - video.y) < 2, `${name}: MP4 must appear beside MP3`);
  assert.ok(video.x > audio.x, `${name}: MP4 must follow MP3`);
  const section = page.locator(".publish-action-group-files");
  await section.screenshot({ path: path.join(outputDir, `${name}-buttons.png`) });
  return { audio, video };
}

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  page.on("console", (message) => {
    if (message.type() === "warning" && /샘플|sample|악기/i.test(message.text())) warnings.push(message.text());
  });
  page.on("request", (request) => {
    if (/midi-js-soundfonts/.test(request.url())) sampleUrls.add(request.url());
  });
  await page.addInitScript(() => {
    window.compositionVideoAudit = { sampleStarts: 0, oscillatorStarts: 0, offlineRenders: 0 };
    const originalSourceStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.compositionVideoAudit.sampleStarts += 1;
      return originalSourceStart.apply(this, args);
    };
    const originalOscillatorStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      window.compositionVideoAudit.oscillatorStarts += 1;
      return originalOscillatorStart.apply(this, args);
    };
    const originalRender = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = function (...args) {
      window.compositionVideoAudit.offlineRenders += 1;
      return originalRender.apply(this, args);
    };
  });
  await page.goto(`${baseUrl}?start=new`);
  const seed = await page.evaluate(async () => {
    const { HARMONY_PRESETS } = await import("/src/music/harmonyPresets.ts");
    const { DRAFT_STORAGE_KEY, isSavedDraft } = await import("/src/music/draft.ts");
    const syllables = ["햇살가득", "우리함께", "꿈을향해", "노래해요", "바람따라", "하늘높이", "다시만날", "친구안녕"];
    const chords = [["C"], ["F"], ["Dm"], ["G"], ["Am"], ["F"], ["G7"], ["C"]];
    const pitches = [[60, 62, 64, 67], [65, 67, 69, 65], [62, 64, 65, 69], [67, 69, 71, 67],
      [69, 71, 72, 69], [65, 67, 69, 65], [67, 65, 62, 59], [64, 62, 60, 60]];
    const instrumentIds = ["bright_acoustic_piano", "acoustic_bass", "clarinet", "recorder"];
    const measures = pitches.map((bar, measureIndex) => ({
      candidateId: "custom", candidateName: "가사 영상 검증 가락", chords: chords[measureIndex], keyFifths: 0,
      notes: bar.map((pitch, noteIndex) => ({ id: `video-${measureIndex}-${noteIndex}`, pitch,
        lyric: Array.from(syllables[measureIndex])[noteIndex], duration: { numerator: 1, denominator: 1 } }))
    }));
    const draft = {
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "가사 영상 검증곡", creator: "검증",
      originalCreator: "", presetId: HARMONY_PRESETS[0].id, meter: { beats: 4, beatUnit: 4 }, songLength: 8,
      instrumentId: "bright_acoustic_piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: instrumentIds,
      bpm: 160, lyrics: Array(8).fill(""), measures, showArrangement: true
    };
    if (!isSavedDraft(draft)) throw new Error("The video test must seed a valid student composition");
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return { title: draft.title, instrumentIds, bpm: draft.bpm, measureCount: measures.length,
      introSeconds: .08 + 4 * 4 * 60 / draft.bpm, bodySeconds: measures.length * 4 * 60 / draft.bpm,
      totalSeconds: .08 + (4 + measures.length + 4) * 4 * 60 / draft.bpm + .8 };
  });
  report.seed = seed;
  await page.reload();
  await page.getByTestId("arrangement-section").waitFor();
  await page.getByTestId("export-lyrics-mp4").waitFor();
  assert.match(await page.getByTestId("export-lyrics-mp4").innerText(), /가사 포함 MP4/);
  report.desktop = await exportButtonsLayout({ width: 1440, height: 1080 }, "desktop");
  report.mobile = await exportButtonsLayout({ width: 390, height: 844 }, "mobile");
  await page.setViewportSize({ width: 1440, height: 1080 });

  const before = await page.evaluate(() => ({ ...window.compositionVideoAudit }));
  const started = Date.now();
  const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("export-lyrics-mp4").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="export-lyrics-mp4"]')?.disabled);
  const progress = page.getByTestId("composition-video-progress");
  await progress.waitFor();
  report.progress = { value: Number(await progress.getAttribute("value")), max: Number(await progress.getAttribute("max")) };
  assert.ok(report.progress.value >= 0 && report.progress.value <= 100 && report.progress.max === 100,
    "The video job must show actual progress on a 0–100 scale");
  await page.getByRole("dialog", { name: "가사 영상 만드는 중", exact: true })
    .screenshot({ path: path.join(outputDir, "video-progress.png") });
  report.busy = {
    mp4Disabled: await page.getByTestId("export-lyrics-mp4").isDisabled(),
    mp3Disabled: await page.getByTestId("export-backing-mp3").isDisabled()
  };
  assert.ok(report.busy.mp4Disabled && report.busy.mp3Disabled, "Audio/video exports must not overlap");
  // A programmatic click obeys the native disabled state and must not queue a second export.
  await page.getByTestId("export-lyrics-mp4").evaluate((button) => button.click());
  const download = await downloadPromise;
  const mp4Path = path.join(outputDir, "composition-lyrics.mp4");
  await download.saveAs(mp4Path);
  await page.waitForFunction(() => !document.querySelector('[data-testid="export-lyrics-mp4"]')?.disabled);
  const after = await page.evaluate(() => ({ ...window.compositionVideoAudit }));
  const encoded = await readFile(mp4Path);
  assert.equal(encoded.subarray(4, 8).toString(), "ftyp", "The UI must download a real MP4");
  assert.ok(encoded.length > 100_000, "The file must include actual song audio");
  assert.equal(downloads.length, 1, "Repeated busy clicks must produce only one download");
  assert.equal(after.offlineRenders - before.offlineRenders, 1, "A single export must render the score exactly once");
  assert.ok(after.sampleStarts - before.sampleStarts > 32, "Selected soundfont instruments must actually be scheduled");
  assert.equal(after.oscillatorStarts - before.oscillatorStarts, 0, "Sample instruments must retain their actual timbres");
  for (const id of seed.instrumentIds) {
    assert.ok([...sampleUrls].some((url) => url.includes(`${id}-`)), `${id}: the selected soundfont must be loaded`);
  }
  report.export = { bytes: encoded.length, fileName: download.suggestedFilename(), elapsedMs: Date.now() - started,
    counters: Object.fromEntries(Object.keys(before).map((key) => [key, after[key] - before[key]])) };

  const media = await page.evaluate(async ({ base64, seed }) => {
    const { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input } =
      await import("/node_modules/.vite/deps/mediabunny.js");
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(new Blob([bytes], { type: "video/mp4" })) });
    const tracks = await input.getTracks();
    const trackReport = await Promise.all(tracks.map(async (track) => ({ type: track.type, codec: await track.getCodec() })));
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!videoTrack || !audioTrack) throw new Error("The exported file must have both video and audio tracks");
    const sink = new CanvasSink(videoTrack);
    const frameReports = [];
    const framePngs = [];
    const times = [0.5, seed.introSeconds - .1, seed.introSeconds + .1,
      seed.introSeconds + .475, seed.introSeconds + .85, seed.introSeconds + seed.bodySeconds + .1];
    for (const [index, time] of times.entries()) {
      const frame = await sink.getCanvas(time);
      if (!frame) throw new Error(`Missing video frame at ${time}`);
      const canvas = document.createElement("canvas");
      canvas.width = frame.canvas.width;
      canvas.height = frame.canvas.height;
      const context = canvas.getContext("2d");
      context.drawImage(frame.canvas, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let black = 0;
      let yellow = 0;
      let white = 0;
      let yellowX = 0;
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          const offset = (y * canvas.width + x) * 4;
          const [r, g, b] = pixels.subarray(offset, offset + 3);
          if (r < 12 && g < 12 && b < 12) black += 1;
          if (y >= 280 && y <= 440) {
            if (r > 190 && g > 130 && b < 140) { yellow += 1; yellowX += x; }
            if (r > 210 && g > 210 && b > 210) white += 1;
          }
        }
      }
      frameReports.push({ time, width: canvas.width, height: canvas.height,
        blackRatio: black / (canvas.width * canvas.height / 4), yellow, white,
        yellowCenterX: yellow ? yellowX / yellow : null });
      framePngs.push({ name: `frame-${index}.png`, dataUrl: canvas.toDataURL("image/png") });
    }
    const duration = await input.computeDuration();
    const audioSink = new AudioBufferSink(audioTrack);
    const sampleRate = 44100;
    const decoded = new Float32Array(Math.ceil(duration * sampleRate));
    let totalSquare = 0;
    let peak = 0;
    let sampleCount = 0;
    for await (const chunk of audioSink.buffers()) {
      const samples = chunk.buffer.getChannelData(0);
      if (chunk.buffer.sampleRate !== sampleRate) throw new Error("Unexpected AAC sample rate");
      const from = Math.round(chunk.timestamp * sampleRate);
      for (let index = 0; index < samples.length; index += 1) {
        const target = from + index;
        if (target >= 0 && target < decoded.length) decoded[target] = samples[index];
        totalSquare += samples[index] ** 2;
        peak = Math.max(peak, Math.abs(samples[index]));
        sampleCount += 1;
      }
    }
    const rms = (start, seconds) => {
      const from = Math.round(start * sampleRate);
      const to = Math.min(decoded.length, Math.round((start + seconds) * sampleRate));
      let square = 0;
      for (let index = from; index < to; index += 1) square += decoded[index] ** 2;
      return Math.sqrt(square / Math.max(1, to - from));
    };
    const { DRAFT_STORAGE_KEY } = await import("/src/music/draft.ts");
    const { findHarmonyPreset } = await import("/src/music/harmonyPresets.ts");
    const { compositionFromDraft } = await import("/src/music/composerDraft.ts");
    const { renderOfflineBackingAudio } = await import("/src/audio/backingExport.ts");
    const draft = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY));
    const measures = compositionFromDraft(draft, findHarmonyPreset(draft.presetId)).map((bar, index) => ({
      notes: bar.notes, harmony: bar.story, chords: bar.chords, effects: bar.effects, measureIndex: index
    }));
    const expected = await renderOfflineBackingAudio(measures, draft.instrumentId, draft.bpm, {
      styleId: draft.accompanimentStyleId, instrumentIds: draft.accompanimentInstrumentIds,
      trackMix: draft.accompanimentTrackMix, beatPattern: draft.beatPattern ?? [], beatVolume: draft.beatVolume ?? 100,
      meter: draft.meter
    });
    const source = expected.audioBuffer.getChannelData(0);
    // AAC is lossy. Compare the signal, allowing the encoder's short timing offset.
    const from = Math.round(seed.introSeconds * sampleRate);
    const to = Math.min(source.length, Math.round((seed.introSeconds + seed.bodySeconds) * sampleRate));
    let bestCorrelation = -1;
    let bestLag = null;
    for (let lag = -1100; lag <= 1100; lag += 1) {
      let product = 0;
      let leftPower = 0;
      let rightPower = 0;
      for (let index = from; index < to; index += 31) {
        const target = index + lag;
        if (target < 0 || target >= decoded.length) continue;
        const a = source[index];
        const b = decoded[target];
        product += a * b;
        leftPower += a * a;
        rightPower += b * b;
      }
      const correlation = product / Math.sqrt(Math.max(1e-20, leftPower * rightPower));
      if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; }
    }
    input.dispose();
    return { duration, tracks: trackReport, frames: frameReports, framePngs,
      audio: { sampleRate, rms: Math.sqrt(totalSquare / sampleCount), peak,
        introRms: rms(.08, seed.introSeconds - .08), bodyRms: rms(seed.introSeconds, seed.bodySeconds),
        outroRms: rms(seed.introSeconds + seed.bodySeconds, 6),
        expectedBackingCorrelation: bestCorrelation, encoderLagSamples: bestLag,
        expectedPcmDuration: expected.audioBuffer.duration, expectedIntroSeconds: expected.introSeconds } };
  }, { base64: encoded.toString("base64"), seed });
  for (const frame of media.framePngs) await savePng(frame.name, frame.dataUrl);
  delete media.framePngs;
  report.media = media;
  assert.ok(media.tracks.some((track) => track.type === "video" && track.codec === "avc"), "H.264 video must be present");
  assert.ok(media.tracks.some((track) => track.type === "audio" && track.codec === "aac"), "AAC audio must be present");
  assert.ok(Math.abs(media.duration - seed.totalSeconds) < .1, "Intro, song, outro, and tail must all be exported");
  assert.ok(media.frames.every((frame) => frame.width === 1280 && frame.height === 720 && frame.blackRatio > .95),
    "The video must have a 720p black background");
  assert.equal(media.frames[1].yellow, 0, "Lyrics must wait until the intro finishes");
  assert.equal(media.frames[5].yellow, 0, "No active lyrics should remain in the outro");
  const singing = media.frames.slice(2, 5);
  assert.ok(singing.every((frame) => frame.yellow > 100 && frame.white > 200), "Active lyrics must be yellow beside white lyrics");
  assert.ok(singing[0].yellowCenterX < singing[1].yellowCenterX && singing[1].yellowCenterX < singing[2].yellowCenterX,
    "The active Korean syllable must advance with each student note");
  assert.ok(media.audio.introRms > .001 && media.audio.bodyRms > .001 && media.audio.outroRms > .001,
    "The actual MP4 audio must include audible intro, accompaniment, and outro");
  assert.ok(media.audio.peak < 1 && media.audio.expectedBackingCorrelation > .96,
    "The MP4 audio must match the selected ensemble's backing score without clipping");

  const downloadsBeforeCancel = downloads.length;
  await page.getByTestId("export-lyrics-mp4").click();
  await page.getByTestId("cancel-composition-video").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="export-lyrics-mp4"]')?.disabled);
  assert.equal(downloads.length, downloadsBeforeCancel, "Cancel must release the job without downloading a partial MP4");
  const cancelStatus = page.locator(".share-status");
  assert.match(await cancelStatus.innerText(), /취소/);
  report.cancellation = { downloads: downloads.length, status: await cancelStatus.innerText(),
    buttonEnabled: await page.getByTestId("export-lyrics-mp4").isEnabled() };

  await page.evaluate(async () => {
    const { DRAFT_STORAGE_KEY } = await import("/src/music/draft.ts");
    const draft = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY));
    draft.lyrics = draft.lyrics.map(() => "");
    draft.measures = draft.measures.map((bar) => ({ ...bar, notes: bar.notes.map((note) => ({ ...note, lyric: "" })) }));
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  });
  await page.reload();
  const emptyButton = page.getByTestId("export-lyrics-mp4");
  await emptyButton.waitFor();
  const emptyCounters = await page.evaluate(() => ({ ...window.compositionVideoAudit }));
  if (!await emptyButton.isDisabled()) await emptyButton.click();
  const guidance = page.getByText(/가사.*(?:적|입력|넣|한 글자)/).filter({ visible: true });
  await guidance.first().waitFor();
  await page.locator(".publish-action-group-files").screenshot({ path: path.join(outputDir, "empty-lyrics-guidance.png") });
  report.emptyLyrics = { disabled: await emptyButton.isDisabled(), guidance: await guidance.allTextContents(),
    countersBefore: emptyCounters, countersAfter: await page.evaluate(() => ({ ...window.compositionVideoAudit })) };
  assert.equal(report.emptyLyrics.countersAfter.offlineRenders, emptyCounters.offlineRenders,
    "An empty-lyrics request should explain what to do before rendering any audio");
  assert.equal(downloads.length, 1, "A composition with no lyrics must not download a video");
  assert.deepEqual(errors, [], "The full UI export must complete without browser errors");
  report.sampleUrls = [...sampleUrls];
  report.downloads = downloads;
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outputDir, bytes: encoded.length, duration: media.duration,
    correlation: media.audio.expectedBackingCorrelation, downloads: downloads.length, browserErrors: errors.length }));
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await page?.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await browser.close();
}
