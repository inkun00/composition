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

  const modes = await page.evaluate(async () => {
    const { ACCOMPANIMENT_MODES } = await import("/src/music/accompaniment.ts");
    const { HARMONY_PRESETS } = await import("/src/music/harmonyPresets.ts");
    const { DRAFT_STORAGE_KEY, isSavedDraft } = await import("/src/music/draft.ts");
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
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return ACCOMPANIMENT_MODES;
  });
  await page.reload();
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

  const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByTestId("export-backing-mp3").click();
  const download = await downloadPromise;
  const realtimePath = path.join(outputDir, "selected-mode.mp3");
  await download.saveAs(realtimePath);
  const encoded = await readFile(realtimePath);
  assert.ok(encoded.length > 1000);
  const realtime = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const decoder = new AudioContext();
    const decoded = await decoder.decodeAudioData(bytes.buffer);
    const samples = decoded.getChannelData(0);
    let sum = 0;
    let peak = 0;
    for (const value of samples) {
      sum += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    await decoder.close();
    return { durationSeconds: decoded.duration, rms: Math.sqrt(sum / samples.length), peak };
  }, encoded.toString("base64"));
  assert.ok(realtime.rms > .0001, "UI MP3 download must contain audible accompaniment");
  assert.deepEqual(errors, [], "Composition and render should not throw browser errors");

  const report = { modeReports, realtime: { ...realtime, bytes: encoded.length }, warnings, errors };
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verifiedModes: modeReports.length, realtime, outputDir, warnings: warnings.length }));
} finally {
  await browser.close();
}
