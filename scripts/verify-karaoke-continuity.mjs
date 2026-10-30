import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const outputDir = path.resolve("artifacts/karaoke-continuity");
// Re-check recorded PCM metrics without repeating a long capture when only a
// validation threshold changes. This mode never synthesizes or replaces data.
if (process.argv.includes("--validate-report")) {
  const captured = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"));
  validateReport(captured);
  delete captured.failure;
  captured.result = "passed";
  captured.validationMode = "existing-real-audio-capture";
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(captured, null, 2));
  console.log(JSON.stringify(captured, null, 2));
  process.exit(0);
}

const server = await createServer({
  optimizeDeps: { entries: ["index.html"] },
  plugins: [{ name: "isolated-karaoke-continuity-page", configureServer(vite) {
    vite.middlewares.use((request, response, next) => {
      if (request.url?.split("?")[0] !== "/__karaoke_continuity") return next();
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><title>Karaoke continuity verification</title><body>Isolated audio test</body>");
    });
  } }],
  server: { host: "127.0.0.1", port: 0 }
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true, args: ["--autoplay-policy=no-user-gesture-required"]
});
const report = { baseUrl, errors: [], scenarios: [] };
let page;
try {
  page = await browser.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().startsWith("CONTINUITY ")) console.log(message.text());
  });
  await page.goto(`${baseUrl}__karaoke_continuity`);
  const result = await page.evaluate(async () => {
    const { practiceKaraokeComposition, recordKaraokeComposition, stopPlayback } = await import("/src/audio/player.ts");
    const { startPcmStreamCapture } = await import("/src/audio/pcmRecorder.ts");
    const { createProtectedMaster } = await import("/src/audio/accompanimentScore.ts");
    const NativeContext = window.AudioContext;
    const contexts = [];
    const starts = [];
    const origins = [];
    const microphoneContexts = [];
    const microphoneTracks = [];
    const practiceCapture = new Map();
    let scenario = "idle";
    let runningStalls;
    let stallCount = 0;
    let oscillatorNodes = 0;
    let onSourceStarted;
    const originalSource = NativeContext.prototype.createBufferSource;
    const originalConnect = AudioNode.prototype.connect;
    const originalOscillator = NativeContext.prototype.createOscillator;
    class TracedContext extends NativeContext {
      constructor(...args) {
        super(...args);
        contexts.push(this);
        const nativeClose = this.close.bind(this);
        this.close = async () => {
          const capture = practiceCapture.get(this);
          if (capture && !capture.pcm) capture.pcm = await (await capture.pending).stop();
          return this.state === "closed" ? undefined : nativeClose();
        };
      }
    }
    window.AudioContext = TracedContext;
    function startStalls() {
      if (runningStalls) return;
      runningStalls = window.setInterval(() => {
        const end = performance.now() + 260;
        while (performance.now() < end) { /* Deliberate main-thread stall. */ }
        stallCount += 1;
      }, 700);
    }
    function stopStalls() {
      window.clearInterval(runningStalls);
      runningStalls = undefined;
    }
    TracedContext.prototype.createOscillator = function () {
      oscillatorNodes += 1;
      return originalOscillator.call(this);
    };
    TracedContext.prototype.createBufferSource = function () {
      const source = originalSource.call(this);
      const nativeStart = source.start.bind(source);
      source.start = (...args) => {
        const event = { context: this, source, buffer: source.buffer, start: args[0] ?? this.currentTime,
          callTime: this.currentTime, loop: source.loop, scenario };
        starts.push(event);
        if (!source.loop && source.buffer?.duration > 10) {
          if (["practice", "recording"].includes(scenario)) startStalls();
          onSourceStarted?.(event);
        }
        return nativeStart(...args);
      };
      return source;
    };
    AudioNode.prototype.connect = function (destination, ...args) {
      const connected = originalConnect.call(this, destination, ...args);
      if (contexts.includes(this.context) && destination instanceof AudioWorkletNode) {
        origins.push({ context: this.context, at: this.context.currentTime, source: this });
      }
      if (scenario.startsWith("practice") && contexts.includes(this.context) &&
          destination === this.context.destination && !practiceCapture.has(this.context)) {
        const capture = {};
        practiceCapture.set(this.context, capture);
        capture.pending = startPcmStreamCapture(this.context, this);
      }
      return connected;
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      enumerateDevices: async () => [],
      getUserMedia: async () => {
        const context = new NativeContext({ sampleRate: 48000 });
        await context.resume();
        const destination = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        oscillator.frequency.value = 997;
        const gain = context.createGain();
        gain.gain.value = .075;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        microphoneContexts.push(context);
        microphoneTracks.push(...destination.stream.getTracks());
        return destination.stream;
      }
    } });
    const measures = Array.from({ length: 4 }, (_, index) => ({
      harmony: "home", chords: [["C"], ["F"], ["G"], ["C"]][index], measureIndex: index,
      notes: Array.from({ length: 8 }, (_, noteIndex) => ({
        id: `note-${index}-${noteIndex}`, pitch: [72, 74, 76, 79, 76, 74, 72, 67][noteIndex],
        lyric: Array.from("함께즐겁게노래해")[noteIndex], duration: { numerator: 1, denominator: 2 }
      })), effects: [{ id: `fx-${index}`, effectId: "bell", offsetBeats: .75 }]
    }));
    const trackStates = [];
    const accompaniment = { styleId: "folk", meter: { beats: 4, beatUnit: 4 },
      instrumentIds: ["acoustic_grand_piano", "acoustic_guitar_steel", "string_ensemble_1", "acoustic_bass"],
      beatPattern: Array.from({ length: 4 }, (_, measureIndex) =>
        ["kick", "snare", "hihat"].flatMap((instrumentId) =>
          Array.from({ length: 16 }, (_, slot) => ({ id: `${measureIndex}-${instrumentId}-${slot}`,
            instrumentId, measureIndex, offsetBeats: slot / 4 })))).flat(),
      beatVolume: .65, onTrackState: (state) => trackStates.push(state)
    };
    const bpm = 180;
    const countIn = { beats: 4, unitBeats: 1 };
    const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const rms = (data, from = 0, to = data.length) => {
      let sum = 0;
      for (let index = Math.max(0, from); index < Math.min(to, data.length); index += 1) sum += data[index] ** 2;
      return Math.sqrt(sum / Math.max(1, Math.min(to, data.length) - Math.max(0, from)));
    };
    function continuity(captured, reference, rate, expectedOffset) {
      // Compare inside the song, where the isolated guide actually sounds.
      const from = Math.round(rate * 6.5);
      const to = Math.min(reference.length, Math.round(rate * 10));
      const correlation = (offset) => {
        let xx = 0;
        let yy = 0;
        let xy = 0;
        for (let index = from; index < to; index += 17) {
          const x = reference[index];
          const y = captured[index + offset] ?? 0;
          xx += x * x;
          yy += y * y;
          xy += x * y;
        }
        return xy / Math.sqrt(Math.max(1e-18, xx * yy));
      };
      let offset = Math.round(expectedOffset * rate);
      let best = -Infinity;
      const center = offset;
      for (let candidate = center - Math.round(.09 * rate); candidate <= center + .09 * rate; candidate += 24) {
        const value = correlation(candidate);
        if (value > best) {
          best = value;
          offset = candidate;
        }
      }
      const coarse = offset;
      for (let candidate = coarse - 24; candidate <= coarse + 24; candidate += 1) {
        const value = correlation(candidate);
        if (value > best) {
          best = value;
          offset = candidate;
        }
      }
      const windows = [];
      for (let seconds = .1; seconds + .1 < reference.length / rate - .35; seconds += .1) {
        const start = Math.round(seconds * rate);
        const end = start + Math.round(.1 * rate);
        const source = rms(reference, start, end);
        const actual = rms(captured, start + offset, end + offset);
        windows.push({ seconds: +seconds.toFixed(1), source, actual });
      }
      const missing = windows.filter((window) => window.source > .0005 && window.actual < window.source * .08);
      return { alignmentSeconds: offset / rate, correlation: best,
        activeWindows: windows.filter((window) => window.source > .0005).length,
        missingWindows: missing, minAudibleRms: Math.min(...windows.filter((window) => window.source > .0005).map((window) => window.actual)) };
    }
    function sourceSet(mode) { return starts.filter((event) => event.scenario === mode && !event.loop && event.buffer?.duration > 10); }
    function callbacks(phases) {
      return { recordingMode: "personal", guideMelodyMode: "soft",
        onStatus: (status) => console.log(`CONTINUITY ${scenario}: ${status}`),
        onPhase: (phase) => {
          phases.push(phase);
          if (phase === "encoding" || phase === "done") stopStalls();
        } };
    }
    const scenarios = [];
    try {
      scenario = "practice";
      const practicePhases = [];
      const beforePractice = performance.now();
      const practiceDuration = await practiceKaraokeComposition(measures, "flute", bpm, accompaniment,
        callbacks(practicePhases), countIn);
      stopStalls();
      const practiceSources = sourceSet(scenario);
      const practiceContext = practiceSources[0].context;
      const practicePcm = practiceCapture.get(practiceContext).pcm;
      const practiceReferenceContext = new OfflineAudioContext(2, practiceSources[0].buffer.length, practiceContext.sampleRate);
      const referenceMaster = createProtectedMaster(practiceReferenceContext, practiceReferenceContext.destination, .84);
      for (const entry of practiceSources) {
        const source = practiceReferenceContext.createBufferSource();
        source.buffer = entry.buffer;
        source.connect(referenceMaster);
        source.start(0);
      }
      const practiceReference = await practiceReferenceContext.startRendering();
      const practiceOrigin = origins.find((origin) => origin.context === practiceContext).at;
      const practiceContinuity = continuity(practicePcm, practiceReference.getChannelData(0), practiceContext.sampleRate,
        practiceSources[0].start - practiceOrigin);
      scenarios.push({ mode: "practice", elapsedSeconds: (performance.now() - beforePractice) / 1000,
        duration: practiceDuration, liveSources: practiceSources.length, phases: practicePhases,
        stalls: stallCount, continuity: practiceContinuity, contextClosed: practiceContext.state === "closed" });

      scenario = "recording";
      stallCount = 0;
      const recordingPhases = [];
      const result = await recordKaraokeComposition(measures, "flute", bpm, accompaniment,
        callbacks(recordingPhases), countIn);
      stopStalls();
      if (!result) throw new Error("Recording did not return a result");
      const recordingSources = sourceSet(scenario);
      const recordingContext = recordingSources[0].context;
      const recordingOrigins = origins.filter((origin) => origin.context === recordingContext);
      const backingReference = recordingSources[0].buffer;
      const backingPcm = result.backingAudioBuffer.getChannelData(0);
      const backingContinuity = continuity(backingPcm, backingReference.getChannelData(0), recordingContext.sampleRate,
        recordingSources[0].start - recordingOrigins[1].at);
      const mixedReference = new Float32Array(backingReference.length);
      const dry = backingReference.getChannelData(0);
      const guide = recordingSources[1].buffer.getChannelData(0);
      for (let index = 0; index < dry.length; index += 1) mixedReference[index] = dry[index] + guide[index];
      const guideIncluded = continuity(backingPcm, mixedReference, recordingContext.sampleRate, backingContinuity.alignmentSeconds);
      const vocal = result.vocalAudioBuffer.getChannelData(0);
      const vocalWindows = [];
      for (let time = .2; time < vocal.length / recordingContext.sampleRate - .2; time += .1) {
        vocalWindows.push(rms(vocal, Math.round(time * recordingContext.sampleRate), Math.round((time + .1) * recordingContext.sampleRate)));
      }
      const barRms = Array.from({ length: 12 }, (_, bar) => rms(dry,
        Math.round(bar * 4 * 60 / bpm * recordingContext.sampleRate),
        Math.round((bar + 1) * 4 * 60 / bpm * recordingContext.sampleRate)));
      scenarios.push({ mode: "recording", duration: result.durationSeconds,
        capturedDuration: result.backingAudioBuffer.duration, introSeconds: result.introSeconds,
        liveSources: recordingSources.length, loopSources: starts.filter((entry) => entry.scenario === scenario && entry.loop).length,
        phases: recordingPhases, stalls: stallCount, continuity: backingContinuity,
        guideIncludedCorrelation: guideIncluded.correlation, minVoiceWindowRms: Math.min(...vocalWindows),
        barRms, contextClosed: recordingContext.state === "closed", mp3Bytes: result.blob.size,
        wavBase64: btoa(String.fromCharCode(...new Uint8Array(await result.wavBlob.slice(0, 44).arrayBuffer()))) });

      for (const mode of ["practice-cancel", "recording-cancel"]) {
        scenario = mode;
        const abort = new AbortController();
        let abortTime;
        onSourceStarted = () => {
          if (abortTime !== undefined) return;
          abortTime = performance.now() + 120;
          setTimeout(() => abort.abort(), 120);
        };
        const method = mode.startsWith("practice") ? practiceKaraokeComposition : recordKaraokeComposition;
        let settled;
        try { settled = await method(measures, "flute", bpm, accompaniment, callbacks([]), countIn, abort.signal); }
        catch (error) {
          if (error.name !== "AbortError") throw error;
          settled = "AbortError";
        }
        onSourceStarted = undefined;
        const sources = sourceSet(mode);
        scenarios.push({ mode, settled: settled === null ? "null" : settled, sources: sources.length,
          abortElapsedMs: performance.now() - abortTime,
          contextClosed: sources.every((entry) => entry.context.state === "closed") });
      }
      return { scenarios, oscillatorNodes, trackErrors: trackStates.filter((state) => state.status === "error"),
        instrumentIds: accompaniment.instrumentIds, beatEvents: accompaniment.beatPattern.length,
        microphoneTrackStates: microphoneTracks.map((track) => track.readyState),
        liveContextStates: contexts.map((context) => context.state) };
    } finally {
      stopStalls();
      await stopPlayback();
      for (const context of microphoneContexts) if (context.state !== "closed") await context.close();
      for (const track of microphoneTracks) track.stop();
      window.AudioContext = NativeContext;
      AudioNode.prototype.connect = originalConnect;
    }
  });
  Object.assign(report, result);
  validateReport(report);
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

function validateReport(report) {
  for (const entry of report.scenarios) {
    assert.equal(entry.contextClosed, true, `${entry.mode} must close its audio context`);
    if (entry.mode.endsWith("cancel")) {
      assert.ok(entry.abortElapsedMs < 1800, `${entry.mode} cancellation must release promptly`);
      continue;
    }
    assert.equal(entry.liveSources, 2, `${entry.mode} must use only backing and guide buffer sources`);
    assert.ok(entry.stalls >= 10, `${entry.mode} must actually encounter repeated long main-thread stalls`);
    assert.deepEqual(entry.phases.filter((phase) => phase !== "encoding"), ["intro", "song", "outro", "done"]);
    assert.ok(entry.continuity.correlation > .92, `${entry.mode} output must follow the prepared audio`);
    assert.equal(entry.continuity.missingWindows.length, 0, `${entry.mode} may not have new 100ms silent gaps`);
    assert.ok(entry.continuity.activeWindows > 100);
  }
  const recording = report.scenarios.find((entry) => entry.mode === "recording");
  assert.equal(recording.loopSources, 1);
  assert.ok(recording.minVoiceWindowRms > .025, "Synthetic microphone PCM must remain continuous through stalls");
  assert.ok(recording.capturedDuration >= recording.duration + .55, "PCM must include leading time and final partial-buffer tail");
  assert.ok(recording.barRms.every((value) => value > .0005), "Every authored/intro/outro bar must retain the selected sound");
  assert.ok(recording.continuity.correlation > .999 &&
      recording.continuity.correlation > recording.guideIncludedCorrelation + .005,
    "Captured backing must exclude the monitor-only melody guide");
  assert.equal(report.oscillatorNodes, 0, "Live karaoke may not construct individual synthesis voices");
  assert.deepEqual(report.trackErrors, [], "All four selected instruments must load actual samples");
  assert.ok(report.microphoneTrackStates.every((state) => state === "ended"));
  assert.ok(report.liveContextStates.every((state) => state === "closed"));
  assert.deepEqual(report.errors, []);
}
