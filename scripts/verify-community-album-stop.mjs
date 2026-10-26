import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// The existing public albums require passwords. This harness substitutes only
// the two read functions in a private Vite instance; production data is neither
// read nor written. App, album dialogs, playback hooks and WebAudio stay real.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/community-album-stop");
await mkdir(outputDir, { recursive: true });
const words = ["우리노래", "함께불러", "작은마음", "리듬따라", "반짝이는", "노랫소리", "다시만나", "친구들아"];
const draft = {
  version: 1, updatedAt: Date.now(), projectId: "album-stop-browser-fixture", sourceHash: "",
  title: "공유 노래 재생 중단 확인", creator: "검증용 작곡가", originalCreator: "", presetId: "H001",
  songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "violin", lyrics: words,
  showArrangement: false, measures: words.map((word, index) => ({ candidateId: "custom", candidateName: "검증 가락",
    chords: [index % 2 ? "F" : "C"], notes: Array.from(word, (lyric, note) => ({
      id: `album-note-${index}-${note}`, pitch: 60 + note * 2, lyric,
      duration: { numerator: 1, denominator: 1 }
    })) }))
};
const album = { id: "browser-check-album", name: "재생 중단 검증 앨범", ownerId: "fixture-owner",
  ownerName: "검증용 사용자", locked: false, createdAt: Date.now(), updatedAt: Date.now() };
const song = { id: "browser-check-song", albumId: album.id, ownerId: album.ownerId, ownerName: album.ownerName,
  sourceScoreId: "fixture-score", title: draft.title, creator: draft.creator, access: "score",
  publishedAt: Date.now(), updatedAt: Date.now(), draft };

function replaceRead(code, name, nextName, value) {
  const start = code.indexOf(`export async function ${name}(`);
  const end = code.indexOf(`export async function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `Fixture boundary must exist: ${name}`);
  return `${code.slice(0, start)}export async function ${name}() { return ${JSON.stringify(value)}; }\n\n${code.slice(end)}`;
}

const server = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false }, plugins: [{
  name: "private-album-read-fixtures", enforce: "pre", transform(code, id) {
    if (!id.replaceAll("\\", "/").endsWith("/src/firebase/communityAlbums.ts")) return null;
    const albums = replaceRead(code, "listCommunityAlbums", "createCommunityAlbum", [album]);
    return replaceRead(albums, "listPublishedSongs", "publishScoreToAlbum", [song]);
  }
}] });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const report = { startedAt: new Date().toISOString(), baseUrl, mode: "local-private-read-fixtures-real-WebAudio",
  productionDataAccess: false, isolatedContexts: true, firestoreRequestsBlocked: 0, cases: [], errors: [] };

async function setup(label, viewport = { width: 1440, height: 900 }, holdSamples = false) {
  const context = await browser.newContext({ viewport });
  await context.route("**/firestore.googleapis.com/**", async (route) => {
    report.firestoreRequestsBlocked++;
    await route.abort("blockedbyclient");
  });
  await context.addInitScript(({ holdSamples }) => {
    const NativeAudioContext = window.AudioContext;
    const tracks = [];
    const pendingSamples = [];
    window.__albumAudio = { tracks, holdSamples, pendingSamples };
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        const track = { context: this, started: 0 };
        tracks.push(track);
        for (const name of ["createBufferSource", "createOscillator"]) {
          const create = this[name].bind(this);
          this[name] = (...nodeArgs) => {
            const node = create(...nodeArgs);
            const start = node.start.bind(node);
            node.start = (...startArgs) => { track.started++; return start(...startArgs); };
            return node;
          };
        }
      }
    };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (window.__albumAudio.holdSamples && /midi-js-soundfonts/.test(url)) {
        await new Promise((resolve) => pendingSamples.push(resolve));
      }
      return nativeFetch(...args);
    };
  }, { holdSamples });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ label, message: error.message }));
  await page.goto(`${baseUrl}?start=new`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.getByRole("menuitem", { name: "모두의 앨범", exact: true }).click();
  await page.locator(".community-album-folder").getByText(album.name, { exact: true }).click();
  await page.locator(".community-song").getByText(song.title, { exact: true }).click();
  return { context, page };
}

function songMenu(page) { return page.getByRole("dialog", { name: `${song.title} 음악 메뉴`, exact: true }); }
function playButton(page) { return songMenu(page).getByRole("button", { name: "재생하기", exact: true }); }
function stopButton(page) { return songMenu(page).getByRole("button", { name: "재생 중단", exact: true }); }
async function audioState(page) {
  return page.evaluate(() => window.__albumAudio.tracks.map((track) => ({
    state: track.context.state, started: track.started, currentTime: track.context.currentTime
  })));
}
async function waitForSound(page) {
  await page.waitForFunction(() => window.__albumAudio.tracks.some((track) => track.started > 0 && track.context.state === "running"), null, { timeout: 20000 });
  // Catch the original bug: the preparation promise resolved and hid Stop
  // despite notes continuing to play for the rest of the composition.
  await page.waitForTimeout(650);
  await stopButton(page).waitFor();
  assert.equal(await stopButton(page).isEnabled(), true);
}
async function waitForStopped(page) {
  await page.waitForFunction(() => window.__albumAudio.tracks.filter((track) => track.started > 0)
    .every((track) => track.context.state === "closed"));
}
async function assertButtonFits(button, viewport) {
  const box = await button.boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
    "Stop button must fit in the visible viewport");
}

async function verifyDesktopStopAndReplay() {
  const { page, context } = await setup("desktop");
  try {
    await playButton(page).click();
    await waitForSound(page);
    await assertButtonFits(stopButton(page), { width: 1440, height: 900 });
    await page.screenshot({ path: path.join(outputDir, "desktop-playing-stop-visible.png") });
    const first = await audioState(page);
    await stopButton(page).click();
    await playButton(page).waitFor();
    await waitForStopped(page);
    await playButton(page).click();
    await waitForSound(page);
    const replay = await audioState(page);
    assert.ok(replay.length > first.length, "Replay creates a fresh owned WebAudio context");
    await songMenu(page).getByRole("button", { name: "음악 메뉴 닫기", exact: true }).click();
    await songMenu(page).waitFor({ state: "hidden" });
    await waitForStopped(page);
    report.cases.push({ name: "desktop Stop persists after real sound starts, closes context mid-song, replay works, closing menu stops",
      initialAudio: first, finalAudio: await audioState(page) });
  } finally { await context.close(); }
}

async function verifyMobileScoreStopAndAlbumClose() {
  const viewport = { width: 375, height: 667 };
  const { page, context } = await setup("mobile", viewport);
  try {
    await playButton(page).click();
    await waitForSound(page);
    await assertButtonFits(stopButton(page), viewport);
    await songMenu(page).getByRole("button", { name: "악보 보기", exact: true }).click();
    const score = page.getByRole("dialog", { name: `${song.title} 악보`, exact: true });
    const stop = score.getByRole("button", { name: "재생 중단", exact: true });
    await stop.waitFor();
    await assertButtonFits(stop, viewport);
    await page.screenshot({ path: path.join(outputDir, "mobile-score-stop-visible.png") });
    await stop.click();
    await waitForStopped(page);
    await stop.waitFor({ state: "hidden" });
    await score.getByRole("button", { name: "악보 닫기", exact: true }).click();
    await playButton(page).waitFor();
    await playButton(page).click();
    await waitForSound(page);
    await page.keyboard.press("Escape");
    await songMenu(page).waitFor({ state: "hidden" });
    await waitForStopped(page);
    await page.getByRole("button", { name: "모두의 앨범 닫기", exact: true }).click();
    await page.getByRole("dialog", { name: "모두의 앨범", exact: true }).waitFor({ state: "hidden" });
    report.cases.push({ name: "mobile score Stop accessible, closes real audio, replay works, dismissing menu and album cleans up",
      finalAudio: await audioState(page) });
  } finally { await context.close(); }
}

async function verifyCancelDuringPreparation() {
  const { page, context } = await setup("preparation-cancel", { width: 1440, height: 900 }, true);
  try {
    const before = (await audioState(page)).length;
    await playButton(page).click();
    await stopButton(page).waitFor();
    await page.waitForFunction((before) => window.__albumAudio.tracks.length > before, before);
    const ownedIndex = (await audioState(page)).length - 1;
    assert.equal((await audioState(page))[ownedIndex].started, 0);
    await stopButton(page).click();
    await playButton(page).waitFor();
    await page.waitForFunction((index) => window.__albumAudio.tracks[index].context.state === "closed", ownedIndex);
    await page.evaluate(() => {
      window.__albumAudio.holdSamples = false;
      window.__albumAudio.pendingSamples.splice(0).forEach((resolve) => resolve());
    });
    await page.waitForTimeout(1800);
    const cancelled = await audioState(page);
    assert.equal(cancelled[ownedIndex].started, 0, "Late sample preparation cannot start the cancelled song");
    assert.equal(cancelled[ownedIndex].state, "closed");
    await playButton(page).click();
    await waitForSound(page);
    await stopButton(page).click();
    await waitForStopped(page);
    report.cases.push({ name: "Stop during delayed real sample loading closes owned context, late completion stays silent, retry plays",
      cancelledAudio: cancelled, finalAudio: await audioState(page) });
  } finally { await context.close(); }
}

try {
  await verifyDesktopStopAndReplay();
  await verifyMobileScoreStopAndAlbumClose();
  await verifyCancelDuringPreparation();
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await server.close();
}
