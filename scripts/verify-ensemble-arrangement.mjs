import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.ACCOMPANIMENT_URL || "http://127.0.0.1:4176/";
const outputDir = path.resolve("artifacts/ensemble-arrangement");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const errors = [];
const warnings = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning" && /샘플|sample|scribble|polyfill/i.test(message.text())) warnings.push(message.text());
  });
  await page.goto(`${baseUrl}?start=new`);
  const result = await page.evaluate(async () => {
    const { planAccompanimentEnsemble } = await import("/src/audio/ensemblePerformance.ts");
    const { createArrangementVoiceState } = await import("/src/audio/accompanimentPerformance.ts");
    const { ensembleContextForMeasure } = await import("/src/music/accompanimentEnsemble.ts");
    const { prepareAccompaniment, buildIntroMeasures, buildOutroMeasures, chordPitches,
      scheduleMeasure, songArrangementPlan } = await import("/src/audio/accompanimentScore.ts");
    const { loadAccompanimentLayers, releaseAccompanimentRuntime } = await import("/src/audio/accompanimentRuntime.ts");
    const { releaseSampleContext } = await import("/src/audio/samplePlayer.ts");
    const { findInstrument } = await import("/src/music/instruments.ts");
    const { accompanimentInstrumentProfile } = await import("/src/music/accompaniment.ts");
    const { chordPitchClasses } = await import("/src/music/chord.ts");
    const { exportBackingCompositionMp3Offline } = await import("/src/audio/player.ts");

    const instrumentIds = ["bright_acoustic_piano", "acoustic_bass", "clarinet", "recorder"];
    const bpm = 96;
    const secondsPerBeat = 60 / bpm;
    const meter = { beats: 4, beatUnit: 4 };
    const accompaniment = { styleId: "arpeggio", instrumentIds, meter };
    const pitches = [
      [60, 62, 64, 65, 67, 64, 62, 60],
      [62, 64, 65, 67, 69, 65, 64, 62],
      [64, 65, 67, 69, 67, 64, 62, 60],
      [65, 67, 69, 67, 65, 62, 59, 62],
      [69, 71, 72, 71, 69, 65, 64, 62],
      [67, 69, 67, 64, 65, 64, 62, 60],
      [62, 65, 69, 67, 65, 64, 62, 59],
      [64, 67, 65, 64, 62, 60, 62, 60]
    ];
    const chords = [["C", "F"], ["Dm", "G"], ["C", "Am"], ["F", "G"],
      ["Am", "Dm"], ["F", "C/E"], ["Dm", "G7"], ["C", "C"]];
    const measures = pitches.map((bar, measureIndex) => ({
      harmony: "home", measureIndex, chords: chords[measureIndex], isSongEnding: measureIndex === 7,
      notes: bar.map((pitch, index) => ({ id: `student-${measureIndex}-${index}`, pitch,
        duration: { numerator: 1, denominator: 2 } }))
    }));
    const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    const pc = (pitch) => ((pitch % 12) + 12) % 12;
    const compile = (sourceMeasures, selectedOptions) => {
      const prepared = prepareAccompaniment(selectedOptions, sourceMeasures);
      const state = createArrangementVoiceState();
      const sections = { intro: buildIntroMeasures(sourceMeasures), song: sourceMeasures,
        outro: buildOutroMeasures(sourceMeasures) };
      const score = [];
      for (const [section, bars] of Object.entries(sections)) {
        bars.forEach((measure, index) => {
          const measureIndex = measure.measureIndex ?? index;
          const ensemble = ensembleContextForMeasure(prepared.ensembleScore[section], measureIndex);
          const layers = planAccompanimentEnsemble({
            notes: measure.notes, chords: measure.chords, fallbackPitches: chordPitches[measure.harmony],
            styleId: selectedOptions.styleId, secondsPerBeat, measureIndex, meter, section, state, ensemble,
            transitionFill: section === "intro" ? index === bars.length - 1 : section === "song" && (measureIndex + 1) % 4 === 0,
            ending: section === "song" ? measure.isSongEnding : section === "outro" && index === bars.length - 1
          }, selectedOptions.instrumentIds);
          for (const [instrumentId, notes] of layers) score.push({ section, measureIndex, instrumentId, notes });
        });
      }
      return { prepared, score };
    };
    const { prepared, score } = compile(measures, accompaniment);
    const song = score.filter((bar) => bar.section === "song");
    const trackScores = Object.fromEntries(instrumentIds.map((id) => [id, song.filter((bar) => bar.instrumentId === id)]));
    const soloScoreEquality = Object.fromEntries(instrumentIds.map((id) => [id, same(score,
      compile(measures, { ...accompaniment, soloInstrumentId: id }).score)]));
    const captureScheduledNotes = async (soloInstrumentId) => {
      const context = new OfflineAudioContext(2, 44100, 44100);
      const master = context.createGain();
      const options = prepareAccompaniment({ ...accompaniment, soloInstrumentId }, measures);
      const layers = await loadAccompanimentLayers(context, master, options);
      const events = Object.fromEntries(instrumentIds.map((id) => [id, []]));
      const gains = Object.fromEntries(layers.map((layer) => [layer.id, layer.destination.gain.value]));
      try {
        for (const layer of layers) {
          if (!layer.sample) throw new Error(`A real sample must be ready: ${layer.id}`);
          // Capture exactly what the shared live/export scheduler hands to the
          // actual loaded sample players, without letting wall-clock timers run.
          layer.sample.player.start = (event) => { events[layer.id].push(event); return () => {}; };
        }
        const state = createArrangementVoiceState();
        let cursor = .08;
        const sections = { intro: buildIntroMeasures(measures), song: measures, outro: buildOutroMeasures(measures) };
        for (const [section, bars] of Object.entries(sections)) {
          bars.forEach((measure, index) => {
            const plan = songArrangementPlan(index, bars.length, layers.length);
            cursor += scheduleMeasure(context, master, measure, cursor, secondsPerBeat, {
              instrument: findInstrument("bright_acoustic_piano"), sampledInstrument: null,
              accompaniment: options, accompanimentLayers: layers, voiceState: state,
              includeMelody: false, includeEffects: section === "song", arrangementSection: section,
              transitionFill: section === "intro" ? index === bars.length - 1
                : section === "song" && (measure.measureIndex + 1) % 4 === 0,
              ending: section === "song" ? measure.isSongEnding : section === "outro" && index === bars.length - 1,
              arrangementEnergy: section === "song" ? plan.energy : .98
            });
          });
        }
        return { events, gains };
      } finally {
        releaseAccompanimentRuntime(context);
        releaseSampleContext(context);
      }
    };
    const scheduled = await captureScheduledNotes();
    const scheduledSoloEquality = {};
    const soloBusIsolation = {};
    for (const id of instrumentIds) {
      const solo = await captureScheduledNotes(id);
      scheduledSoloEquality[id] = same(scheduled.events[id], solo.events[id]);
      soloBusIsolation[id] = Object.entries(solo.gains).every(([track, gain]) => track === id ? gain > 0 : gain === 0);
    }
    const reverse = compile(measures, { ...accompaniment, instrumentIds: [...instrumentIds].reverse() });
    const selectionOrderEquality = same(score, reverse.score);
    const altered = compile(measures.map((bar) => ({ ...bar,
      notes: [...bar.notes].reverse().map((note) => ({ ...note, pitch: note.pitch + 12 })) })), accompaniment);
    const melodyChangesArrangement = !same(song.filter((bar) => ["clarinet", "recorder"].includes(bar.instrumentId)),
      altered.score.filter((bar) => bar.section === "song" && ["clarinet", "recorder"].includes(bar.instrumentId)));

    const coverage = (notes) => {
      let end = 0;
      let total = 0;
      for (const note of [...notes].sort((left, right) => left.offsetSeconds - right.offsetSeconds)) {
        const from = Math.max(end, note.offsetSeconds);
        const to = Math.min(4 * secondsPerBeat, note.offsetSeconds + note.durationSeconds);
        total += Math.max(0, to - from);
        end = Math.max(end, to);
      }
      return total / (4 * secondsPerBeat);
    };
    const tracks = Object.fromEntries(instrumentIds.map((id) => {
      const bars = trackScores[id];
      const notes = bars.flatMap((bar) => bar.notes);
      const intervals = notes.slice(1).map((note, index) => note.pitch - notes[index].pitch);
      const [min, max] = accompanimentInstrumentProfile(id, 0).range;
      const wrongChordNotes = [];
      const badRanges = [];
      for (const bar of bars) for (const note of bar.notes) {
        const index = Math.min(1, Math.floor((note.offsetSeconds + .0001) / (2 * secondsPerBeat)));
        if (!chordPitchClasses(chords[bar.measureIndex][index]).includes(pc(note.pitch))) wrongChordNotes.push({ bar: bar.measureIndex, ...note });
        if (note.pitch < min || note.pitch > max) badRanges.push(note);
      }
      return [id, { notes: notes.length, uniquePitches: [...new Set(notes.map((note) => note.pitch))],
        noteCountsByBar: bars.map((bar) => bar.notes.length), coverageByBar: bars.map((bar) => coverage(bar.notes)),
        averageCoverage: bars.reduce((sum, bar) => sum + coverage(bar.notes), 0) / bars.length,
        meanDurationBeats: notes.reduce((sum, note) => sum + note.durationSeconds / secondsPerBeat, 0) / notes.length,
        meanAbsoluteInterval: intervals.reduce((sum, interval) => sum + Math.abs(interval), 0) / intervals.length,
        maximumLeap: Math.max(...intervals.map(Math.abs)), wrongChordNotes, badRanges }];
    }));
    const clarinet = trackScores.clarinet;
    const recorder = trackScores.recorder;
    let sameOnsetPitch = 0;
    for (const bar of clarinet) for (const note of bar.notes) {
      const peers = recorder.find((other) => other.measureIndex === bar.measureIndex).notes;
      if (peers.some((peer) => peer.pitch === note.pitch && Math.abs(peer.offsetSeconds - note.offsetSeconds) < .03)) sameOnsetPitch += 1;
    }
    const windUnisonOnsetRatio = sameOnsetPitch / Math.max(1, tracks.clarinet.notes);

    const audio = [];
    const decoder = new AudioContext();
    for (const soloInstrumentId of [undefined, ...instrumentIds]) {
      const blob = await exportBackingCompositionMp3Offline(measures, "bright_acoustic_piano", bpm,
        { ...accompaniment, ...(soloInstrumentId ? { soloInstrumentId } : {}) });
      if (!blob) throw new Error("Offline exporter was unexpectedly busy");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const buffer = await decoder.decodeAudioData(bytes.buffer.slice(0));
      const bodyStart = .08 + 4 * 4 * secondsPerBeat;
      const bodyLength = 8 * 4 * secondsPerBeat;
      const rms = (start, duration) => {
        const data = buffer.getChannelData(0);
        const from = Math.round(start * buffer.sampleRate);
        const to = Math.min(data.length, Math.round((start + duration) * buffer.sampleRate));
        let sum = 0;
        for (let index = from; index < to; index += 1) sum += data[index] ** 2;
        return Math.sqrt(sum / Math.max(1, to - from));
      };
      let peak = 0;
      let clippedSamples = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        for (const sample of buffer.getChannelData(channel)) {
          peak = Math.max(peak, Math.abs(sample));
          if (Math.abs(sample) >= .999) clippedSamples += 1;
        }
      }
      let binary = "";
      for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
      audio.push({ id: soloInstrumentId ?? "ensemble", base64: btoa(binary), bytes: bytes.length,
        durationSeconds: buffer.duration, rms: rms(bodyStart, bodyLength), peak, clippedSamples,
        bodyBarsRms: measures.map((_, bar) => rms(bodyStart + bar * 4 * secondsPerBeat, 4 * secondsPerBeat)) });
    }
    await decoder.close();
    return { bpm, meter, style: accompaniment.styleId, measures, roles: prepared.ensembleScore.song.roles,
      soloScoreEquality, scheduledSoloEquality, soloBusIsolation, selectionOrderEquality,
      melodyChangesArrangement, tracks, windUnisonOnsetRatio, score, audio };
  });
  const audioReport = [];
  for (const { base64, ...audio } of result.audio) {
    await writeFile(path.join(outputDir, `${audio.id}.mp3`), Buffer.from(base64, "base64"));
    audioReport.push(audio);
    assert.ok(audio.rms > .001, `${audio.id}: the actual body must remain audible`);
    assert.ok(audio.bodyBarsRms.every((value) => value > .001), `${audio.id}: every body bar must be audible`);
    assert.equal(audio.clippedSamples, 0, `${audio.id}: export must not clip`);
  }
  assert.ok(Object.values(result.soloScoreEquality).every(Boolean), "Solo must retain the ensemble score");
  assert.ok(Object.values(result.scheduledSoloEquality).every(Boolean), "Solo must retain actual queued note times, lengths and velocities");
  assert.ok(Object.values(result.soloBusIsolation).every(Boolean), "Solo must mute the other actual audio buses");
  assert.ok(result.selectionOrderEquality, "Selection order must not change musical roles or notes");
  assert.ok(result.melodyChangesArrangement, "Changing the student melody must influence the wind parts");
  for (const [id, track] of Object.entries(result.tracks)) {
    assert.equal(track.wrongChordNotes.length, 0, `${id}: every planned note must match its actual chord`);
    assert.equal(track.badRanges.length, 0, `${id}: every planned note must stay in the instrument range`);
    if (["clarinet", "recorder"].includes(id)) {
      assert.ok(track.averageCoverage > .4, `${id}: a connected phrase must replace the one-note fallback`);
      assert.ok(track.meanDurationBeats > .5, `${id}: notes must have room to sustain`);
      assert.ok(track.uniquePitches.length >= 3, `${id}: phrases must move through the progression`);
      assert.ok(track.maximumLeap <= 12, `${id}: the line must retain a singable register`);
    }
  }
  assert.ok(result.windUnisonOnsetRatio < .3, "The two wind parts must not duplicate the same note entrances");
  assert.deepEqual(errors, [], "Browser and module imports must have no runtime errors");
  const { audio, ...rest } = result;
  const report = { ...rest, audio: audioReport, errors, warnings };
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, measures: undefined, score: undefined }, null, 2));
} finally {
  await browser.close();
}
