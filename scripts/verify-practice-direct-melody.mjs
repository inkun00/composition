import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4174/";
const outputDir = path.resolve("artifacts/practice-creation-modes");
const popupOutputDir = path.resolve("artifacts/practice-popup-polish");
await mkdir(outputDir, { recursive: true });
await mkdir(popupOutputDir, { recursive: true });
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
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await firstMode.focus();
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      assert.equal(await chooser.evaluate((dialog) => dialog.contains(document.activeElement)), true, key);
    }
    assert.equal(await page.evaluate(() => window.scrollY), scrollBefore);
  }

  async function assertPolishedPopupAtViewports() {
    const reports = [];
    const modes = ["리듬만들기", "리듬만들고 가락넣기", "가락만들기"];
    for (const viewport of [
      { width: 1440, height: 1080 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 320, height: 740 },
      { width: 390, height: 500 }
    ]) {
      await page.setViewportSize(viewport);
      await chooser.evaluate((dialog) => { dialog.scrollTop = 0; });
      await assertPopup();
      await chooser.locator("img").evaluateAll(async (images) => {
        await Promise.all(images.map((image) => image.decode()));
      });
      const layout = await chooser.evaluate((dialog) => {
        const cards = [...dialog.querySelectorAll(".practice-mode-choice")];
        return {
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          dialogWidth: dialog.clientWidth,
          dialogContentWidth: dialog.scrollWidth,
          scrollHeight: dialog.scrollHeight,
          height: dialog.clientHeight,
          images: [...dialog.querySelectorAll("img")].map((image) => ({
            src: image.getAttribute("src"),
            loaded: image.complete && image.naturalWidth > 0,
            decorative: image.alt === "",
            width: image.getBoundingClientRect().width,
            height: image.getBoundingClientRect().height
          })),
          cards: cards.map((card) => {
            const bounds = card.getBoundingClientRect();
            const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
            const clippedText = [];
            while (walker.nextNode()) {
              const node = walker.currentNode;
              if (!node.textContent.trim() || node.parentElement.closest('[aria-hidden="true"]')) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              const outside = [...range.getClientRects()].some((rect) => rect.width > 0
                && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1
                  || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1));
              if (outside) clippedText.push(node.textContent);
            }
            return {
              label: card.getAttribute("aria-label"),
              width: bounds.width,
              height: bounds.height,
              contentWidth: card.scrollWidth,
              innerWidth: card.clientWidth,
              clippedText
            };
          })
        };
      });
      assert.equal(layout.documentWidth, viewport.width, JSON.stringify(layout));
      assert.ok(layout.dialogContentWidth <= layout.dialogWidth + 1, JSON.stringify(layout));
      assert.ok(layout.images.length >= 3, "Each mode needs its own illustrated choice.");
      assert.ok(layout.images.every((image) => image.loaded && image.decorative && image.width > 0 && image.height > 0), JSON.stringify(layout));
      assert.equal(layout.cards.length, 3, JSON.stringify(layout));
      for (const card of layout.cards) {
        assert.ok(card.width >= 44 && card.height >= 44 && card.contentWidth <= card.innerWidth + 1, JSON.stringify(card));
        assert.deepEqual(card.clippedText, [], JSON.stringify(card));
      }
      const close = page.getByRole("button", { name: "모드 선택 창 닫기", exact: true });
      assert.equal(await close.isVisible(), true);
      await close.click({ trial: true });
      await page.screenshot({ path: path.join(popupOutputDir, `chooser-${viewport.width}x${viewport.height}.png`) });
      if (viewport.width === 1440) {
        await chooser.screenshot({ path: path.join(popupOutputDir, "dialog-desktop.png") });
      }
      for (const name of modes) {
        const button = page.getByRole("button", { name, exact: true });
        await button.scrollIntoViewIfNeeded();
        await button.click({ trial: true });
        const bounds = await button.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, JSON.stringify({ name, bounds, viewport }));
      }
      if (viewport.height === 500) {
        assert.ok(layout.scrollHeight > layout.height, JSON.stringify(layout));
        assert.ok(await chooser.evaluate((dialog) => dialog.scrollTop > 0), JSON.stringify(layout));
        await page.screenshot({ path: path.join(popupOutputDir, "chooser-390x500-scrolled.png") });
      }
      assert.equal(await page.evaluate(() => window.scrollY), 0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
      reports.push({ viewport, ...layout });
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await chooser.evaluate((dialog) => { dialog.scrollTop = 0; });
    await assertPopup();
    return reports;
  }

  await page.getByRole("button", { name: "리듬·가락 직접 만들기", exact: false }).first().click();
  await assertPopup();
  for (const name of ["리듬만들기", "리듬만들고 가락넣기", "가락만들기"]) {
    assert.equal(await page.getByRole("button", { name, exact: true }).isVisible(), true);
  }
  assert.equal(await page.getByTestId("practice-score-workspace-0").count(), 1);
  assert.equal(await firstMode.evaluate((button) => button === document.activeElement), true);
  await assertPopupKeyboard();
  await page.getByRole("button", { name: "모드 선택 창 닫기", exact: true }).click();
  assert.equal(await chooser.count(), 0);
  assert.equal(await page.getByRole("button", { name: "리듬·가락 직접 만들기", exact: false }).first().isVisible(), true);
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
  await page.getByRole("button", { name: "리듬·가락 직접 만들기", exact: false }).first().click();
  await assertPopup();
  await page.screenshot({ path: path.join(outputDir, "mode-chooser.png"), fullPage: true });
  const polishedPopup = await assertPolishedPopupAtViewports();
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
  async function assertNoPitchPalette() {
    assert.equal(await tools.locator(".practice-pitch-options").count(), 0);
    assert.equal(await tools.getByRole("group", { name: "선택한 음표의 음높이", exact: true }).count(), 0);
    assert.equal(await tools.locator('[data-testid^="practice-pitch-"]').count(), 0);
    assert.equal(await page.locator(".practice-current-measure").count(), 0);
    assert.equal(await page.locator(".practice-pitch-navigation").count(), 0);
    assert.equal(await page.getByRole("button", { name: /선택한 음표 (반음|한 음) (낮추기|높이기)/ }).count(), 0);
    assert.equal(await page.getByText("만든 리듬에 높낮이를 붙여요. 길이를 고치려면 리듬만들기로 돌아가요.", { exact: true }).count(), 0);
    assert.equal(await page.getByText("음높이를 누르면 새 음표가 생겨요.", { exact: true }).count(), 0);
  }
  const empty = await draft();
  assert.equal(empty.mode, "melody");
  assert.ok(empty.measures.every((measure) => measure.notes.length === 0));
  assert.equal(await melodyTab.getAttribute("aria-selected"), "true");
  assert.equal(await rhythmTab.count(), 0);
  assert.equal(await preview.innerText(), "미리 듣기");
  assert.equal(await preview.isEnabled(), false);
  await assertNoPitchPalette();

  // The first note comes directly from the empty pitch grid, without a rhythm step.
  await page.getByTestId("practice-melody-empty-67-0").click();
  assert.equal(await page.locator(".practice-pitch-row-label").count(), 8);
  await page.getByRole("button", { name: "악보에 넣기", exact: true }).click();
  await assertNoPitchPalette();
  const staffNotes = page.getByTestId("practice-measure-card-0").locator("g.note-button");
  await staffNotes.first().press("ArrowUp");
  assert.equal((await draft()).measures[0].notes[0].pitch, 68);
  await staffNotes.first().press("ArrowDown");
  assert.equal((await draft()).measures[0].notes[0].pitch, 67);
  // Adding another note still works in staff view without the removed palette.
  await tools.getByTestId("practice-duration-1").click();
  await staffNotes.nth(1).press("ArrowUp");
  assert.equal((await draft()).measures[0].notes[1].pitch, 61);
  await page.getByRole("button", { name: "칸 채우기", exact: true }).click();
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
      await page.waitForFunction(() => [...document.querySelectorAll(".practice-mode-current button")]
        .some((button) => button.textContent.trim() === "모드 바꾸기" && document.activeElement === button), null, { timeout: 3000 });
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

  async function capture(button = preview, stopText = "1마디 연주 멈추기") {
    const count = await page.evaluate(() => window.practicePlaybackBuffers.length);
    await button.click();
    await page.waitForFunction((before) => window.practicePlaybackBuffers.length > before, count);
    await page.getByRole("button", { name: stopText, exact: true }).click();
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
  await page.getByLabel("2번 악보 리듬 연주 악기", { exact: true }).selectOption("flute");
  await page.getByTestId("practice-score-tools-1").getByTestId("practice-duration-4").click();
  const audibleLayer = (await draft()).rhythmLayers;
  assert.deepEqual(audibleLayer[0].measures[0].notes.map((note) => note.pitch), [60]);
  const extraRhythmBuffer = await capture(
    page.getByTestId("practice-score-1-measure-preview-0"), "2번 악보 1마디 연주 멈추기"
  );
  assert.equal(await melodyTab.isEnabled(), true);
  await melodyTab.click();
  assert.equal(await melodyTab.getAttribute("aria-selected"), "true");
  await assertNoPitchPalette();
  assert.equal(await page.getByTestId("practice-score-workspace-1").count(), 0);
  assert.equal(await page.getByLabel("리듬 연주 악기", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "리듬 함께 듣기", exact: true }).count(), 0);
  assert.equal(await tools.getByTestId("practice-duration-1").count(), 0);
  assert.equal(await tools.getByTestId("practice-edit-duration").count(), 0);
  const firstMelodyNote = (await draft()).measures[0].notes[0];
  await page.getByTestId(`practice-melody-${firstMelodyNote.id}-69`).click();
  assert.equal((await draft()).measures[0].notes[0].pitch, 69);
  await page.getByTestId(`practice-melody-${firstMelodyNote.id}-67`).click();
  assert.equal((await draft()).measures[0].notes[0].pitch, 67);
  assert.equal(await page.getByRole("button", { name: "가락 미리듣기", exact: true }).isEnabled(), true);
  assert.deepEqual((await draft()).measures, completedMeasures);
  assert.deepEqual((await draft()).rhythmLayers, audibleLayer);
  const combinedBuffer = await capture();
  const combinedScoreBuffer = await capture(page.getByTestId("practice-score-preview-0"), "악보1 멈추기");
  const combinedWholeBuffer = await capture(
    page.getByRole("button", { name: "가락 미리듣기", exact: true }), "연주 멈추기"
  );
  await page.screenshot({ path: path.join(outputDir, "combined-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoPitchPalette();
  await page.screenshot({ path: path.join(outputDir, "combined-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1080 });

  const media = await page.evaluate(({ melodyBuffer, rhythmBuffer, isolatedMelodyBuffer,
    extraRhythmBuffer, combinedBuffer, combinedScoreBuffer, combinedWholeBuffer }) => {
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
    const extraRhythm = buffers[extraRhythmBuffer];
    const combined = buffers[combinedBuffer];
    const compare = (candidate) => {
      let error = 0;
      for (let index = 0; index < Math.max(melody.samples.length, candidate.samples.length); index += 1) {
        error = Math.max(error, Math.abs((melody.samples[index] || 0) - (candidate.samples[index] || 0)));
      }
      return error;
    };
    return {
      melodyFrequencies: [0.1, 1.1].map((seconds) => frequencyAt(melody, seconds)),
      rhythmFrequencies: [0.1, 1.1].map((seconds) => frequencyAt(rhythm, seconds)),
      extraRhythmFrequency: frequencyAt(extraRhythm, 0.1),
      extraRhythmEnergy: extraRhythm.samples.reduce((sum, sample) => sum + sample ** 2, 0) / extraRhythm.samples.length,
      durations: [melody, rhythm, isolated, combined, buffers[combinedScoreBuffer], buffers[combinedWholeBuffer]]
        .map((buffer) => buffer.duration),
      isolationError: compare(isolated),
      melodyStageErrors: [combined, buffers[combinedScoreBuffer], buffers[combinedWholeBuffer]].map(compare),
      components: [392, 330].map((frequency, index) => {
        const seconds = index + 0.1;
        return {
          melody: powerAt(melody, seconds, frequency),
          rhythmAtMelody: powerAt(rhythm, seconds, frequency),
          rhythm: powerAt(rhythm, seconds, 523),
          melodyAtRhythm: powerAt(melody, seconds, 523),
          linkedMelody: powerAt(combined, seconds, frequency),
          linkedAtRhythm: powerAt(combined, seconds, 523)
        };
      })
    };
  }, { melodyBuffer, rhythmBuffer, isolatedMelodyBuffer, extraRhythmBuffer,
    combinedBuffer, combinedScoreBuffer, combinedWholeBuffer });
  for (const [index, expected] of [392, 330].entries()) {
    assert.ok(Math.abs(media.melodyFrequencies[index] - expected) < 12, JSON.stringify(media));
  }
  assert.ok(media.rhythmFrequencies.every((frequency) => Math.abs(frequency - 523) < 12), JSON.stringify(media));
  assert.ok(Math.abs(media.extraRhythmFrequency - 523) < 12 && media.extraRhythmEnergy > 0.000001, JSON.stringify(media));
  assert.ok(media.durations.every((duration) => Math.abs(duration - 4) < 0.01), JSON.stringify(media));
  assert.ok(media.isolationError < 0.000001, JSON.stringify(media));
  assert.ok(media.melodyStageErrors.every((error) => error < 0.000001), JSON.stringify(media));
  for (const component of media.components) {
    assert.equal(component.linkedMelody, component.melody, JSON.stringify(media));
    assert.equal(component.linkedAtRhythm, component.melodyAtRhythm, JSON.stringify(media));
  }

  await rhythmTab.click();
  assert.equal(await page.getByTestId("practice-score-workspace-1").count(), 1);
  assert.equal(await page.getByLabel("2번 악보 리듬 연주 악기", { exact: true }).inputValue(), "flute");
  assert.deepEqual((await draft()).rhythmLayers, audibleLayer);

  await changeMode("가락만들기");
  const completed = await draft();
  await page.reload();
  await page.getByRole("button", { name: "리듬·가락 직접 만들기", exact: false }).first().click();
  assert.equal((await draft()).mode, "melody");
  assert.deepEqual(await draft(), completed);
  assert.equal(await page.getByRole("button", { name: "모드 바꾸기", exact: true }).isVisible(), true);
  assert.equal(await rhythmTab.count(), 0);
  assert.equal(await page.getByTestId("practice-score-workspace-1").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoPitchPalette();
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
  console.log(JSON.stringify({ result: "passed", popup: { samePage: true, keyboardTrapped: true, cancellationPreservesEditor: true, smallScreenScroll: scrollingPopup }, polishedPopup, media, mobile, screenshots: outputDir, popupScreenshots: popupOutputDir }, null, 2));
} finally {
  await browser.close();
}
