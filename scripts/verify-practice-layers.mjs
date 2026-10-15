import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4175/";
const outputDir = path.resolve("artifacts/practice-layers");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => {
    window.practicePlaybackBuffers = [];
    const originalStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      // Inspect actual preview PCM without replacing its rendering or playback.
      if (this.context instanceof AudioContext && this.buffer) {
        window.practicePlaybackBuffers.push({
          sampleRate: this.buffer.sampleRate,
          duration: this.buffer.duration,
          samples: new Float32Array(this.buffer.getChannelData(0))
        });
      }
      return originalStart.apply(this, args);
    };
  });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  await page.getByRole("button", { name: "리듬만들고 가락넣기", exact: true }).click();
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("1");
  await page.getByLabel("연습 빠르기", { exact: true }).selectOption("60");
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1")));
  const card = (scoreIndex, index = 0) => page.getByTestId(scoreIndex === 0
    ? `practice-measure-card-${index}`
    : `practice-score-${scoreIndex}-measure-card-${index}`);
  const preview = (scoreIndex) => page.getByTestId(scoreIndex === 0
    ? "practice-measure-preview-0"
    : `practice-score-${scoreIndex}-measure-preview-0`);
  const workspace = (scoreIndex) => page.getByTestId(`practice-score-workspace-${scoreIndex}`);
  const tools = (scoreIndex) => workspace(scoreIndex).getByTestId(`practice-score-tools-${scoreIndex}`);
  const fullPreview = (scoreIndex) => workspace(scoreIndex).getByTestId(`practice-score-preview-${scoreIndex}`);
  const instruments = page.getByRole("region", { name: "리듬 악보와 악기 선택", exact: true });
  const instrumentBounds = await instruments.boundingBox();
  const workspaceBounds = await workspace(0).boundingBox();
  assert.ok(instrumentBounds.y + instrumentBounds.height <= workspaceBounds.y);
  await page.getByLabel("리듬 연주 악기", { exact: true }).selectOption("beat:woodblock");
  await tools(0).getByTestId("practice-duration-1").click();
  const primary = (await draft()).measures;
  await page.getByRole("button", { name: /악보 추가하기/ }).click();
  await page.getByLabel("2번 악보 리듬 연주 악기", { exact: true }).selectOption("beat:clap");
  await page.getByTestId("practice-score-select-0").click();
  await tools(1).getByTestId("practice-duration-0.5").click();
  await card(1).locator(".practice-empty-slot").first().click();
  const secondary = (await draft()).rhythmLayers[0].measures;
  assert.deepEqual(secondary[0].notes.map((note) => note.pitch), [60, 60]);
  assert.ok(secondary[0].notes.every((note) => note.duration.numerator === 1 && note.duration.denominator === 2));
  assert.deepEqual((await draft()).measures, primary);
  await page.getByRole("button", { name: /악보 추가하기/ }).click();
  await page.getByLabel("3번 악보 리듬 연주 악기", { exact: true }).selectOption("beat:kick");
  await page.getByTestId("practice-score-select-0").click();
  await tools(2).getByTestId("practice-rest-0.5").click();
  await card(2).locator(".practice-empty-slot").first().click();
  const repeatedRests = (await draft()).rhythmLayers[1].measures[0].notes;
  assert.deepEqual(repeatedRests.map((note) => note.pitch), [null, null]);
  assert.ok(repeatedRests.every((note) => note.duration.numerator === 1 && note.duration.denominator === 2));
  await card(2).getByTestId(`practice-rhythm-note-${repeatedRests[1].id}`).click();
  await tools(2).getByTestId("practice-duration-0.5").click();
  await tools(2).getByTestId("practice-rest-1.5").click();
  const dottedRest = (await draft()).rhythmLayers[1].measures[0].notes.at(-1);
  assert.equal(dottedRest.pitch, null);
  assert.equal(dottedRest.dotted, true);
  assert.deepEqual(dottedRest.duration, { numerator: 3, denominator: 2 });
  await tools(2).getByTestId("practice-delete-note").click();
  const entered = await draft();
  assert.deepEqual(entered.measures, primary);
  assert.deepEqual(entered.rhythmLayers[0].measures, secondary);
  assert.deepEqual(entered.rhythmLayers[1].measures[0].notes.map((note) => note.pitch), [null, 60]);
  assert.equal(entered.rhythmLayers.length, 2);
  assert.equal(await page.getByTestId("practice-duration-0.5").count(), 3);
  assert.equal(await page.getByTestId("practice-rest-0.5").count(), 3);
  assert.equal(await page.getByTestId("practice-add-note").count(), 0);
  assert.equal(await page.getByTestId("practice-add-rest").count(), 0);
  for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
    const paletteBounds = await tools(scoreIndex).boundingBox();
    const cardBounds = await card(scoreIndex).boundingBox();
    assert.ok(paletteBounds.y + paletteBounds.height <= cardBounds.y);
    assert.equal(await tools(scoreIndex).getByTestId("practice-duration-0.5").count(), 1);
    assert.equal(await tools(scoreIndex).getByTestId("practice-rest-0.5").count(), 1);
    assert.equal(await tools(scoreIndex).getByTestId("practice-duration-0.25").count(), 1);
    assert.equal(await tools(scoreIndex).getByTestId("practice-rest-0.25").count(), 1);
    assert.equal(await preview(scoreIndex).innerText(), "미리듣기");
    assert.equal(await fullPreview(scoreIndex).innerText(), `악보${scoreIndex + 1} 미리듣기`);
    assert.equal(await fullPreview(scoreIndex).isEnabled(), true);
  }
  assert.equal(await page.getByRole("button", { name: /악보 추가하기/ }).isEnabled(), false);
  assert.equal(await page.getByRole("tab", { name: /가락 만들기/ }).isEnabled(), false);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole("button", { name: "리듬 함께 듣기", exact: true }).isEnabled(), true);

  async function capturePreview(button, stopText) {
    const before = await page.evaluate(() => window.practicePlaybackBuffers.length);
    await button.click();
    await page.waitForFunction((count) => window.practicePlaybackBuffers.length > count, before);
    await page.getByRole("button", { name: stopText, exact: true }).click();
    return before;
  }

  const fullScoreDurations = [];
  const fullScoreBuffers = [];
  for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
    const before = await page.evaluate(() => window.practicePlaybackBuffers.length);
    await fullPreview(scoreIndex).click();
    await page.waitForFunction((count) => window.practicePlaybackBuffers.length > count, before);
    assert.equal(await fullPreview(scoreIndex).innerText(), `악보${scoreIndex + 1} 멈추기`);
    assert.equal(await fullPreview(scoreIndex).isEnabled(), true);
    for (let other = 0; other < 3; other += 1) {
      if (other !== scoreIndex) assert.equal(await fullPreview(other).isEnabled(), false);
      assert.equal(await preview(other).isEnabled(), false);
    }
    await card(scoreIndex).locator(".practice-playback-indicator").waitFor();
    fullScoreDurations.push(await page.evaluate((index) => window.practicePlaybackBuffers[index].duration, before));
    fullScoreBuffers.push(before);
    await fullPreview(scoreIndex).click();
    assert.equal(await fullPreview(scoreIndex).innerText(), `악보${scoreIndex + 1} 미리듣기`);
  }
  assert.ok(fullScoreDurations.every((duration) => Math.abs(duration - 4) < 0.01));
  assert.deepEqual(await draft(), entered);

  const solos = [];
  for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
    solos.push(await capturePreview(preview(scoreIndex), scoreIndex === 0
      ? "1마디 연주 멈추기"
      : `${scoreIndex + 1}번 악보 1마디 연주 멈추기`));
  }
  const soloIdentityErrors = await page.evaluate(({ fullScoreBuffers, solos }) => {
    return solos.map((soloIndex, scoreIndex) => {
      const buffer = window.practicePlaybackBuffers[soloIndex];
      const full = window.practicePlaybackBuffers[fullScoreBuffers[scoreIndex]].samples;
      const length = Math.min(buffer.samples.length, Math.floor(buffer.sampleRate * 0.9));
      let energy = 0;
      let difference = 0;
      for (let index = 0; index < length; index += 1) {
        energy += buffer.samples[index] ** 2;
        difference += (buffer.samples[index] - full[index]) ** 2;
      }
      return difference / energy;
    });
  }, { fullScoreBuffers, solos });
  assert.ok(soloIdentityErrors.every((error) => error < 0.000001), JSON.stringify(soloIdentityErrors));
  const mix = await capturePreview(
    page.getByRole("button", { name: "리듬 함께 듣기", exact: true }),
    "겹친 리듬 멈추기"
  );
  const pcm = await page.evaluate(({ solos, mix }) => {
    const buffers = window.practicePlaybackBuffers;
    const source = solos.map((index) => buffers[index].samples);
    const mixed = buffers[mix].samples;
    const matrix = Array.from({ length: 3 }, () => [0, 0, 0, 0]);
    let energy = 0;
    for (let index = 0; index < mixed.length; index += 1) {
      energy += mixed[index] ** 2;
      for (let row = 0; row < 3; row += 1) {
        const value = source[row][index] || 0;
        matrix[row][3] += value * mixed[index];
        for (let column = 0; column < 3; column += 1) {
          matrix[row][column] += value * (source[column][index] || 0);
        }
      }
    }
    // Solve for each actual solo waveform's contribution to the mixed PCM.
    for (let pivot = 0; pivot < 3; pivot += 1) {
      const divisor = matrix[pivot][pivot];
      for (let column = pivot; column < 4; column += 1) matrix[pivot][column] /= divisor;
      for (let row = 0; row < 3; row += 1) {
        if (row === pivot) continue;
        const factor = matrix[row][pivot];
        for (let column = pivot; column < 4; column += 1) {
          matrix[row][column] -= factor * matrix[pivot][column];
        }
      }
    }
    const contributions = matrix.map((row) => row[3]);
    let residual = 0;
    let peak = 0;
    for (let index = 0; index < mixed.length; index += 1) {
      const expected = source.reduce((sum, values, layer) => sum + (values[index] || 0) * contributions[layer], 0);
      residual += (mixed[index] - expected) ** 2;
      peak = Math.max(peak, Math.abs(mixed[index]));
    }
    return {
      contributions,
      relativeError: residual / energy,
      duration: buffers[mix].duration,
      energy: energy / mixed.length,
      soloEnergy: source.map((values) => values.reduce((sum, value) => sum + value ** 2, 0) / values.length),
      peak
    };
  }, { solos, mix });
  assert.ok(pcm.contributions.every((value) => value > 0.1), JSON.stringify(pcm));
  assert.ok(pcm.relativeError < 0.0001, JSON.stringify(pcm));
  assert.ok(pcm.soloEnergy.every((value) => value > 0.000001));
  assert.ok(pcm.energy > 0.000001);
  assert.ok(pcm.peak <= 0.950001);
  assert.ok(Math.abs(pcm.duration - 1) < 0.01);
  assert.deepEqual(await draft(), entered);
  await page.screenshot({ path: path.join(outputDir, "three-rhythms-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const compactDesktop = await page.evaluate(() => ({
    viewport: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    paletteButtons: [...document.querySelectorAll(".practice-duration-buttons button")].length,
    palettesFit: [...document.querySelectorAll(".practice-duration-buttons button")].every((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.width > 0 && bounds.left >= 0 && bounds.right <= window.innerWidth;
    })
  }));
  assert.equal(compactDesktop.pageWidth, compactDesktop.viewport);
  assert.equal(compactDesktop.paletteButtons, 42);
  assert.equal(compactDesktop.palettesFit, true);
  await page.screenshot({ path: path.join(outputDir, "three-rhythms-1280.png"), fullPage: true });
  await tools(1).screenshot({ path: path.join(outputDir, "score-tools-1280.png") });
  await page.setViewportSize({ width: 1440, height: 1080 });

  // All four bars of all three scores remain visible, with shared bar starts.
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("4");
  assert.equal(await page.locator(".practice-measure-card").count(), 12);
  const layouts = [];
  for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
    const bounds = await Promise.all([0, 1, 2, 3].map((index) => card(scoreIndex, index).boundingBox()));
    assert.ok(bounds.every((item) => Math.abs(item.y - bounds[0].y) < 1));
    assert.ok(bounds.every((item) => item.x >= 0 && item.x + item.width <= 1440));
    layouts.push(bounds);
  }
  await page.screenshot({ path: path.join(outputDir, "three-scores-four-bars.png"), fullPage: true });

  // Sixteenth notes and rests remain exact after reload; whole-score audio keeps the empty bars silent.
  await card(0, 3).getByTestId("practice-measure-3").click();
  await tools(0).getByTestId("practice-duration-0.25").click();
  await tools(0).getByTestId("practice-rest-0.25").click();
  const sixteenths = await draft();
  assert.deepEqual(sixteenths.measures[3].notes.map((note) => note.pitch), [60, null]);
  assert.ok(sixteenths.measures[3].notes.every((note) => note.duration.numerator === 1 && note.duration.denominator === 4));
  await page.reload();
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  assert.deepEqual(await draft(), sixteenths);
  const fullBufferIndex = await page.evaluate(() => window.practicePlaybackBuffers.length);
  await fullPreview(0).click();
  await page.waitForFunction((count) => window.practicePlaybackBuffers.length > count, fullBufferIndex);
  const silentBars = await page.evaluate((index) => {
    const buffer = window.practicePlaybackBuffers[index];
    const energyBetween = (start, end) => {
      const values = buffer.samples.slice(Math.floor(start * buffer.sampleRate), Math.floor(end * buffer.sampleRate));
      return values.reduce((sum, value) => sum + value ** 2, 0) / values.length;
    };
    return { duration: buffer.duration, silent: energyBetween(4.5, 7.5), lastNote: energyBetween(12.02, 12.2) };
  }, fullBufferIndex);
  assert.ok(Math.abs(silentBars.duration - 16) < 0.01);
  assert.ok(silentBars.silent < 0.00000001);
  assert.ok(silentBars.lastNote > 0.000001);
  await fullPreview(0).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await tools(0).screenshot({ path: path.join(outputDir, "sixteenth-score-tools-1280.png") });
  await workspace(0).locator(".practice-score-workspace-heading").screenshot({ path: path.join(outputDir, "full-score-preview-1280.png") });
  await card(0, 3).screenshot({ path: path.join(outputDir, "sixteenth-grid-1280.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await tools(0).screenshot({ path: path.join(outputDir, "sixteenth-score-tools-mobile.png") });
  await card(0, 3).screenshot({ path: path.join(outputDir, "sixteenth-grid-mobile.png") });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("1");
  for (let scoreIndex = 0; scoreIndex < 3; scoreIndex += 1) {
    const current = await draft();
    const notes = scoreIndex === 0 ? current.measures[0].notes : current.rhythmLayers[scoreIndex - 1].measures[0].notes;
    for (const note of notes) {
      await card(scoreIndex).getByTestId(`practice-rhythm-note-${note.id}`).click();
    }
    await card(scoreIndex).locator(".practice-lyric-entry input").fill("반짝별아");
    await card(scoreIndex).getByTestId(scoreIndex === 0 ? "practice-measure-0" : `practice-score-${scoreIndex}-measure-0`).click();
    for (let beat = 0; beat < 4; beat += 1) {
      await tools(scoreIndex).getByTestId("practice-duration-1").click();
    }
    assert.equal(await page.getByRole("tab", { name: /가락 만들기/ }).isEnabled(), scoreIndex === 2);
  }

  // The rhythm remains authored, but the linked melody stage plays and exports only its melody voice.
  await page.getByLabel("2번 악보 리듬 연주 악기", { exact: true }).selectOption("flute");
  const allRhythms = (await draft()).rhythmLayers;
  await page.getByRole("tab", { name: /가락 만들기/ }).click();
  await page.getByLabel("가락 연주 악기", { exact: true }).selectOption("flute");
  assert.equal(await card(0).locator(".practice-melody-row").count(), 8);
  assert.equal(await workspace(1).count(), 0);
  assert.equal(await workspace(2).count(), 0);
  assert.equal(await page.getByLabel("리듬 연주 악기", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "리듬 함께 듣기", exact: true }).count(), 0);
  assert.equal(await tools(0).getByTestId("practice-duration-1").count(), 0);
  assert.equal(await page.getByRole("button", { name: "가락 미리듣기", exact: true }).isEnabled(), true);
  assert.deepEqual((await draft()).rhythmLayers, allRhythms);

  async function downloadMusic(kind, name) {
    const downloadEvent = page.waitForEvent("download", { timeout: 60000 });
    await page.getByRole("button", { name: `${kind.toUpperCase()} 저장`, exact: true }).click();
    const download = await downloadEvent;
    const filePath = path.join(outputDir, `${name}.${kind}`);
    await download.saveAs(filePath);
    const bytes = await readFile(filePath);
    assert.ok(bytes.length > 1000);
    if (kind === "mp4") assert.equal(bytes.subarray(4, 8).toString(), "ftyp");
    return [...bytes];
  }

  const linkedMp3 = await downloadMusic("mp3", "linked-melody-only");
  const linkedMp4 = await downloadMusic("mp4", "linked-melody-only");
  await page.getByRole("button", { name: "모드 바꾸기", exact: true }).click();
  await page.getByRole("button", { name: "가락만들기", exact: true }).click();
  const pureMp3 = await downloadMusic("mp3", "pure-melody-baseline");
  const pureMp4 = await downloadMusic("mp4", "pure-melody-baseline");
  assert.deepEqual((await draft()).rhythmLayers, allRhythms);

  const media = await page.evaluate(async ({ linkedMp3, linkedMp4, pureMp3, pureMp4 }) => {
    const context = new AudioContext();
    const buffers = await Promise.all([linkedMp3, linkedMp4, pureMp3, pureMp4].map((bytes) =>
      context.decodeAudioData(Uint8Array.from(bytes).buffer)));
    const summaries = buffers.map((buffer) => {
      const samples = buffer.getChannelData(0);
      const start = Math.floor(buffer.sampleRate * 0.2);
      const length = 8192;
      const powers = [261.63, 523.25].map((frequency) => {
        let real = 0;
        let imaginary = 0;
        for (let index = 0; index < length; index += 1) {
          const value = (samples[start + index] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * index / (length - 1)));
          const angle = 2 * Math.PI * frequency * index / buffer.sampleRate;
          real += value * Math.cos(angle);
          imaginary += value * Math.sin(angle);
        }
        return (real ** 2 + imaginary ** 2) / length ** 2;
      });
      const energy = samples.reduce((sum, value) => sum + value ** 2, 0) / samples.length;
      return { duration: buffer.duration, powers, energy };
    });
    const baselineErrors = [0, 1].map((linkedIndex) => {
      const linked = buffers[linkedIndex].getChannelData(0);
      const pure = buffers[linkedIndex + 2].getChannelData(0);
      let maximum = 0;
      for (let index = 0; index < Math.max(linked.length, pure.length); index += 1) {
        maximum = Math.max(maximum, Math.abs((linked[index] || 0) - (pure[index] || 0)));
      }
      return maximum;
    });
    await context.close();
    return { summaries, baselineErrors };
  }, { linkedMp3, linkedMp4, pureMp3, pureMp4 });
  for (const summary of media.summaries) {
    assert.ok(Math.abs(summary.duration - 4) < 0.2, JSON.stringify(media));
    assert.ok(summary.powers[0] > 0.000001 && summary.energy > 0.000001, JSON.stringify(media));
  }
  assert.ok(media.baselineErrors.every((error) => error < 0.000001), JSON.stringify(media));

  await page.getByRole("button", { name: "모드 바꾸기", exact: true }).click();
  await page.getByRole("button", { name: "리듬만들고 가락넣기", exact: true }).click();
  assert.equal(await workspace(1).count(), 1);
  assert.equal(await workspace(2).count(), 1);
  assert.equal(await page.getByLabel("2번 악보 리듬 연주 악기", { exact: true }).inputValue(), "flute");
  assert.deepEqual((await draft()).rhythmLayers, allRhythms);

  const saved = await draft();
  await page.reload();
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  assert.deepEqual(await draft(), saved);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    palettesFit: [...document.querySelectorAll(".practice-duration-buttons button")].every((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.width > 0 && bounds.left >= 0 && bounds.right <= window.innerWidth;
    }),
    cards: [...document.querySelectorAll(".practice-measure-card")].map((item) => {
      const bounds = item.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    })
  }));
  assert.equal(mobile.pageWidth, mobile.viewport);
  assert.equal(mobile.palettesFit, true);
  assert.ok(mobile.cards.every((item) => item.left >= 0 && item.right <= mobile.viewport));
  await page.screenshot({ path: path.join(outputDir, "three-rhythms-mobile.png"), fullPage: true });
  await tools(1).screenshot({ path: path.join(outputDir, "mobile-score-tools.png") });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", pcm, media, layouts, compactDesktop, mobile, fullScoreDurations, soloIdentityErrors, silentBars, outputs: outputDir }, null, 2));
} finally {
  await browser.close();
}
