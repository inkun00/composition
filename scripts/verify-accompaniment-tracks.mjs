import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ACCOMPANIMENT_URL || "http://127.0.0.1:4176/";
const outputDir = path.resolve("artifacts/accompaniment-tracks");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const errors = [];
const warnings = [];
let page;

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  page.on("console", (message) => {
    if (message.type() === "warning" && /샘플|sample/i.test(message.text())) warnings.push(message.text());
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${baseUrl}?start=new`);
  const modes = await page.evaluate(async () => {
    const { ACCOMPANIMENT_MODES } = await import("/src/music/accompaniment.ts");
    const { DRAFT_STORAGE_KEY, isSavedDraft } = await import("/src/music/draft.ts");
    const mode = ACCOMPANIMENT_MODES.find((item) => item.id === "animation_cinema");
    const melody = [60, 60, 62, 64, 65, 64, 62, 60];
    const draft = {
      version: 1, updatedAt: Date.now(), sourceHash: "", title: "악기별 실제 연주 검증",
      creator: "검증", originalCreator: "검증", presetId: "H001",
      meter: { beats: 4, beatUnit: 4 }, songLength: 8, instrumentId: "acoustic_grand_piano",
      accompanimentStyleId: mode.styleId, accompanimentInstrumentIds: mode.instrumentIds,
      bpm: 200, lyrics: Array(8).fill(""), showArrangement: true,
      measures: Array.from({ length: 8 }, (_, bar) => ({
        candidateId: "custom", candidateName: "촘촘한 가락", chords: ["C", "Am"],
        notes: melody.map((pitch, index) => ({
          id: `note-${bar}-${index}`, pitch, duration: { numerator: 1, denominator: 2 }
        }))
      }))
    };
    if (!isSavedDraft(draft)) throw new Error("Verification draft must pass real validation");
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return ACCOMPANIMENT_MODES;
  });
  await page.reload();
  await page.getByTestId("mixer-track-flute").waitFor();
  assert.equal(await page.getByTestId("mixer-level-flute").getAttribute("value"), "0");
  await page.getByTestId("mixer-solo-flute").click();
  await page.waitForFunction(() =>
    Number(document.querySelector('[data-testid="mixer-level-flute"]')?.getAttribute("value")) > .0001);
  const soloLevels = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('[data-testid^="mixer-level-"]')]
      .map((meter) => [meter.getAttribute("data-testid"), Number(meter.getAttribute("value"))])));
  assert.ok(soloLevels["mixer-level-flute"] > 0, "Selected fourth track must produce real audio");
  assert.ok(Object.entries(soloLevels).every(([id, level]) => id.endsWith("-flute") || level === 0),
    "Solo must silence other real audio buses");
  await page.getByTestId("mixer-solo-flute").click();
  await page.evaluate(async () => { await (await import("/src/audio/player.ts")).stopPlayback(); });
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="mixer-level-flute"]')?.getAttribute("value")) === 0);

  await page.getByTestId("mixer-volume-flute").evaluate((input) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "55");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByTestId("mixer-mute-flute").click();
  await page.waitForFunction(() => {
    const draft = JSON.parse(localStorage.getItem("maeum-melody:draft:v1") || "null");
    return draft?.accompanimentTrackMix?.flute?.volume === 55 && draft.accompanimentTrackMix.flute.muted;
  });
  await page.reload();
  assert.equal(await page.getByTestId("mixer-volume-flute").inputValue(), "55");
  assert.equal(await page.getByTestId("mixer-mute-flute").getAttribute("aria-pressed"), "true");
  await page.getByTestId("mixer-mute-flute").click();
  await page.getByRole("region", { name: "현재 반주 트랙" }).screenshot({ path: path.join(outputDir, "mixer.png") });

  const reports = [];
  for (const [index, mode] of modes.entries()) {
    const result = await page.evaluate(async ({ mode, index }) => {
      const { exportBackingCompositionMp3Offline } = await import("/src/audio/player.ts");
      const meters = [{ beats: 4, beatUnit: 4 }, { beats: 3, beatUnit: 4 },
        { beats: 6, beatUnit: 8 }, { beats: 2, beatUnit: 4 }];
      const meter = meters[index % meters.length];
      const beats = meter.beats * 4 / meter.beatUnit;
      const secondsPerBeat = .3;
      const melody = [60, 60, 62, 64, 65, 64, 62, 60];
      const measures = Array.from({ length: 8 }, (_, bar) => ({
        harmony: "home", measureIndex: bar, chords: bar % 2 === 0 ? ["C", "Am"] : ["Dm", "C"],
        notes: Array.from({ length: beats * 2 }, (_, noteIndex) => ({
          id: `audit-${bar}-${noteIndex}`, pitch: melody[noteIndex % melody.length],
          duration: { numerator: 1, denominator: 2 }
        }))
      }));
      const stats = async (options) => {
        const blob = await exportBackingCompositionMp3Offline(measures, "flute", 200, {
          styleId: mode.styleId, instrumentIds: mode.instrumentIds, meter, ...options
        });
        if (!blob) throw new Error("Audio render unexpectedly busy");
        const decoder = new AudioContext();
        const audio = await decoder.decodeAudioData(await blob.arrayBuffer());
        const data = audio.getChannelData(0);
        const rmsBetween = (start, duration) => {
          const from = Math.round(start * audio.sampleRate);
          const to = Math.min(data.length, Math.round((start + duration) * audio.sampleRate));
          let sum = 0;
          for (let sample = from; sample < to; sample += 1) sum += data[sample] ** 2;
          return Math.sqrt(sum / Math.max(1, to - from));
        };
        const bodyStart = .08 + 4 * beats * secondsPerBeat;
        const bars = measures.map((_, bar) => rmsBetween(bodyStart + bar * beats * secondsPerBeat, beats * secondsPerBeat));
        let peak = 0;
        for (const value of data) peak = Math.max(peak, Math.abs(value));
        const report = { rms: rmsBetween(bodyStart, 8 * beats * secondsPerBeat), bars, peak, bytes: blob.size,
          durationSeconds: audio.duration };
        await decoder.close();
        return report;
      };
      const tracks = [];
      for (const instrumentId of mode.instrumentIds) {
        tracks.push({ instrumentId, ...await stats({ soloInstrumentId: instrumentId }) });
      }
      let mutedMessage = "";
      try {
        await stats({ trackMix: Object.fromEntries(mode.instrumentIds.map((id) => [id, { volume: 100, muted: true }])) });
      } catch (error) {
        // The export deliberately rejects a completely silent backing file.
        mutedMessage = error.message;
      }
      const low = await stats({ soloInstrumentId: mode.instrumentIds[0],
        trackMix: { [mode.instrumentIds[0]]: { volume: 20, muted: false } } });
      return { id: mode.id, meter, tracks, mutedMessage, low };
    }, { mode, index });
    for (const track of result.tracks) {
      assert.ok(track.rms > .0001, `${mode.id}/${track.instrumentId}: selected track must produce real sound`);
      assert.ok(track.bars.every((rms) => rms > .00001), `${mode.id}/${track.instrumentId}: no order-based silent bars`);
      assert.ok(track.peak > 0 && track.peak <= 1, `${mode.id}/${track.instrumentId}: valid peak`);
    }
    assert.match(result.mutedMessage, /음소거|반주 소리/, `${mode.id}: all muted tracks must trigger the silent-export guard`);
    assert.ok(result.low.rms < result.tracks[0].rms * .7, `${mode.id}: lower track fader must lower actual saved audio`);
    reports.push(result);
    console.log(`${mode.id}: ${result.tracks.map((track) => `${track.instrumentId}=${track.rms.toFixed(4)}`).join(", ")}`);
  }
  assert.deepEqual(errors, [], "Browser must render and mix without runtime errors");
  assert.deepEqual(warnings, [], "Selected tracks must use actual samples successfully");
  const report = { modes: reports, soloLevels, errors, warnings };
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verifiedModes: reports.length,
    isolatedTracks: reports.reduce((count, mode) => count + mode.tracks.length, 0), outputDir }));
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true });
    console.error(JSON.stringify({ errors, warnings, tracks: await page.locator('[data-testid^="mixer-track-"]').allTextContents() }));
  }
  throw error;
} finally {
  await browser.close();
}
