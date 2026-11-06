import assert from "node:assert/strict";
import path from "node:path";

export async function observeDynamicsAudio(context) {
  await context.addInitScript(() => {
    window.__dynamicsProbe = { current: null };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(destination, ...args) {
      if (this instanceof GainNode && destination instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        const trace = { time: this.context.currentTime, samples: [], frequencies: [], notes: [], analyser };
        window.__dynamicsProbe.current = trace;
        connect.call(this, analyser);
        const result = connect.call(analyser, destination, ...args);
        const data = new Float32Array(analyser.fftSize);
        const sample = () => {
          if (window.__dynamicsProbe.current !== trace || this.context.state === "closed") return;
          analyser.getFloatTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
          trace.samples.push({ time: this.context.currentTime - trace.time, rms });
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        return result;
      }
      return connect.call(this, destination, ...args);
    };
    const set = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function(value, time) {
      if (value > 100) window.__dynamicsProbe.current?.frequencies.push(value);
      return set.call(this, value, time);
    };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function(time) {
      window.__dynamicsProbe.current?.notes.push(time);
      return start.call(this, time);
    };
  });
}

export async function verifyDynamics(page, report, outputDir) {
  await page.locator(".arcade-island.island-dynamics").click();
  await page.getByRole("heading", { name: "셈여림 지휘자", exact: true }).waitFor();
  const topStop = page.getByTestId("dynamics-stop-top");
  const choose = (value) => page.locator(`[data-marking="${value}"]`).click();
  async function ended() { await page.waitForFunction(() => document.querySelector('[data-testid="dynamics-stop-top"]')?.disabled); }
  async function trace() {
    return page.evaluate(() => {
      const { samples, frequencies, notes } = window.__dynamicsProbe.current;
      return { samples, frequencies, notes };
    });
  }
  const average = (samples) => samples.reduce((sum, item) => sum + item.rms, 0) / samples.length;
  const audio = {};
  for (const value of ["p", "ff", "crescendo", "decrescendo"]) {
    await choose(value);
    await ended();
    audio[value] = await trace();
  }
  const audible = (value) => audio[value].samples.filter((sample) => sample.time > .15 && sample.time < 4.1);
  const p = average(audible("p"));
  const ff = average(audible("ff"));
  assert.ok(p > .001, `p should produce actual audio, RMS=${p}`);
  assert.ok(ff > p * 3, `ff should sound stronger than p: ${ff}/${p}`);
  for (const value of Object.values(audio)) {
    assert.deepEqual(value.frequencies, audio.p.frequencies, "Dynamics must not change the melody pitches");
    assert.equal(value.notes.length, 8);
    assert.ok(value.notes.slice(1).every((time, index) => Math.abs(time - value.notes[index] - 60 / 112) < .0001));
  }
  for (const marking of ["crescendo", "decrescendo"]) {
    const first = average(audio[marking].samples.filter((item) => item.time > .1 && item.time < 1));
    const last = average(audio[marking].samples.filter((item) => item.time > 3.2 && item.time < 4.1));
    assert.ok(marking === "crescendo" ? last > first * 1.5 : first > last * 1.5, `${marking}: ${first} -> ${last}`);
    report[marking] = { firstRms: first, lastRms: last };
  }
  await choose("p");
  await page.waitForFunction(() => window.__dynamicsProbe.current.samples.some((item) => item.time > .7));
  await choose("ff");
  await ended();
  const live = await trace();
  assert.equal(live.notes.length, 8, "A live change must continue the same phrase");
  assert.ok(average(live.samples.filter((item) => item.time > 1 && item.time < 2)) >
    average(live.samples.filter((item) => item.time > .1 && item.time < .6)) * 2.5);
  report.dynamicsAudio = { pRms: p, ffRms: ff, sameEightPitchesAndBpm: true, liveChangeContinuesPhrase: true };
  console.log("Verified native audio: steady contrast, cresc/decresc, unchanged melody and live control");

  for (const [width, height] of [[1440, 1000], [375, 812], [320, 740], [667, 375]]) {
    await page.setViewportSize({ width, height });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await page.evaluate(() => document.querySelector(".dynamics-sound-meter").getBoundingClientRect().bottom <=
      document.querySelector(".dynamics-score-strip").getBoundingClientRect().top + 1), "The live sound meter must not be covered by the score");
    await page.screenshot({ path: path.join(outputDir, `dynamics-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "도전! 음악회", exact: true }).click();
  const submit = page.getByRole("button", { name: "이대로 연주하기", exact: true });
  for (const [index, target] of ["p", "f", "crescendo", "decrescendo"].entries()) {
    assert.equal(await submit.isDisabled(), true);
    await page.getByRole("button", { name: "목표 연주 듣기", exact: true }).click();
    await ended();
    await choose(target);
    await topStop.click();
    await submit.click();
    await page.locator(".dynamics-result").waitFor();
    if (index < 3) await page.getByRole("button", { name: "다음 미션", exact: true }).click();
  }
  await page.getByRole("heading", { name: "별빛 음악회 완성!", exact: true }).waitFor();
  await page.screenshot({ path: path.join(outputDir, "dynamics-complete.png"), fullPage: true });
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody:games:v1")).dynamics);
  assert.deepEqual(record, { stars: 3, score: 1200 });
  report.checks.push("dynamics: actual audible contrast, continuous crescendo/decrescendo, live choice, fixed pitches/tempo, four listened-and-performed missions, saved reward");
  await page.getByRole("button", { name: "탐험 지도로 돌아가기", exact: true }).click();
}
