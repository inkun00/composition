import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4174/";
const outputDir = path.resolve("artifacts/practice-creation-modes");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.practicePlaybackBuffers = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.context instanceof AudioContext && this.buffer) {
        window.practicePlaybackBuffers.push({
          duration: this.buffer.duration,
          sampleRate: this.buffer.sampleRate,
          samples: new Float32Array(this.buffer.getChannelData(0))
        });
      }
      return start.apply(this, args);
    };
  });
  await page.goto(baseUrl);
  const entryUrl = page.url();
  const pageCount = page.context().pages().length;
  const chooser = page.getByRole("dialog", { name: "어떻게 만들까요?", exact: true });
  const screen = page.locator(".practice-screen");
  const firstMode = page.getByRole("button", { name: "리듬만들기", exact: true });

  async function assertPopup() {
    await chooser.waitFor({ state: "visible" });
    assert.equal(await chooser.getAttribute("aria-modal"), "true");
    assert.equal(await screen.getAttribute("aria-hidden"), "true");
    assert.equal(await screen.evaluate((element) => element.inert), true);
    assert.equal(page.url(), entryUrl);
    assert.equal(page.context().pages().length, pageCount);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
    const bounds = await chooser.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1
      && bounds.y + bounds.height <= viewport.height + 1, JSON.stringify({ bounds, viewport }));
  }

  async function assertPopupKeyboard() {
    await firstMode.focus();
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      assert.equal(await chooser.evaluate((dialog) => dialog.contains(document.activeElement)), true, key);
    }
    assert.equal(await page.evaluate(() => window.scrollY), 0);
  }

  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  await assertPopup();
  for (const name of ["리듬만들기", "리듬만들고 가락넣기", "가락만들기"]) {
    assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true);
  }
  assert.equal(await page.getByTestId("practice-score-workspace-0").count(), 1);
  assert.equal(await firstMode.evaluate((button) => button === document.activeElement), true);
  await assertPopupKeyboard();
  await page.getByRole("button", { name: "모드 선택 창 닫기", exact: true }).click();
  assert.equal(await chooser.count(), 0);
  assert.equal(await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().isVisible(), true);
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  await assertPopup();
  await page.screenshot({ path: path.join(outputDir, "mode-chooser.png"), fullPage: true });
  await page.getByRole("button", { name: "가락만들기", exact: true }).click();
  assert.equal(await chooser.count(), 0);
  assert.equal(await screen.evaluate((element) => element.inert), false);
  assert.notEqual(await screen.getAttribute("aria-hidden"), "true");
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("1");
  await page.getByLabel("연습 빠르기", { exact: true }).selectOption("60");
  await page.getByLabel("가락 연주 악기", { exact: true }).selectOption("flute");

  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1")));
  const tools = page.getByTestId("practice-score-tools-0");
  const preview = page.getByTestId("practice-measure-preview-0");
  const melodyTab = page.getByRole("tab", { name: /가락 만들기/ });
  const rhythmTab = page.getByRole("tab", { name: /리듬 만들기/ });
  const empty = await draft();
  assert.equal(empty.mode, "melody");
  assert.ok(empty.measures.every((measure) => measure.notes.length === 0));
  assert.equal(await melodyTab.getAttribute("aria-selected"), "true");
  assert.equal(await rhythmTab.count(), 0);
  assert.equal(await preview.innerText(), "미리 듣기");
  assert.equal(await preview.isEnabled(), false);

  // The first note comes directly from the empty pitch grid, without a rhythm step.
  await page.getByTestId("practice-melody-empty-67-0").click();
  await tools.getByTestId("practice-duration-1").click();
  const second = (await draft()).measures[0].notes[1];
  await page.getByTestId(`practice-melody-${second.id}-64`).click();
  assert.deepEqual((await draft()).measures[0].notes.map((note) => note.pitch), [67, 64]);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  await tools.getByTestId("practice-rest-0.25").click();
  await tools.getByTestId("practice-duration-0.25").click();
  await tools.getByTestId("practice-duration-0.5").click();
  await tools.getByTestId("practice-duration-1").click();
  const completedMeasures = (await draft()).measures;
  assert.deepEqual(completedMeasures[0].notes.map((note) => note.duration.numerator / note.duration.denominator), [1, 1, 0.25, 0.25, 0.5, 1]);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole("button", { name: "MP4 저장", exact: true }).isEnabled(), true);

  // Opening and dismissing the chooser keeps the same editor and all authored notes.
  await page.getByTestId("practice-score-workspace-0").evaluate((element) => { window.practiceWorkspaceElement = element; });
  const beforeCancelledMode = await draft();
  for (const [closeIndex, close] of [
    () => page.getByRole("button", { name: "모드 선택 창 닫기", exact: true }).click(),
    () => page.keyboard.press("Escape"),
    () => page.locator(".practice-mode-overlay").click({ position: { x: 5, y: 5 } })
  ].entries()) {
    await page.getByRole("button", { name: "모드 바꾸기", exact: true }).click();
    await assertPopup();
    assert.equal(await page.getByTestId("practice-score-workspace-0").evaluate((element) => element === window.practiceWorkspaceElement), true);
    await assertPopupKeyboard();
    await close();
    assert.equal(await chooser.count(), 0);
    assert.equal(await screen.evaluate((element) => element.inert), false);
    assert.equal(await page.getByTestId("practice-score-workspace-0").evaluate((element) => element === window.practiceWorkspaceElement), true);
    assert.deepEqual(await draft(), beforeCancelledMode);
    try {
      await page.waitForFunction(() => document.activeElement === document.querySelector(".practice-mode-current button"), null, { timeout: 3000 });
    } catch (error) {
      const details = await page.getByRole("button", { name: "모드 바꾸기", exact: true }).evaluate((button) => ({
        active: document.activeElement?.outerHTML.slice(0, 200), disabled: button.disabled,
        inertAncestor: button.closest("[inert]")?.outerHTML.slice(0, 200) ?? null
      }));
      throw new Error(`Popup focus restoration failed after close ${closeIndex}: ${JSON.stringify(details)}`, { cause: error });
    }
    assert.equal(await page.getByRole("button", { name: "모드 바꾸기", exact: true }).evaluate((button) => button === document.activeElement), true,
      await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 300)));
  }

  async function capture() {
    const count = await page.evaluate(() => window.practicePlaybackBuffers.length);
    await preview.click();
    await page.waitForFunction((before) => window.practicePlaybackBuffers.length > before, count);
    await page.getByRole("button", { name: "1마디 연주 멈추기", exact: true }).click();
    return count;
  }

  async function changeMode(name) {
    await page.getByRole("button", { name: "모드 바꾸기", exact: true }).click();
    await assertPopup();
    await page.getByRole("button", { name, exact: true }).click();
    assert.equal(await chooser.count(), 0);
    assert.equal(page.url(), entryUrl);
    assert.equal(page.context().pages().length, pageCount);
  }

  const melodyBuffer = await capture();
  await changeMode("리듬만들기");
  assert.equal((await draft()).mode, "rhythm");
  assert.deepEqual((await draft()).measures, completedMeasures);
  assert.equal(await melodyTab.count(), 0);
  assert.equal(await preview.innerText(), "미리듣기");
  await page.getByLabel("리듬 연주 악기", { exact: true }).selectOption("flute");
  const rhythmBuffer = await capture();
  await page.getByRole("button", { name: /악보 추가하기/ }).click();
  const emptyLayer = (await draft()).rhythmLayers;
  assert.equal(emptyLayer.length, 1);
  assert.equal(emptyLayer[0].measures[0].notes.length, 0);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);

  await changeMode("가락만들기");
  assert.equal(await page.getByTestId("practice-score-workspace-1").count(), 0);
  assert.deepEqual((await draft()).rhythmLayers, emptyLayer);
  assert.deepEqual((await draft()).measures, completedMeasures);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole("button", { name: "MP4 저장", exact: true }).isEnabled(), true);
  const isolatedMelodyBuffer = await capture();
  await page.screenshot({ path: path.join(outputDir, "melody-desktop.png"), fullPage: true });

  await changeMode("리듬만들고 가락넣기");
  assert.equal((await draft()).mode, "rhythm-melody");
  assert.equal(await rhythmTab.getAttribute("aria-selected"), "true");
  assert.equal(await melodyTab.isEnabled(), false);
  await page.getByTestId("practice-score-tools-1").getByTestId("practice-rest-4").click();
  assert.equal(await melodyTab.isEnabled(), true);
  await melodyTab.click();
  assert.equal(await melodyTab.getAttribute("aria-selected"), "true");
  assert.equal(await tools.getByTestId("practice-duration-1").count(), 0);
  assert.equal(await tools.getByTestId("practice-edit-duration").count(), 0);
  assert.equal(await page.getByRole("button", { name: "리듬과 가락 미리듣기", exact: true }).isEnabled(), true);
  assert.deepEqual((await draft()).measures, completedMeasures);
  const combinedBuffer = await capture();
  await page.screenshot({ path: path.join(outputDir, "combined-desktop.png"), fullPage: true });

  const media = await page.evaluate(({ melodyBuffer, rhythmBuffer, isolatedMelodyBuffer, combinedBuffer }) => {
    const buffers = window.practicePlaybackBuffers;
    const powerAt = (buffer, seconds, frequency) => {
      const start = Math.floor(buffer.sampleRate * seconds);
      const length = 8192;
      let real = 0;
      let imaginary = 0;
      for (let index = 0; index < length; index += 1) {
        const value = (buffer.samples[start + index] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * index / (length - 1)));
        const angle = 2 * Math.PI * frequency * index / buffer.sampleRate;
        real += value * Math.cos(angle);
        imaginary += value * Math.sin(angle);
      }
      return real ** 2 + imaginary ** 2;
    };
    const frequencyAt = (buffer, seconds) => {
      let bestFrequency = 0;
      let bestPower = 0;
      for (let frequency = 300; frequency <= 545; frequency += 1) {
        const power = powerAt(buffer, seconds, frequency);
        if (power > bestPower) { bestPower = power; bestFrequency = frequency; }
      }
      return bestFrequency;
    };
    const melody = buffers[melodyBuffer];
    const rhythm = buffers[rhythmBuffer];
    const isolated = buffers[isolatedMelodyBuffer];
    const combined = buffers[combinedBuffer];
    let isolationError = 0;
    let mixedDifference = 0;
    for (let index = 0; index < melody.samples.length; index += 1) {
      isolationError = Math.max(isolationError, Math.abs(melody.samples[index] - isolated.samples[index]));
      mixedDifference = Math.max(mixedDifference, Math.abs(melody.samples[index] - combined.samples[index]));
    }
    return {
      melodyFrequencies: [0.1, 1.1].map((seconds) => frequencyAt(melody, seconds)),
      rhythmFrequencies: [0.1, 1.1].map((seconds) => frequencyAt(rhythm, seconds)),
      durations: [melody, rhythm, isolated, combined].map((buffer) => buffer.duration),
      isolationError,
      mixedDifference,
      components: [392, 330].map((frequency, index) => {
        const seconds = index + 0.1;
        return {
          melody: powerAt(melody, seconds, frequency),
          rhythmAtMelody: powerAt(rhythm, seconds, frequency),
          rhythm: powerAt(rhythm, seconds, 523),
          melodyAtRhythm: powerAt(melody, seconds, 523),
          mixedMelody: powerAt(combined, seconds, frequency),
          mixedRhythm: powerAt(combined, seconds, 523)
        };
      })
    };
  }, { melodyBuffer, rhythmBuffer, isolatedMelodyBuffer, combinedBuffer });
  for (const [index, expected] of [392, 330].entries()) {
    assert.ok(Math.abs(media.melodyFrequencies[index] - expected) < 12, JSON.stringify(media));
  }
  assert.ok(media.rhythmFrequencies.every((frequency) => Math.abs(frequency - 523) < 12), JSON.stringify(media));
  assert.ok(media.durations.every((duration) => Math.abs(duration - 4) < 0.01), JSON.stringify(media));
  assert.ok(media.isolationError < 0.000001, JSON.stringify(media));
  assert.ok(media.mixedDifference > 0.001, JSON.stringify(media));
  for (const component of media.components) {
    assert.ok(component.mixedMelody > component.melody * 0.1 && component.mixedMelody > component.rhythmAtMelody * 20, JSON.stringify(media));
    assert.ok(component.mixedRhythm > component.rhythm * 0.1 && component.mixedRhythm > component.melodyAtRhythm * 20, JSON.stringify(media));
  }

  await changeMode("가락만들기");
  const completed = await draft();
  await page.reload();
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  assert.equal((await draft()).mode, "melody");
  assert.deepEqual(await draft(), completed);
  assert.equal(await page.getByRole("button", { name: "모드 바꾸기", exact: true }).isVisible(), true);
  assert.equal(await rhythmTab.count(), 0);
  assert.equal(await page.getByTestId("practice-score-workspace-1").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "melody-mobile.png"), fullPage: true });
  const mobile = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
    previewsFit: [...document.querySelectorAll(".practice-measure-preview")].every((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    })
  }));
  assert.equal(mobile.width, mobile.viewport);
  assert.equal(mobile.previewsFit, true);
  await page.getByRole("button", { name: "모드 바꾸기", exact: true }).click();
  await assertPopup();
  await assertPopupKeyboard();
  await page.screenshot({ path: path.join(outputDir, "mode-chooser-mobile.png"), fullPage: true });
  for (const name of ["리듬만들기", "리듬만들고 가락넣기", "가락만들기"]) {
    const bounds = await page.getByRole("button", { name, exact: true }).boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.setViewportSize({ width: 390, height: 500 });
  await assertPopup();
  const scrollingPopup = await chooser.evaluate((dialog) => {
    const before = dialog.scrollTop;
    dialog.scrollTop = dialog.scrollHeight;
    return { before, after: dialog.scrollTop, height: dialog.clientHeight, contentHeight: dialog.scrollHeight };
  });
  assert.ok(scrollingPopup.contentHeight > scrollingPopup.height && scrollingPopup.after > scrollingPopup.before, JSON.stringify(scrollingPopup));
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "가락만들기", exact: true }).click();
  await page.getByRole("tab", { name: /음악 저장하기/ }).click();
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "가락 편집으로", exact: true }).click();
  assert.deepEqual(await draft(), completed);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", popup: { samePage: true, keyboardTrapped: true, cancellationPreservesEditor: true, smallScreenScroll: scrollingPopup }, media, mobile, screenshots: outputDir }, null, 2));
} finally {
  await browser.close();
}
