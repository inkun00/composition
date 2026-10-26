import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { rememberStudioFrame, studioBackground } from "./studio-playback-observations.mjs";

// Mount the real product modal/hook/backend with a genuine WAV because recording
// state is intentionally not persisted in the app draft. No product API is fake.
export async function verifyRecordedStudioPlayback({ page, outputDir, draft, audio }) {
  const sourceRoot = path.resolve("src").replaceAll("\\", "/");
  const source = `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import StudioPlaybackPreview from "${sourceRoot}/musicVideo/StudioPlaybackPreview";
    import { buildRecordedMusicVideoPlan, matchingMusicVideoRecording } from "${sourceRoot}/video/musicVideoRecording";
    import { runExclusiveAudioExport } from "${sourceRoot}/audio/player";
    const draft = ${JSON.stringify(draft)};
    const duration = 1 + 32 * 60 / draft.bpm + .5;
    const rate = 44100;
    const samples = Math.round(duration * rate);
    const wav = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(wav);
    const label = (offset, text) => [...text].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
    label(0, "RIFF"); view.setUint32(4, wav.byteLength - 8, true); label(8, "WAVE"); label(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); label(36, "data"); view.setUint32(40, samples * 2, true);
    for (let index = 0; index < samples; index++) {
      const tone = .2 * Math.sin(2 * Math.PI * 440 * index / rate) + .05 * Math.sin(2 * Math.PI * 660 * index / rate);
      view.setInt16(44 + index * 2, Math.round(tone * 32767), true);
    }
    const audioUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    const accompaniment = { styleId: draft.accompanimentStyleId, instrumentIds: draft.accompanimentInstrumentIds, meter: draft.meter };
    const plan = buildRecordedMusicVideoPlan(draft.title, draft.measures, draft.bpm, draft.instrumentId, accompaniment, 1, duration);
    const recording = matchingMusicVideoRecording(audioUrl, plan, draft.measures, draft.bpm, draft.instrumentId, accompaniment);
    if (!recording) throw new Error("The actual recording-source validator must accept the matching fixture.");
    const options = { title: draft.title, measures: draft.measures, bpm: draft.bpm, instrumentId: draft.instrumentId,
      accompaniment, scenes: draft.musicVideoScenes, animated: true, recording };
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const state = { busy: false, closed: false, duration, samples, rate, release: null, lock: null };
    state.block = () => {
      state.lock = runExclusiveAudioExport(() => new Promise(resolve => { state.release = resolve; }));
      return true;
    };
    state.unblock = async () => { state.release?.(true); await state.lock; };
    state.dispose = () => { root.unmount(); host.remove(); URL.revokeObjectURL(audioUrl); state.closed = true; };
    window.__recordingPlayback = state;
    root.render(<StudioPlaybackPreview options={options} onBusyChange={busy => { state.busy = busy; }} onClose={state.dispose} />);
  `;
  const entry = path.join(outputDir, "actual-recording-playback.generated.tsx");
  await writeFile(entry, source);
  // Use the same browser bundler as the product, including its normal browser
  // externalization of Node-only MIDI imports. Nothing is patched in the app.
  const bundled = await build({ configFile: false, plugins: [react()], logLevel: "silent",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: { write: false, emptyOutDir: false, target: "es2022", minify: false,
      lib: { entry, formats: ["iife"], name: "ActualRecordingPlayback" } } });
  const outputs = (Array.isArray(bundled) ? bundled : [bundled]).flatMap((result) => result.output);
  const script = outputs.find((file) => file.type === "chunk" && file.isEntry)?.code;
  assert.ok(script, "The actual product component harness must compile with the product's browser bundler");
  await writeFile(path.join(outputDir, "actual-recording-playback.generated.browser.js"), script);
  await page.addScriptTag({ content: script });
  await page.getByTestId("music-video-preview-dialog").waitFor();
  await page.waitForFunction(() => window.__recordingPlayback.busy);
  assert.equal(await page.getByTestId("music-video-preview-recording").count(), 1);
  await page.evaluate(() => window.__recordingPlayback.block());
  await page.getByTestId("music-video-preview-play").click();
  await page.getByTestId("music-video-preview-retry").waitFor();
  assert.match(await page.getByRole("alert").innerText(), /다른 연주|녹음/);
  await page.screenshot({ path: path.join(outputDir, "studio-recording-busy-error.png") });
  await page.evaluate(() => window.__recordingPlayback.unblock());
  await page.getByTestId("music-video-preview-retry").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="music-video-preview-play"]')?.getAttribute("aria-pressed") === "true");
  const clock = await audio.clock();
  const expected = await page.evaluate(() => ({ duration: window.__recordingPlayback.duration, samples: window.__recordingPlayback.samples }));
  const length = Number(await page.getByTestId("music-video-preview-seek").getAttribute("max"));
  assert.ok(Math.abs(length - expected.duration) < .001);
  const pcm = await audio.pcm(length);
  // decodeAudioData legitimately resamples the 44.1kHz WAV to the native 48kHz
  // playback context. Its duration, channel count and actual signal must match.
  assert.ok(pcm.some((buffer) => buffer.channels === 1 && Math.abs(buffer.duration - expected.duration) < .001 &&
    Math.abs(buffer.samples - Math.round(expected.duration * buffer.sampleRate)) <= 1 && buffer.peak > .1),
    "The recording branch must decode the genuine mono WAV, rather than synthesize replacement music");
  await page.getByTestId("music-video-preview-play").click();
  await page.getByTestId("music-video-preview-seek").evaluate((input) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "4");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await rememberStudioFrame(page, "recording-at-four");
  assert.deepEqual(await studioBackground(page), [252, 232, 230]);
  await page.screenshot({ path: path.join(outputDir, "studio-recording-real-wav.png") });
  await page.getByTestId("music-video-preview-play").click();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="music-video-preview-time"]')?.getAttribute("data-time")) > 4.1);
  await page.getByTestId("music-video-preview-close").click();
  await audio.closed(clock.contextId);
  await page.waitForFunction(() => window.__recordingPlayback.closed && !window.__recordingPlayback.busy);
  assert.equal(await page.getByTestId("music-video-preview-dialog").count(), 0);
  return { actualProductModalHarness: true, genuineWav: true, duration: length, samples: expected.samples, pcm,
    recordingSourceValidated: true, busyConflictAndRetry: true, seekAndResume: true, closeStopsNativeAudio: true, busyReleased: true };
}
