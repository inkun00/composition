import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ACCOMPANIMENT_URL || "http://127.0.0.1:4176/";
const outputDir = path.resolve("artifacts/sample-sustain");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});

try {
  const page = await browser.newPage();
  await page.goto(baseUrl);
  const reports = await page.evaluate(async () => {
    const { Scheduler, Soundfont } = await import("/node_modules/smplr/dist/index.mjs");
    const { loadSampleInstrument, queueSampleNote, releaseSampleContext } = await import("/src/audio/samplePlayer.ts");
    const instruments = ["clarinet", "recorder", "flute", "violin", "cello"];
    const scenarios = instruments.flatMap((instrument) =>
      [44100, 48000].map((sampleRate) => ({ instrument, sampleRate })));
    const reports = [];
    for (const { instrument, sampleRate } of scenarios) {
      for (const mode of ["natural", "raw-loop", "app"]) {
        const context = new OfflineAudioContext(1, sampleRate * 8, sampleRate);
        const gain = context.createGain();
        gain.gain.value = .2;
        gain.connect(context.destination);
        let sampler;
        if (mode === "app") {
          const loaded = await loadSampleInstrument(context, gain, instrument);
          sampler = loaded.player;
          queueSampleNote(loaded, context, gain, 67, .1, 6, 70 / (9 * 127));
        } else {
          sampler = Soundfont(context, {
            instrument, kit: "FluidR3_GM", loadLoopData: mode === "raw-loop", destination: gain,
            scheduler: Scheduler(context, { lookaheadMs: 9000 })
          });
          await sampler.ready;
          sampler.start({ note: 67, time: .1, duration: 6, velocity: 70 });
        }
        const rendered = await context.startRendering();
        const data = rendered.getChannelData(0);
        const rms = (start, end) => {
          let sum = 0;
          const from = Math.round(start * context.sampleRate);
          const to = Math.round(end * context.sampleRate);
          for (let index = from; index < to; index += 1) sum += data[index] ** 2;
          return Math.sqrt(sum / (to - from));
        };
        let peak = 0;
        let maxAdjacentDelta = 0;
        for (let index = 1; index < data.length; index += 1) {
          peak = Math.max(peak, Math.abs(data[index]));
          if (index > context.sampleRate * 2 && index < context.sampleRate * 6) {
            maxAdjacentDelta = Math.max(maxAdjacentDelta, Math.abs(data[index] - data[index - 1]));
          }
        }
        reports.push({
          instrument, sampleRate, mode, peak, maxAdjacentDelta,
          earlyRms: rms(.5, 1), lateRms: rms(5, 6), releasedRms: rms(7, 8),
          halfSecondRms: Array.from({ length: 14 }, (_, index) => rms(index * .5, (index + 1) * .5))
        });
        sampler.dispose();
        releaseSampleContext(context);
      }
    }
    return reports;
  });
  for (const looped of reports.filter((report) => report.mode === "app")) {
    const { instrument, sampleRate } = looped;
    const plain = reports.find((report) => report.instrument === instrument && report.sampleRate === sampleRate && report.mode === "natural");
    assert.ok(looped.lateRms > .001, `${instrument} must remain audible for the scheduled six-second note`);
    assert.ok(looped.lateRms > plain.lateRms * 3, `${instrument} loop metadata must extend the natural sample`);
    assert.ok(looped.releasedRms < .00001, `${instrument} must stop after the requested duration and release`);
  }
  for (const sampleRate of [44100, 48000]) {
    const recorderRaw = reports.find((report) => report.instrument === "recorder" && report.sampleRate === sampleRate && report.mode === "raw-loop");
    const recorderApp = reports.find((report) => report.instrument === "recorder" && report.sampleRate === sampleRate && report.mode === "app");
    assert.ok(recorderApp.maxAdjacentDelta < recorderRaw.maxAdjacentDelta * .7,
      "Recorder loop seam smoothing must reduce the discontinuity in the actual rendered signal");
  }
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports.map(({ halfSecondRms, ...summary }) => summary), null, 2));
} finally {
  await browser.close();
}
