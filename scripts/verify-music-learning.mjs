import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";

// Build first. This checks the real UI, Web Audio scheduling and browser storage.
// Audio probes observe native methods and always call the original implementation.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/music-learning");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const report = { startedAt: new Date().toISOString(), baseUrl, checks: [], layouts: [], errors: [], consoleErrors: [] };
let page;
let stage = "initialization";
const lessonTitles = {
  notes: "음표의 길이", meter: "박자와 한 마디", tempo: "음악의 빠르기",
  dynamics: "소리의 세기", symbols: "악보 기호 탐험"
};
// Verified against learningModel.ts; this is intentionally independent UI input.
const answers = { notes: [1, 0, 2, 0], meter: [1, 2, 0, 1], tempo: [2, 0, 1], dynamics: [1, 2, 0, 1], symbols: [2, 0, 1] };

async function shot(name, fullPage = true) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage });
}

async function setRange(label, value) {
  await page.getByRole("slider", { name: label }).evaluate((element, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, String(next));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function layout(name, screenshot = true) {
  await page.evaluate(() => document.fonts.ready);
  const measured = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  const overflow = measured.scrollWidth > measured.width + 1;
  const offenders = overflow ? await page.evaluate(() => [...document.querySelectorAll(".music-learning *")]
    .map((element) => ({ tag: element.tagName, className: String(element.className?.baseVal ?? element.className),
      right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) }))
    .filter((element) => element.right > innerWidth + 1).slice(0, 16)) : [];
  report.layouts.push({ name, ...measured, overflow, ...(overflow ? { offenders } : {}) });
  if (screenshot) await shot(name);
}

async function selectLesson(id) {
  const homeCard = page.locator(`.learn-lesson-card.theme-${id}`);
  if (await homeCard.count()) await homeCard.click();
  else await page.locator(".learn-lesson-nav button").filter({ hasText: lessonTitles[id] }).click();
  await page.getByRole("heading", { name: lessonTitles[id], exact: true }).waitFor();
}

async function waitStopped(label = "소리로 들어보기") {
  await page.getByRole("button", { name: label, exact: true }).waitFor();
  assert.equal(await page.locator(".learn-beat.is-active").count(), 0);
}

async function audioProbe() {
  return page.evaluate(() => structuredClone(window.__learningAudioProbe));
}

async function verifyNotes() {
  stage = "note-length-and-rest";
  await selectLesson("notes");
  await setRange("음표 체험 빠르기", 120);
  assert.match(await page.locator(".learn-time").innerText(), /1\.00초/);
  const before = await audioProbe();
  await page.getByRole("button", { name: "이 음표 들어보기", exact: true }).click();
  await page.locator(".learn-beat.is-active").first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".learn-beat.is-active")[0]?.textContent.includes("2"));
  await waitStopped("이 음표 들어보기");
  const after = await audioProbe();
  assert.equal(after.oscillators.length - before.oscillators.length, 1, "half note uses one sustained tone");
  const tone = after.oscillators.at(-1);
  assert.ok(Math.abs(tone.stops[0] - tone.starts[0] - 1) < 0.02, "half note lasts one second at 120 BPM");
  await page.getByText("실제 악보에서는 어떻게 생겼을까요?", { exact: true }).click();
  await page.locator(".learning-score-host[data-ready='true'] svg").waitFor();
  await shot("desktop-notes");
  await page.getByRole("group", { name: "음표와 쉼표 선택" }).getByRole("button").filter({ hasText: "4분쉼표" }).click();
  const restBefore = (await audioProbe()).oscillators.length;
  await page.getByRole("button", { name: "쉬는 길이 느껴보기", exact: true }).click();
  await page.locator(".learn-beat.is-active").first().waitFor();
  await waitStopped("쉬는 길이 느껴보기");
  assert.equal((await audioProbe()).oscillators.length, restBefore, "rest produces no oscillator");
  for (const [name, seconds] of [["온음표", "2.00"], ["4분음표", "0.50"], ["8분음표", "0.25"]]) {
    await page.getByRole("group", { name: "음표와 쉼표 선택" }).getByRole("button").filter({ hasText: name }).click();
    assert.ok((await page.locator(".learn-time").innerText()).includes(`${seconds}초`));
  }
  report.checks.push("notes: half sustained duration, beat animation, auto-end, silent rest, all lengths");
}

async function verifyMeter() {
  stage = "meter-builder";
  await selectLesson("meter");
  const feedback = page.locator(".learn-meter-feedback");
  const add = (name) => page.getByRole("button", { name: new RegExp(`^${name} 넣기`) });
  await add("2분음표").click();
  assert.match(await feedback.innerText(), /한 마디 완성/);
  await add("4분음표").click();
  assert.match(await feedback.innerText(), /넘어요/);
  assert.equal(await page.locator(".learn-measure-slots > span").count(), 1, "overflow is rejected");
  await page.getByRole("button", { name: "하나 빼기", exact: true }).click();
  for (let i = 0; i < 4; i++) await add("8분음표").click();
  assert.match(await feedback.innerText(), /한 마디 완성/);
  await page.getByRole("button", { name: "내 마디 들어보기", exact: true }).click();
  await page.locator("[data-learning-note][data-playing='true']").first().waitFor();
  await waitStopped("내 마디 들어보기");
  await shot("desktop-meter");
  for (const meter of [3, 4]) {
    await page.getByRole("button", { name: `${meter}/4박자`, exact: true }).click();
    for (let i = 0; i < meter; i++) await add("4분음표").click();
    assert.match(await feedback.innerText(), /한 마디 완성/);
    assert.equal(await page.locator(".learn-beat").count(), meter);
  }
  report.checks.push("meter: 2/4 half note, overflow guard, undo, four eighths, 3/4 and 4/4");
}

async function verifyTempo() {
  stage = "tempo-and-tapping";
  await selectLesson("tempo");
  await page.getByRole("button", { name: /Allegro/ }).click();
  assert.match(await page.locator(".learn-tempo-readout").innerText(), /132/);
  await setRange("빠르기 BPM", 120);
  assert.match(await page.locator(".learn-tempo-readout").innerText(), /0\.50초/);
  await page.getByRole("button", { name: "네 박 들어보기", exact: true }).click();
  await page.locator(".learn-beat.is-active").first().waitFor();
  await waitStopped("네 박 들어보기");
  await page.getByRole("button", { name: "박자 누르기 시작", exact: true }).click();
  for (let i = 0; i < 4; i++) {
    if (i) await new Promise((resolve) => setTimeout(resolve, 500));
    await page.getByRole("button", { name: /^박자 누르기 \d회 완료/ }).click();
  }
  assert.match(await page.locator(".learn-tap-result").innerText(), /일정한 박자를 잘 느꼈어요/);
  report.tapResult = await page.locator(".learn-tap-result").innerText();
  await shot("desktop-tempo");
  report.checks.push("tempo: presets, live BPM conversion, four beats, actual timed tapping game");
}

async function verifyDynamics() {
  stage = "dynamics";
  await selectLesson("dynamics");
  assert.match(await page.locator(".learn-dynamic-readout").innerText(), /mf[\s\S]*조금 세게/);
  const palettes = page.getByRole("group", { name: "셈여림 기호 선택" });
  assert.equal(await palettes.getByRole("button").count(), 6);
  for (const change of ["steady", "crescendo", "decrescendo"]) {
    if (change !== "steady") await page.getByRole("button", { name: change === "crescendo" ? "크레셴도 점점 세게" : "데크레셴도 점점 여리게", exact: true }).click();
    const before = (await audioProbe()).gains.length;
    await page.getByRole("button", { name: "소리로 들어보기", exact: true }).click();
    await waitStopped();
    const gains = (await audioProbe()).gains.slice(before).map((gain) => gain.ramps[0]);
    assert.equal(gains.length, 4);
    if (change === "steady") assert.ok(gains.every((gain) => Math.abs(gain - 0.115) < 0.001));
    else for (let i = 1; i < gains.length; i++) assert.ok(change === "crescendo" ? gains[i] > gains[i - 1] : gains[i] < gains[i - 1]);
    report[change] = gains;
  }
  await shot("desktop-dynamics");
  report.checks.push("dynamics: all six signs, actual mf gain, increasing and decreasing native gain envelopes");
}

async function verifySymbols() {
  stage = "notation-symbols";
  await selectLesson("symbols");
  const cards = page.getByRole("group", { name: "악보 기호 선택" }).getByRole("button");
  assert.equal(await cards.count(), 8);
  await cards.nth(1).click();
  await page.locator(".learn-symbol-detail svg").waitFor();
  assert.match(await page.locator(".learn-symbol-description").innerText(), /넷째 줄/);
  await page.getByRole("button", { name: "설명 가리고 기억하기", exact: true }).click();
  assert.match(await page.locator(".learn-symbol-description").innerText(), /소리 내어 설명/);
  await page.getByRole("button", { name: "설명 확인하기", exact: true }).click();
  for (let i = 0; i < 8; i++) {
    await cards.nth(i).click();
    await page.locator(".learn-symbol-detail svg").waitFor();
  }
  await cards.nth(0).click();
  await page.locator(".learn-symbol-detail svg").waitFor();
  await shot("desktop-symbols");
  report.checks.push("symbols: eight cards, real SVG clefs, reveal-and-recall interaction");
}

async function verifyQuiz(id) {
  stage = `quiz-${id}`;
  await selectLesson(id);
  await page.getByRole("tab", { name: "도전! 발견 퀴즈" }).click();
  const options = page.getByRole("group", { name: "정답 고르기" }).getByRole("button");
  await options.nth((answers[id][0] + 1) % 3).click();
  assert.match(await page.locator(".learn-quiz-feedback").innerText(), /다시 생각/);
  assert.equal(await page.getByRole("button", { name: "다음 문제", exact: true }).count(), 0);
  for (const [index, answer] of answers[id].entries()) {
    await options.nth(answer).click();
    assert.match(await page.locator(".learn-quiz-feedback").innerText(), /맞았어요/);
    if (id === "notes" && index === 0) {
      await page.getByRole("tab", { name: "먼저 체험하기" }).click();
      await page.getByRole("tab", { name: "도전! 발견 퀴즈" }).click();
      assert.equal(await page.locator(".learn-answers .is-correct").count(), 1, "switching tabs preserves quiz answer");
    }
    await page.getByRole("button", { name: index === answers[id].length - 1 ? "도장 받기" : "다음 문제", exact: true }).click();
  }
  await page.getByRole("region", { name: "퀴즈 완료" }).waitFor();
  assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody:learning:v1")))).includes(id));
  report.checks.push(`quiz ${id}: retry works, ${answers[id].length} answers, completion saved`);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    window.__learningAudioProbe = { oscillators: [], gains: [] };
    const Context = window.AudioContext || window.webkitAudioContext;
    const createOscillator = Context.prototype.createOscillator;
    Context.prototype.createOscillator = function (...args) {
      const node = createOscillator.apply(this, args);
      const entry = { starts: [], stops: [] };
      window.__learningAudioProbe.oscillators.push(entry);
      for (const method of ["start", "stop"]) {
        const original = node[method].bind(node);
        node[method] = (...values) => { entry[method === "start" ? "starts" : "stops"].push(values[0]); return original(...values); };
      }
      return node;
    };
    const createGain = Context.prototype.createGain;
    Context.prototype.createGain = function (...args) {
      const node = createGain.apply(this, args);
      const entry = { ramps: [] };
      window.__learningAudioProbe.gains.push(entry);
      const ramp = node.gain.linearRampToValueAtTime.bind(node.gain);
      node.gain.linearRampToValueAtTime = (...values) => { entry.ramps.push(values[0]); return ramp(...values); };
      return node;
    };
  });
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
  stage = "opening-entry";
  await page.goto(baseUrl);
  await page.locator(".opening-learn").click();
  await page.getByRole("heading", { name: /소리로 배우는/ }).waitFor();
  await layout("desktop-home");
  await verifyNotes();
  await verifyMeter();
  await verifyTempo();
  await verifyDynamics();
  await verifySymbols();
  stage = "mobile-layouts";
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "놀이터 목록", exact: true }).click();
  await layout("mobile-home");
  for (const id of Object.keys(lessonTitles)) {
    await selectLesson(id);
    await layout(`mobile-${id}`);
  }
  await selectLesson("meter");
  await page.getByRole("button", { name: "4/4박자", exact: true }).click();
  for (let i = 0; i < 8; i++) await page.getByRole("button", { name: /^8분음표 넣기/ }).click();
  await page.locator(".learning-score-host[data-ready='true'] svg").waitFor();
  await layout("mobile-meter-eight-notes");
  const scoreViewport = page.locator(".learning-score.is-dense .learning-score-viewport");
  assert.ok(await scoreViewport.evaluate((element) => element.scrollWidth > element.clientWidth),
    "dense mobile scores keep readable note sizes inside a scrollable viewport");
  await scoreViewport.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.querySelector(".learning-score-viewport")?.scrollLeft > 0);
  report.checks.push("dense mobile notation can be scrolled with the keyboard without page overflow");
  await page.setViewportSize({ width: 667, height: 375 });
  for (const id of Object.keys(lessonTitles)) {
    await selectLesson(id);
    await layout(`landscape-${id}`, id === "meter");
  }
  report.reducedMotion = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  assert.equal(report.reducedMotion, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const id of Object.keys(answers)) await verifyQuiz(id);
  await shot("desktop-completed");
  stage = "completion-persistence";
  await page.reload();
  await page.locator(".opening-learn").click();
  await page.getByRole("heading", { name: /소리로 배우는/ }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".learn-progress-stamps > .complete").length === 5);
  assert.equal(await page.locator(".learn-progress-stamps > .complete").count(), 5);
  await shot("desktop-all-discoveries");
  report.checks.push("all five completion stamps survive full page reload");
  stage = "composer-menu-integration";
  await page.getByRole("button", { name: "마음멜로디로", exact: true }).click();
  await page.locator(".opening-start").click();
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.getByRole("menuitem", { name: "음악 학습하기", exact: true }).click();
  await page.getByRole("heading", { name: /소리로 배우는/ }).waitFor();
  await page.getByRole("button", { name: "마음멜로디로", exact: true }).click();
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
  assert.equal(await page.locator(".opening-screen").count(), 0, "return preserves composer screen");
  report.checks.push("composer menu opens learning and returns to the original composer screen");
  assert.ok(report.layouts.every((item) => !item.overflow), "one or more mobile layouts have horizontal overflow; see report.layouts");
  assert.deepEqual(report.errors, []);
  report.success = true;
  console.log(JSON.stringify({ success: true, checks: report.checks.length, layouts: report.layouts, consoleErrors: report.consoleErrors }, null, 2));
} catch (error) {
  report.success = false;
  report.stage = stage;
  report.failure = String(error);
  await page?.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ stage, error: String(error) }));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
