import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.PRACTICE_URL || "http://127.0.0.1:4174/";
const outputDir = path.resolve("artifacts/practice-restart");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const errors = [];
const expectedEmptyDraft = {
  version: 1,
  mode: null,
  title: "나의 연습 가락",
  meter: { beats: 4, beatUnit: 4 },
  measures: [1, 2].map((number) => ({ id: `practice-measure-${number}`, notes: [], lyric: "", chord: "C" })),
  bpm: 96,
  melodyInstrumentId: "acoustic_grand_piano",
  rhythmInstrumentId: "beat:woodblock",
  rhythmLayers: []
};

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.practiceRestartObservations = [];
    new MutationObserver(() => {
      const restart = [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === "새로 시작하기");
      if (restart) window.practiceRestartObservations.push({
        disabled: restart.disabled,
        exporting: Boolean(document.querySelector('[aria-label="연습 파일 준비 진행률"]'))
      });
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
  });
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  await page.getByRole("button", { name: "리듬만들고 가락넣기", exact: true }).click();
  const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1")));
  const restart = page.getByRole("button", { name: "새로 시작하기", exact: true });
  const changeMode = page.getByRole("button", { name: "모드 바꾸기", exact: true });
  const chooser = page.getByRole("dialog", { name: "어떻게 만들까요?", exact: true });
  const tools = (score) => page.getByTestId(`practice-score-tools-${score}`);
  const primary = page.getByTestId("practice-measure-card-0");
  await page.getByLabel("연습 가락 이름", { exact: true }).fill("새로 시작 검증 악보");
  await page.getByLabel("연습할 마디 수", { exact: true }).selectOption("1");
  await page.getByLabel("연습 박자", { exact: true }).selectOption("3/4");
  await page.getByLabel("연습 빠르기", { exact: true }).selectOption("144");
  await page.getByLabel("리듬 연주 악기", { exact: true }).selectOption("beat:clap");
  await primary.locator(".practice-lyric-entry input").fill("지워");
  for (const id of ["practice-duration-1", "practice-rest-0.5", "practice-duration-1", "practice-rest-0.5"]) {
    await tools(0).getByTestId(id).click();
  }
  for (const [score, instrument] of [[1, "flute"], [2, "beat:kick"]]) {
    await page.getByRole("button", { name: /악보 추가하기/ }).click();
    await page.getByLabel(`${score + 1}번 악보 리듬 연주 악기`, { exact: true }).selectOption(instrument);
    await tools(score).getByTestId("practice-duration-3").click();
  }
  await page.getByRole("tab", { name: /가락 만들기/ }).click();
  await page.getByLabel("가락 연주 악기", { exact: true }).selectOption("flute");
  const beforePitch = await draft();
  await primary.getByTestId(`practice-melody-${beforePitch.measures[0].notes[0].id}-67`).click();
  const authored = await draft();
  assert.equal(authored.rhythmLayers.length, 2);
  assert.equal(authored.measures[0].notes.filter((note) => note.pitch === null).length, 2);
  assert.equal(await page.getByTestId("practice-score-workspace-1").count(), 0);

  const layout = [];
  for (const viewport of [{ width: 1440, height: 1080 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    const left = await restart.boundingBox();
    const right = await changeMode.boundingBox();
    assert.ok(left && right && left.x + left.width <= right.x + 1, JSON.stringify({ viewport, left, right }));
    assert.ok(left.x >= 0 && right.x + right.width <= viewport.width, JSON.stringify({ viewport, left, right }));
    assert.ok(Math.abs(left.y - right.y) < 2, JSON.stringify({ viewport, left, right }));
    const order = await restart.evaluate((button) => [...button.closest(".practice-mode-current").querySelectorAll("button")]
      .map((entry) => entry.textContent.trim()));
    assert.deepEqual(order, ["새로 시작하기", "모드 바꾸기"]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
    await page.screenshot({ path: path.join(outputDir, `buttons-${viewport.width}.png`) });
    layout.push({ viewport, left, right });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });

  async function confirmRestart(accept) {
    const prompt = page.waitForEvent("dialog");
    const clicked = restart.click();
    const dialog = await prompt;
    assert.equal(dialog.type(), "confirm");
    assert.match(dialog.message(), /새로|처음|지워/);
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    await clicked;
    return dialog.message();
  }

  const messages = [await confirmRestart(false)];
  assert.deepEqual(await draft(), authored);
  assert.equal(await chooser.count(), 0);
  assert.equal(await page.getByRole("tab", { name: /가락 만들기/ }).getAttribute("aria-selected"), "true");

  // The real preview disables destructive restart while audio is playing.
  const scorePreview = page.getByTestId("practice-score-preview-0");
  await scorePreview.click();
  await page.getByRole("button", { name: "악보1 멈추기", exact: true }).waitFor({ state: "visible" });
  assert.equal(await restart.isDisabled(), true);
  await scorePreview.click();
  assert.equal(await restart.isEnabled(), true);

  await page.getByRole("tab", { name: /음악 저장하기/ }).click();
  const downloadEvent = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: "MP4 저장", exact: true }).click();
  const download = await downloadEvent;
  await download.saveAs(path.join(outputDir, "before-restart.mp4"));
  assert.equal(await restart.isEnabled(), true);
  const exportObserved = await page.evaluate(() => window.practiceRestartObservations.some((state) => state.exporting && state.disabled));
  assert.equal(exportObserved, true);
  assert.deepEqual(await draft(), authored);

  messages.push(await confirmRestart(false));
  assert.deepEqual(await draft(), authored);
  assert.equal(await page.getByRole("tab", { name: /음악 저장하기/ }).getAttribute("aria-selected"), "true");
  await page.setViewportSize({ width: 390, height: 844 });
  messages.push(await confirmRestart(true));
  await chooser.waitFor({ state: "visible" });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1"))?.mode === null);
  assert.deepEqual(await draft(), expectedEmptyDraft);
  await page.screenshot({ path: path.join(outputDir, "reset-chooser-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "가락만들기", exact: true }).click();
  assert.equal(await chooser.count(), 0);
  assert.equal(await page.locator(".practice-audio-status").count(), 0);
  assert.equal(await page.getByLabel("연습 파일 준비 진행률", { exact: true }).count(), 0);
  assert.deepEqual(await draft(), { ...expectedEmptyDraft, mode: "melody" });
  assert.equal(await page.getByLabel("연습 가락 이름", { exact: true }).inputValue(), expectedEmptyDraft.title);
  assert.equal(await page.getByLabel("연습할 마디 수", { exact: true }).inputValue(), "2");
  assert.equal(await page.getByLabel("연습 박자", { exact: true }).inputValue(), "4/4");
  assert.equal(await page.getByLabel("연습 빠르기", { exact: true }).inputValue(), "96");
  assert.equal(await page.getByLabel("가락 연주 악기", { exact: true }).inputValue(), expectedEmptyDraft.melodyInstrumentId);
  assert.equal(await page.locator(".practice-measure-card").count(), 2);
  assert.equal(await page.getByRole("button", { name: "MP3 저장", exact: true }).isEnabled(), false);
  await page.reload();
  await page.getByRole("button", { name: "기능 연습하기", exact: false }).first().click();
  assert.deepEqual(await draft(), { ...expectedEmptyDraft, mode: "melody" });
  assert.equal(await page.locator(".practice-melody-row .practice-melody-note").count(), 0);
  assert.equal(await page.locator(".practice-lyric-entry input").evaluateAll((inputs) => inputs.every((input) => input.value === "")), true);
  await page.screenshot({ path: path.join(outputDir, "empty-after-reload-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "passed", layout, messages, exportObserved, storedDraft: await draft(), outputs: outputDir }, null, 2));
} finally {
  await browser.close();
}
