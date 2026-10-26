import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// Synthetic embedded QR content enters the unchanged App. All browser contexts
// are isolated, and Firestore requests are blocked: no account or song is read.
const baseline = process.env.MODE === "baseline";
const outputDir = path.resolve(process.env.OUTPUT_DIR || `artifacts/qr-playback-viewport${baseline ? "-before" : ""}`);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const appUrl = process.env.TARGET_URL || baseUrl;
const lyrics = ["우리함께", "노래해요", "작은마음", "힘을내요", "반짝이는", "별빛따라", "친구들아", "다시만나",
  "리듬따라", "두근두근", "마음모아", "손을잡고", "행복하게", "웃어봐요", "내일에도", "함께해요"];
const composition = {
  version: 1, title: "스마트폰 QR 재생 확인", creator: "검증 작곡가", originalCreator: "",
  presetId: "H001", meter: { beats: 4, beatUnit: 4 }, songLength: 16,
  instrumentId: "violin", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
  bpm: 220, lyrics, measures: lyrics.map((word, index) => ({
    candidateName: "검증 가락", chords: [index % 2 ? "F" : "C"],
    notes: Array.from(word).map((lyric, note) => ({
      id: `viewport-${index}-${note}`, pitch: 60 + note * 2, lyric,
      duration: { numerator: 1, denominator: 1 }
    }))
  }))
};
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true
});
const encoderContext = await browser.newContext();
await encoderContext.route("**/firestore.googleapis.com/**", (route) => route.abort("blockedbyclient"));
const encoderPage = await encoderContext.newPage();
await encoderPage.goto(`${baseUrl}?play=qr`, { waitUntil: "domcontentloaded" });
const encoded = await encoderPage.evaluate(async (song) => {
  const { encodeSharedComposition } = await import("/src/music/share.ts");
  return encodeSharedComposition(song);
}, composition);
await encoderContext.close();
const playbackUrl = `${appUrl}?play=qr#song=${encoded}`;
const report = {
  startedAt: new Date().toISOString(), baseline, appUrl,
  mode: "isolated-synthetic-embedded-QR-real-App-native-WebAudio",
  productionDataAccess: false, firestoreRequestsBlocked: 0, sourceOrAudioMocks: false,
  layouts: [], cases: [], errors: []
};

async function setup(viewport, label, url = playbackUrl) {
  const mobile = !label.startsWith("desktop");
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await context.route("**/firestore.googleapis.com/**", async (route) => {
    report.firestoreRequestsBlocked++;
    await route.abort("blockedbyclient");
  });
  await context.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__qrViewportAudio = [];
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        const track = { context: this, starts: [] };
        window.__qrViewportAudio.push(track);
        for (const name of ["createBufferSource", "createOscillator"]) {
          const create = this[name].bind(this);
          this[name] = (...nodeArgs) => {
            const node = create(...nodeArgs);
            const start = node.start.bind(node);
            node.start = (...startArgs) => {
              track.starts.push(Number(startArgs[0]) || this.currentTime);
              return start(...startArgs);
            };
            return node;
          };
        }
      }
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ label, message: error.message }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator(".qr-playback-card").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function measure(page, label) {
  const layout = await page.evaluate(() => {
    function box(selector) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom,
        scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
        overflowY: css.overflowY, maxHeight: css.maxHeight, display: css.display
      };
    }
    return {
      viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height },
      body: { scrollWidth: document.body.scrollWidth, scrollHeight: document.body.scrollHeight, scrollY },
      document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      page: box(".qr-playback-page"), card: box(".qr-playback-card"),
      lyrics: box(".qr-playback-lyrics-box"), scroller: box(".qr-lyrics-scroll"),
      close: box(".qr-playback-close"), play: box(".qr-playback-start"),
      heading: box(".qr-playback-card h1")
    };
  });
  report.layouts.push({ label, ...layout });
  return layout;
}

function fits(box, viewport, label) {
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 &&
    box.bottom <= viewport.height + 1, `${label} must remain inside the viewport`);
}

function assertPhoneLayout(layout, label) {
  const viewport = layout.viewport;
  assert.ok(layout.card.y <= 1, `${label}: card starts at top of viewport`);
  assert.ok(layout.card.x <= 1 && layout.card.width >= viewport.width - 1, `${label}: card fills phone width`);
  assert.ok(Math.abs(layout.card.bottom - viewport.height) <= 1, `${label}: card fills phone height`);
  assert.ok(layout.body.scrollWidth <= viewport.width && layout.document.scrollWidth <= viewport.width,
    `${label}: no horizontal page overflow`);
  assert.ok(layout.document.scrollHeight <= viewport.height + 1, `${label}: only lyrics scroll`);
  fits(layout.close, viewport, `${label} close`);
  fits(layout.play, viewport, `${label} play`);
  fits(layout.scroller, viewport, `${label} lyric viewport`);
  assert.ok(layout.scroller.height > Math.min(viewport.height * .3, 150), `${label}: lyrics use remaining screen`);
  assert.ok(layout.scroller.scrollHeight > layout.scroller.clientHeight, `${label}: full lyrics scroll internally`);
}

async function verifySizes() {
  const sizes = [
    ["phone-375x812", { width: 375, height: 812 }],
    ["phone-360x640", { width: 360, height: 640 }],
    ["phone-412x915", { width: 412, height: 915 }],
    ["landscape-812x375", { width: 812, height: 375 }],
    ["desktop-1280x800", { width: 1280, height: 800 }]
  ];
  for (const [label, viewport] of sizes) {
    const { context, page } = await setup(viewport, label);
    try {
      const layout = await measure(page, label);
      await page.screenshot({ path: path.join(outputDir, `${label}.png`), fullPage: true });
      if (!baseline) {
        if (!label.startsWith("desktop")) assertPhoneLayout(layout, label);
        else {
          fits(layout.card, viewport, `${label} card`);
          fits(layout.close, viewport, `${label} close`);
          fits(layout.play, viewport, `${label} play`);
          assert.ok(layout.scroller.height > 290, "Desktop lyrics grow beyond the old fixed cap");
        }
      }
      report.cases.push({ label, result: baseline ? "observed-before" : "passed" });
    } finally { await context.close(); }
  }
}

async function verifyNativePlaybackAndResize() {
  const { context, page } = await setup({ width: 375, height: 812 }, "playback-resize");
  try {
    await page.getByTestId("qr-create-play").click();
    await page.getByRole("button", { name: "재생 멈추기", exact: true }).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => window.__qrViewportAudio.some((track) =>
      track.starts.length && track.context.state === "running"));
    await page.waitForFunction(() => {
      const card = document.querySelector('.qr-lyric-card.playing');
      return Number(card?.getAttribute("data-measure-index")) >= 9;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(550);
    const playing = await page.evaluate(() => {
      const scroller = document.querySelector(".qr-lyrics-scroll");
      const active = document.querySelector(".qr-lyric-card.playing");
      const activeBox = active?.getBoundingClientRect();
      const scrollBox = scroller.getBoundingClientRect();
      return {
        windowScroll: scrollY, scrollTop: scroller.scrollTop,
        activeVisible: activeBox && activeBox.top >= scrollBox.top - 1 && activeBox.bottom <= scrollBox.bottom + 1,
        measureIndex: active?.getAttribute("data-measure-index"),
        nativeAudioSources: window.__qrViewportAudio.reduce((sum, track) => sum + track.starts.length, 0)
      };
    });
    assert.equal(playing.windowScroll, 0, "Playback must not scroll the whole page");
    assert.ok(playing.scrollTop > 0, "Current later measure scrolls the lyric panel");
    assert.ok(playing.activeVisible, "Current measure is visible inside lyric scroller");
    assert.ok(playing.nativeAudioSources > 0, "Real native WebAudio sources are scheduled");
    report.cases.push({ label: "native-playback-internal-lyric-scroll", result: "passed", ...playing });
    await page.screenshot({ path: path.join(outputDir, "phone-playing-later-measure.png") });
    await page.setViewportSize({ width: 812, height: 375 });
    await page.waitForTimeout(150);
    assertPhoneLayout(await measure(page, "live-resize-landscape"), "live-resize-landscape");
    await page.screenshot({ path: path.join(outputDir, "live-resize-landscape.png") });
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(150);
    assertPhoneLayout(await measure(page, "live-resize-small-phone"), "live-resize-small-phone");
    await page.getByRole("button", { name: "재생 멈추기", exact: true }).click();
    await page.getByRole("button", { name: "노래 재생", exact: true }).waitFor();
    await page.waitForFunction(() => window.__qrViewportAudio.filter((track) => track.starts.length)
      .every((track) => track.context.state === "closed"));
    assert.equal(await page.locator(".qr-lyric-card.playing").count(), 0);
    report.cases.push({ label: "live-resize-and-stop", result: "passed" });
  } finally { await context.close(); }
}

async function verifyInvalidLink() {
  const { context, page } = await setup({ width: 360, height: 640 }, "invalid-link", `${appUrl}?play=qr#song=invalid`);
  try {
    await page.getByRole("heading", { name: "노래 링크를 확인해 주세요" }).waitFor();
    const layout = await measure(page, "invalid-link");
    fits(layout.card, layout.viewport, "Invalid link card");
    fits(layout.close, layout.viewport, "Invalid link close");
    assert.ok(layout.document.scrollWidth <= layout.viewport.width);
    await page.screenshot({ path: path.join(outputDir, "invalid-link-phone.png") });
    report.cases.push({ label: "invalid-link-phone", result: "passed" });
  } finally { await context.close(); }
}

try {
  await verifySizes();
  if (!baseline) {
    await verifyNativePlaybackAndResize();
    await verifyInvalidLink();
    assert.deepEqual(report.errors, [], "No uncaught application errors");
  }
  report.finishedAt = new Date().toISOString();
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
console.log(JSON.stringify({ result: report.result, cases: report.cases.length, outputDir, failure: report.failure }));
