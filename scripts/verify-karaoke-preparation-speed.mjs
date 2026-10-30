import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({
  optimizeDeps: { entries: ["index.html"] },
  plugins: [{ name: "isolated-karaoke-speed-page", configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (request.url?.split("?")[0] !== "/__karaoke_speed") return next();
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><title>Karaoke preparation speed</title><body>Isolated audio test</body>");
    });
  } }],
  server: { host: "127.0.0.1", port: 0 }
});
await server.listen();
const outputDir = path.resolve("artifacts/karaoke-preparation-speed");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const report = { baseUrl: server.resolvedUrls.local[0], errors: [] };
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${report.baseUrl}__karaoke_speed`);
  Object.assign(report, await page.evaluate(async ({ diagnoseBeats, beatWaveforms, singleHit }) => {
    const contexts = [];
    const fetches = [];
    let stage = "cold";
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const started = performance.now();
      const response = await nativeFetch(...args);
      fetches.push({ stage, url: String(args[0]), milliseconds: performance.now() - started, status: response.status });
      return response;
    };
    const NativeOffline = window.OfflineAudioContext;
    class TracedOffline extends NativeOffline {
      constructor(...args) {
        super(...args);
        const entry = { stage, created: performance.now(), duration: this.length / this.sampleRate,
          decodeCalls: 0, decodedBytes: 0, decodeMilliseconds: 0, loadMilliseconds: 0, renderMilliseconds: 0 };
        contexts.push(entry);
        const decode = this.decodeAudioData.bind(this);
        this.decodeAudioData = async (...decodeArgs) => {
          entry.decodeCalls += 1;
          const started = performance.now();
          const buffer = await decode(...decodeArgs);
          entry.decodeMilliseconds += performance.now() - started;
          entry.decodedBytes += buffer.length * buffer.numberOfChannels * 4;
          return buffer;
        };
        const render = this.startRendering.bind(this);
        this.startRendering = async () => {
          const started = performance.now();
          entry.loadMilliseconds = started - entry.created;
          const buffer = await render();
          entry.renderMilliseconds = performance.now() - started;
          return buffer;
        };
      }
    }
    window.OfflineAudioContext = TracedOffline;
    if (beatWaveforms) {
      const { BEAT_SAMPLE_RATES } = await import("/src/audio/beatSamplePreparation.ts");
      const { BEAT_SAMPLE_URLS, BEAT_SAMPLE_MIX_PROFILES, preloadBeatSamples, scheduleLoadedBeatSample } =
        await import("/src/audio/beatSamples.ts");
      const comparisons = [];
      for (const id of ["kick", "snare", "hihat", "crash"]) {
        const decodeContext = new NativeOffline(2, 1, 48000);
        const raw = await decodeContext.decodeAudioData(await (await nativeFetch(BEAT_SAMPLE_URLS[id])).arrayBuffer());
        const profile = BEAT_SAMPLE_MIX_PROFILES[id];
        async function render(prepared) {
          const context = new NativeOffline(2, 48000 * 4, 48000);
          if (prepared) await preloadBeatSamples(context, [id]);
          for (const [index, rate] of BEAT_SAMPLE_RATES.entries()) {
            if (singleHit && index !== 2) continue;
            const time = singleHit ? 0 : .125 + index * .17;
            if (prepared) {
              if (!scheduleLoadedBeatSample(context, context.destination, time, .08 + index * .02, id, index)) {
                throw new Error(`${id} 실제 비트 샘플이 준비되지 않았습니다.`);
              }
              continue;
            }
            const source = context.createBufferSource();
            const gain = context.createGain();
            source.buffer = raw;
            source.playbackRate.value = rate;
            gain.gain.setValueAtTime((.08 + index * .02) * profile.outputGain, time);
            if (id === "crash") gain.gain.exponentialRampToValueAtTime(.0001, time + 1.45);
            {
              const filter = context.createBiquadFilter();
              filter.type = profile.filterType;
              filter.frequency.value = profile.frequency;
              filter.gain.value = profile.filterGain;
              if (profile.q !== undefined) filter.Q.value = profile.q;
              const compressor = context.createDynamicsCompressor();
              compressor.threshold.value = -12;
              compressor.knee.value = 8;
              compressor.ratio.value = 2;
              compressor.attack.value = .006;
              compressor.release.value = .09;
              source.connect(filter).connect(compressor).connect(gain).connect(context.destination);
            }
            source.start(time);
            if (id === "crash") source.stop(time + 1.46);
          }
          return context.startRendering();
        }
        const reference = (await render(false)).getChannelData(0);
        const actual = (await render(true)).getChannelData(0);
        let xx = 0;
        let yy = 0;
        let xy = 0;
        let error = 0;
        let peakError = 0;
        for (let index = 0; index < reference.length; index += 1) {
          const x = reference[index];
          const y = actual[index];
          xx += x * x;
          yy += y * y;
          xy += x * y;
          error += (x - y) ** 2;
          peakError = Math.max(peakError, Math.abs(x - y));
        }
        comparisons.push({ instrumentId: id, correlation: xy / Math.sqrt(xx * yy),
          relativeErrorRms: Math.sqrt(error / xx), peakError });
      }
      return { comparisons, contexts, fetches };
    }
    const { prepareKaraokeAudio } = await import("/src/audio/karaokePreparation.ts");
    const measures = Array.from({ length: 4 }, (_, index) => ({
      harmony: "home", chords: [["C"], ["F"], ["G"], ["C"]][index], measureIndex: index,
      notes: Array.from({ length: 8 }, (_, noteIndex) => ({
        id: `note-${index}-${noteIndex}`, pitch: [72, 74, 76, 79, 76, 74, 72, 67][noteIndex],
        lyric: Array.from("함께즐겁게노래해")[noteIndex], duration: { numerator: 1, denominator: 2 }
      })), effects: [{ id: `fx-${index}`, effectId: "bell", offsetBeats: .75 }]
    }));
    const instrumentIds = ["acoustic_grand_piano", "acoustic_guitar_steel", "string_ensemble_1", "acoustic_bass"];
    const accompaniment = { styleId: "folk", meter: { beats: 4, beatUnit: 4 }, instrumentIds,
      beatPattern: Array.from({ length: 4 }, (_, measureIndex) =>
        ["kick", "snare", "hihat"].flatMap((instrumentId) =>
          Array.from({ length: 16 }, (_, slot) => ({ id: `${measureIndex}-${instrumentId}-${slot}`,
            instrumentId, measureIndex, offsetBeats: slot / 4 })))).flat(), beatVolume: .65 };
    const options = { sampleRate: 48000, mode: "recording", guideMode: "first-note" };
    const runs = [];
    let firstBacking;
    const samples = (audio) => {
      const backing = audio.backing.getChannelData(0);
      const guide = audio.guide?.getChannelData(0);
      let backingPower = 0;
      let guidePower = 0;
      let checksum = 0;
      let guideChecksum = 0;
      for (let index = 0; index < backing.length; index += 97) {
        backingPower += backing[index] ** 2;
        guidePower += (guide?.[index] ?? 0) ** 2;
        checksum += backing[index] * (1 + index % 11);
        guideChecksum += (guide?.[index] ?? 0) * (1 + index % 13);
      }
      return { backingPower, guidePower, checksum, guideChecksum,
        bufferBytes: [audio.backing, audio.guide].filter(Boolean)
          .reduce((total, buffer) => total + buffer.length * buffer.numberOfChannels * 4, 0) };
    };
    const scenarios = diagnoseBeats ? ["no-beats", "sparse-beats", "dense-beats"]
      : ["cold", "repeat", "repeat-new-callback", "new-lyrics", "practice", "recording-soft", "lead-only", "changed-score"];
    for (const name of scenarios) {
      stage = name;
      const contextStart = contexts.length;
      const fetchStart = fetches.length;
      const started = performance.now();
      const input = name === "changed-score"
        ? measures.map((measure, index) => index ? measure : { ...measure,
          notes: measure.notes.map((note, noteIndex) => noteIndex ? note : { ...note, pitch: 84 }) })
        : name === "new-lyrics" ? measures.map((measure) => ({ ...measure,
          notes: measure.notes.map((note) => ({ ...note, lyric: "새" })) })) : measures;
      const mix = name === "repeat-new-callback" ? { ...accompaniment, onTrackState: () => {} }
        : name === "no-beats" ? { ...accompaniment, beatPattern: [] }
          : name === "sparse-beats" ? { ...accompaniment, beatPattern: accompaniment.beatPattern.filter((event) => event.offsetBeats === 0) }
            : accompaniment;
      const selectedOptions = name === "practice" ? { ...options, mode: "practice" }
        : name === "recording-soft" ? { ...options, guideMode: "soft" } : options;
      const audio = await prepareKaraokeAudio(input, name === "lead-only" ? "flute" : "acoustic_grand_piano",
        180, mix, selectedOptions);
      runs.push({ name, milliseconds: performance.now() - started, contexts: contexts.slice(contextStart),
        requests: fetches.slice(fetchStart).filter((fetch) => !fetch.url.startsWith("/src/")),
        duration: audio.durationSeconds, backingReused: audio.backing === firstBacking, ...samples(audio) });
      firstBacking ??= audio.backing;
    }
    return { runs, fetches, contexts };
  }, { diagnoseBeats: process.argv.includes("--diagnose-beats"), beatWaveforms: process.argv.includes("--beat-waveforms"),
    singleHit: process.argv.includes("--single-hit") }));
  for (const run of report.runs ?? []) {
    assert.ok(run.backingPower > 1);
    assert.ok(run.guidePower > .001);
    assert.equal(run.duration, run.name === "practice" ? 16.55 : 16.8);
  }
  if (report.comparisons) {
    for (const comparison of report.comparisons) {
      assert.ok(comparison.correlation > .999, `${comparison.instrumentId} processing must retain the original waveform`);
      assert.ok(comparison.relativeErrorRms < .015, `${comparison.instrumentId} must retain the original processing level`);
    }
  } else if (!process.argv.includes("--diagnose-beats")) {
    const cold = report.runs[0];
    for (const name of ["repeat", "repeat-new-callback", "new-lyrics"]) {
      const cached = report.runs.find((run) => run.name === name);
      assert.equal(cached.contexts.length, 0, `${name} must not load or render audio again`);
      assert.equal(cached.backingReused, true, `${name} must reuse the prepared backing`);
      assert.ok(Math.abs(cold.checksum - cached.checksum) < 1e-5,
        `${name} must retain the exact backing output`);
      assert.ok(Math.abs(cold.guideChecksum - cached.guideChecksum) < 1e-5,
        `${name} must retain the exact guide output`);
    }
    for (const name of ["practice", "recording-soft", "lead-only"]) {
      const guideChanged = report.runs.find((run) => run.name === name);
      assert.equal(guideChanged.backingReused, true, `${name} must reuse the prepared backing`);
      assert.equal(guideChanged.contexts.length, 1, `${name} must prepare only its guide`);
    }
    const changed = report.runs.find((run) => run.name === "changed-score");
    assert.equal(changed.backingReused, false, "Changing the score must rebuild its changed backing");
    assert.ok(Math.abs(cold.guideChecksum - changed.guideChecksum) > .01,
      "Changing the score must prepare the new melody instead of reusing a stale guide");
  }
  assert.deepEqual(report.errors, []);
  report.result = "passed";
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
