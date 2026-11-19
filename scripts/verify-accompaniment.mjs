import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ACCOMPANIMENT_URL || "http://127.0.0.1:4176/";
const outputDir = path.resolve("artifacts/accompaniment-audit");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const errors = [];
const warnings = [];

async function loadFixture(page, draft) {
  const inertUrl = new URL("__accompaniment-export-fixture", baseUrl).href;
  await page.route(inertUrl, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Accompaniment verification fixture</title>" }), { times: 1 });
  await page.goto(inertUrl);
  await page.evaluate(async (fixture) => {
    const { saveBrowserProjectDraft } = await import("/src/music/projectStorage.ts");
    if (!await saveBrowserProjectDraft({ ...fixture, updatedAt: Date.now() })) throw new Error("Unable to save the verification fixture");
  }, draft);
  await page.goto(`${baseUrl}?start=new`);
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  page.on("console", (message) => {
    if (message.type() === "warning" && /샘플|sample/i.test(message.text())) warnings.push(message.text());
  });
  await page.addInitScript(() => {
    window.accompanimentAuditCounters = { sampleStarts: 0, oscillatorStarts: 0 };
    const sourceStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.accompanimentAuditCounters.sampleStarts += 1;
      return sourceStart.apply(this, args);
    };
    const oscillatorStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      window.accompanimentAuditCounters.oscillatorStarts += 1;
      return oscillatorStart.apply(this, args);
    };
  });
  await page.goto(`${baseUrl}?start=new`);

  const { modes, draft } = await page.evaluate(async () => {
    const { ACCOMPANIMENT_MODES } = await import("/src/music/accompaniment.ts");
    const { HARMONY_PRESETS } = await import("/src/music/harmonyPresets.ts");
    const { isSavedDraft } = await import("/src/music/draft.ts");
    const measures = Array.from({ length: 8 }, (_, index) => ({
      candidateId: "custom",
      candidateName: "반주 검증 가락",
      chords: index % 2 === 0 ? ["Cmaj7", "Am7"] : ["Dm7", "C"],
      keyFifths: 0,
      notes: [64, 67, 69, 67].map((pitch, noteIndex) => ({
        id: `audit-${index}-${noteIndex}`, pitch, duration: { numerator: 1, denominator: 1 }
      }))
    }));
    const draft = {
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "자동 반주 검증곡",
      creator: "검증", originalCreator: "검증", presetId: HARMONY_PRESETS[0].id,
      meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "acoustic_grand_piano",
      accompanimentStyleId: "folk", accompanimentInstrumentIds: ["acoustic_guitar_steel", "acoustic_bass"],
      bpm: 160, lyrics: Array(8).fill(""), measures, showArrangement: true
    };
    if (!isSavedDraft(draft)) throw new Error("The verification draft must pass real project validation");
    return { modes: ACCOMPANIMENT_MODES, draft };
  });
  await loadFixture(page, draft);
  await page.locator("#composer-tab-arrange").click();
  await page.getByTestId("arrangement-section").waitFor();
  await page.getByTestId("toggle-more-accompaniment-modes").click();

  for (const mode of modes) {
    await page.getByTestId(`accompaniment-mode-${mode.id}`).click();
    assert.equal(await page.getByTestId(`accompaniment-mode-${mode.id}`).getAttribute("aria-pressed"), "true");
  }
  await page.getByTestId("accompaniment-mode-kpop_band").click();
  await page.getByTestId("arrangement-section").screenshot({ path: path.join(outputDir, "selected-mode.png") });
  const before = await page.evaluate(() => window.accompanimentAuditCounters.sampleStarts);
  await page.getByTestId("listen-selected-accompaniment").click();
  await page.waitForFunction((count) => window.accompanimentAuditCounters.sampleStarts > count, before);
  await page.getByTestId("stop-arranged-playback").click();
  await page.getByTestId("stop-arranged-playback").waitFor({ state: "hidden" });
  await page.evaluate(async () => {
    const { stopPlayback } = await import("/src/audio/player.ts");
    await stopPlayback();
  });

  const modeReports = [];
  for (const [index, mode] of modes.entries()) {
    const warningStart = warnings.length;
    const report = await page.evaluate(async ({ mode, index }) => {
      const { exportBackingCompositionMp3Offline } = await import("/src/audio/player.ts");
      const meters = [{ beats: 4, beatUnit: 4 }, { beats: 3, beatUnit: 4 },
        { beats: 6, beatUnit: 8 }, { beats: 2, beatUnit: 4 }];
      const meter = meters[index % meters.length];
      const beats = meter.beats * 4 / meter.beatUnit;
      const notes = [
        { id: "audit-a", pitch: 64, duration: { numerator: 1, denominator: 1 } },
        { id: "audit-b", pitch: 67, duration: { numerator: beats - 1, denominator: 1 } }
      ];
      const measures = [
        { notes, harmony: "home", chords: ["Cmaj7/E", "Am7"] },
        { notes, harmony: "home", chords: ["Dm7", "C"] }
      ];
      window.accompanimentAuditCounters = { sampleStarts: 0, oscillatorStarts: 0 };
      const started = performance.now();
      const blob = await exportBackingCompositionMp3Offline(measures, "flute", 160, {
        styleId: mode.styleId, instrumentIds: mode.instrumentIds, meter
      });
      if (!blob) throw new Error(`${mode.id}: export was busy`);
      const decoder = new AudioContext();
      const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
      let sum = 0;
      let peak = 0;
      let count = 0;
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const samples = decoded.getChannelData(channel);
        for (const value of samples) {
          sum += value * value;
          peak = Math.max(peak, Math.abs(value));
          count += 1;
        }
      }
      await decoder.close();
      return {
        id: mode.id, name: mode.name, styleId: mode.styleId,
        meter: `${meter.beats}/${meter.beatUnit}`, bytes: blob.size,
        durationSeconds: decoded.duration, expectedSeconds: .08 + 10 * beats * 60 / 160 + .8,
        rms: Math.sqrt(sum / count), peak,
        ...window.accompanimentAuditCounters,
        renderMilliseconds: Math.round(performance.now() - started)
      };
    }, { mode, index });
    report.sampleFallbackWarnings = warnings.slice(warningStart);
    assert.ok(report.bytes > 1000, `${mode.id}: MP3 should contain encoded sound`);
    assert.ok(report.rms > .0001, `${mode.id}: audio must be audible`);
    assert.ok(report.peak > .001 && report.peak <= 1, `${mode.id}: finite audio peak`);
    assert.ok(Math.abs(report.durationSeconds - report.expectedSeconds) < .15, `${mode.id}: complete intro/song/outro`);
    assert.ok(report.sampleStarts > 0, `${mode.id}: selected soundfont samples must play`);
    modeReports.push(report);
    console.log(`${mode.id} ${report.meter}: RMS=${report.rms.toFixed(4)} peak=${report.peak.toFixed(4)} samples=${report.sampleStarts}`);
  }

  await page.locator("#composer-tab-publish").click();
  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByTestId("export-backing-mp3").click();
  const audioPicker = page.getByRole("dialog", { name: "음악 저장", exact: true });
  await audioPicker.waitFor();
  assert.equal(await audioPicker.getByRole("button", { name: "반주 음악", exact: true }).getAttribute("data-testid"),
    "composition-source-backing");
  assert.equal(await audioPicker.getByRole("button", { name: "연주 음악", exact: true }).getAttribute("data-testid"),
    "composition-source-performance");
  await audioPicker.screenshot({ path: path.join(outputDir, "music-source-popup.png") });
  await audioPicker.getByRole("button", { name: "반주 음악", exact: true }).click();
  const download = await downloadPromise;
  const realtimePath = path.join(outputDir, "selected-mode.mp3");
  await download.saveAs(realtimePath);
  const encoded = await readFile(realtimePath);
  assert.ok(encoded.length > 1000);
  const realtime = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const decoder = new AudioContext({ sampleRate: 44100 });
    const decoded = await decoder.decodeAudioData(bytes.buffer);
    const samples = decoded.getChannelData(0);
    window.accompanimentBackingPcm = samples.slice();
    let sum = 0;
    let peak = 0;
    for (const value of samples) {
      sum += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    await decoder.close();
    return { durationSeconds: decoded.duration, rms: Math.sqrt(sum / samples.length), peak };
  }, encoded.toString("base64"));
  assert.match(download.suggestedFilename(), /-반주음악\.mp3$/);
  assert.ok(realtime.rms > .0001, "UI MP3 download must contain audible accompaniment");

  await page.waitForFunction(() => !document.querySelector('[data-testid="export-backing-mp3"]')?.disabled);
  const performanceDownloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.getByTestId("export-backing-mp3").click();
  const performancePicker = page.getByRole("dialog", { name: "음악 저장", exact: true });
  await performancePicker.getByRole("button", { name: "연주 음악", exact: true }).click();
  const performanceDownload = await performanceDownloadPromise;
  const performancePath = path.join(outputDir, "selected-mode-performance.mp3");
  await performanceDownload.saveAs(performancePath);
  const performanceEncoded = await readFile(performancePath);
  assert.match(performanceDownload.suggestedFilename(), /-연주음악\.mp3$/);
  assert.ok(performanceEncoded.length > 1000, "Performance MP3 must contain actual encoded audio");
  const performance = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const decoder = new AudioContext({ sampleRate: 44100 });
    const decoded = await decoder.decodeAudioData(bytes.buffer);
    const samples = decoded.getChannelData(0);
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
    }, undefined, { includeMelody: true });
    const reference = expected.audioBuffer.getChannelData(0);
    const from = Math.round(expected.introSeconds * 44100);
    const to = Math.min(samples.length, reference.length, from + Math.round(measures.length * 4 * 60 / draft.bpm * 44100));
    let square = 0;
    let peak = 0;
    for (const value of samples) {
      square += value ** 2;
      peak = Math.max(peak, Math.abs(value));
    }
    let bestCorrelation = -1;
    for (let lag = -1300; lag <= 1300; lag++) {
      let product = 0;
      let leftPower = 0;
      let rightPower = 0;
      for (let index = from; index < to; index += 31) {
        const target = index + lag;
        if (target < 0 || target >= samples.length) continue;
        product += reference[index] * samples[target];
        leftPower += reference[index] ** 2;
        rightPower += samples[target] ** 2;
      }
      bestCorrelation = Math.max(bestCorrelation, product / Math.sqrt(Math.max(1e-20, leftPower * rightPower)));
    }
    let differenceSquare = 0;
    const backing = window.accompanimentBackingPcm;
    for (let index = from; index < to; index++) differenceSquare += (samples[index] - (backing[index] ?? 0)) ** 2;
    await decoder.close();
    return { durationSeconds: decoded.duration, rms: Math.sqrt(square / samples.length), peak,
      expectedPerformanceCorrelation: bestCorrelation, differenceFromBackingRms: Math.sqrt(differenceSquare / (to - from)) };
  }, performanceEncoded.toString("base64"));
  assert.ok(performance.rms > .0001 && performance.peak > .001 && performance.peak <= 1,
    "Performance MP3 must contain finite audible audio");
  assert.ok(performance.expectedPerformanceCorrelation > .9,
    "Performance MP3 must match the selected melody plus accompaniment, allowing MP3 loss");
  assert.ok(performance.differenceFromBackingRms > .0001,
    "The two MP3 sources must produce audibly different PCM signals");
  assert.deepEqual(errors, [], "Composition and render should not throw browser errors");

  const report = { modeReports, realtime: { ...realtime, bytes: encoded.length, fileName: download.suggestedFilename() },
    performance: { ...performance, bytes: performanceEncoded.length, fileName: performanceDownload.suggestedFilename() }, warnings, errors };
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verifiedModes: modeReports.length, realtime, performance, outputDir, warnings: warnings.length }));
} finally {
  await browser.close();
}
