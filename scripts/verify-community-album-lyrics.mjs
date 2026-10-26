import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// Only album/song list reads are replaced in this private Vite instance.
// The real App, dialogs, lyric model, playback hooks, sample loading and native
// WebAudio run unchanged. Firestore is blocked; no real account is used.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/community-album-lyrics");
await mkdir(outputDir, { recursive: true });
const words = ["우리 함께", "작은마음", "리듬따라", "반짝이는", "노랫소리", "다시만나", "친구들아", "함께불러"];
const draft = {
  version: 1, updatedAt: Date.now(), projectId: "album-lyrics-browser-fixture", sourceHash: "",
  title: "한국어 가사 동기화 확인", creator: "검증용 작곡가", originalCreator: "", presetId: "H001",
  songLength: 8, meter: { beats: 4, beatUnit: 4 }, bpm: 120, instrumentId: "violin", lyrics: words,
  showArrangement: false, measures: words.map((word, index) => ({
    candidateId: "custom", candidateName: "검증 가락", chords: [index % 2 ? "F" : "C"],
    notes: index === 0 ? [
      { id: "lyric-0-0", pitch: 60, lyric: "우", duration: { numerator: 1, denominator: 2 } },
      { id: "lyric-0-1", pitch: 62, lyric: "리", duration: { numerator: 1, denominator: 2 } },
      { id: "lyric-0-2", pitch: 64, lyric: "함께", duration: { numerator: 1, denominator: 1 } },
      { id: "lyric-0-rest", pitch: null, duration: { numerator: 1, denominator: 1 } },
      { id: "lyric-0-blank", pitch: 67, lyric: "", duration: { numerator: 1, denominator: 1 } }
    ] : Array.from(word, (lyric, note) => ({
      id: `lyric-${index}-${note}`, pitch: 60 + note * 2, lyric,
      duration: { numerator: 1, denominator: 1 }
    }))
  }))
};
const album = {
  id: "browser-check-lyrics-album", name: "가사 동기화 검증 앨범", ownerId: "fixture-owner",
  ownerName: "검증용 사용자", locked: false, createdAt: Date.now(), updatedAt: Date.now()
};
const song = {
  id: "browser-check-lyrics-song", albumId: album.id, ownerId: album.ownerId, ownerName: album.ownerName,
  sourceScoreId: "fixture-score", title: draft.title, creator: draft.creator, access: "score",
  publishedAt: Date.now(), updatedAt: Date.now(), draft
};
const audioSong = { ...song, id: "browser-check-audio-only", title: "음악만 공개된 한국어 노래", access: "audio" };
const noLyricsSong = {
  ...song, id: "browser-check-no-lyrics", title: "가사 없는 연주곡", access: "audio",
  draft: { ...draft, lyrics: words.map(() => ""), measures: draft.measures.map((measure) => ({
    ...measure, notes: measure.notes.map((note) => ({ ...note, lyric: "" }))
  })) }
};

function replaceRead(code, name, nextName, value) {
  const start = code.indexOf(`export async function ${name}(`);
  const end = code.indexOf(`export async function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `Fixture boundary must exist: ${name}`);
  return `${code.slice(0, start)}export async function ${name}() { return ${JSON.stringify(value)}; }\n\n${code.slice(end)}`;
}

const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [{
    name: "private-album-lyric-read-fixtures", enforce: "pre", transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith("/src/firebase/communityAlbums.ts")) return null;
      const albums = replaceRead(code, "listCommunityAlbums", "createCommunityAlbum", [album]);
      return replaceRead(albums, "listPublishedSongs", "publishScoreToAlbum", [song, audioSong, noLyricsSong]);
    }
  }]
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true
});
const report = {
  startedAt: new Date().toISOString(), baseUrl, mode: "local-private-list-read-fixtures-real-WebAudio",
  fixtureScope: "listCommunityAlbums and listPublishedSongs only; real app, lyrics, hooks and native WebAudio",
  productionDataAccess: false, isolatedContexts: true, firestoreRequestsBlocked: 0,
  cases: [], errors: [], clockChecks: []
};

async function setup(label, viewport = { width: 1440, height: 900 }, holdSamples = false) {
  const context = await browser.newContext({ viewport });
  await context.route("**/firestore.googleapis.com/**", async (route) => {
    report.firestoreRequestsBlocked++;
    await route.abort("blockedbyclient");
  });
  await context.addInitScript(({ holdSamples }) => {
    const NativeAudioContext = window.AudioContext;
    window.__albumLyricsAudio = { tracks: [], holdSamples, pendingSamples: [] };
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        const track = { context: this, starts: [] };
        window.__albumLyricsAudio.tracks.push(track);
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
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (window.__albumLyricsAudio.holdSamples && /midi-js-soundfonts/.test(url)) {
        await new Promise((resolve) => window.__albumLyricsAudio.pendingSamples.push(resolve));
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
  return { context, page };
}

function songMenu(page, current = song) {
  return page.getByRole("dialog", { name: `${current.title} 음악 메뉴`, exact: true });
}
function panel(scope) { return scope.getByTestId("community-lyrics"); }
function activeSyllables(scope) { return panel(scope).locator('[data-note-id][aria-current="true"]'); }
function activeRows(scope) { return panel(scope).locator('[data-measure-index][aria-current="true"]'); }
function playButton(scope) { return scope.getByRole("button", { name: "재생하기", exact: true }); }
function stopButton(scope) { return scope.getByRole("button", { name: "재생 중단", exact: true }); }
async function openSong(page, current = song) {
  await page.locator(".community-song").getByText(current.title, { exact: true }).click();
  await panel(songMenu(page, current)).waitFor();
}
async function releaseSamples(page) {
  await page.evaluate(() => {
    const audio = window.__albumLyricsAudio;
    audio.holdSamples = false;
    audio.pendingSamples.splice(0).forEach((resolve) => resolve());
  });
}
async function waitForSound(page, scope) {
  await page.waitForFunction(() => window.__albumLyricsAudio.tracks.some((track) =>
    track.starts.length > 0 && track.context.state === "running"), null, { timeout: 25000 });
  await panel(scope).locator('[data-note-id]').first().waitFor();
  await stopButton(scope).waitFor();
}
async function audioState(page) {
  return page.evaluate(() => window.__albumLyricsAudio.tracks.map((track) => ({
    state: track.context.state, currentTime: track.context.currentTime,
    starts: track.starts.length, scheduledStart: track.starts.length ? Math.min(...track.starts) : null
  })));
}
async function waitForStopped(page) {
  await page.waitForFunction(() => window.__albumLyricsAudio.tracks.filter((track) => track.starts.length)
    .every((track) => track.context.state === "closed"));
}
async function freezeAt(page, seconds) {
  // Suspend the actual native audio clock at an observed source's start time.
  // UI timing must remain synchronized even while wall-clock time keeps moving.
  await page.evaluate(async (seconds) => {
    const track = [...window.__albumLyricsAudio.tracks].reverse().find((item) =>
      item.starts.length && item.context.state !== "closed");
    if (!track) throw new Error("No live native AudioContext");
    const start = Math.min(...track.starts);
    if (track.context.state === "suspended") await track.context.resume();
    await new Promise((resolve, reject) => {
      const deadline = performance.now() + 25000;
      const poll = window.setInterval(() => {
        if (performance.now() > deadline || track.context.state === "closed") {
          window.clearInterval(poll);
          reject(new Error("Audio clock did not reach the requested position"));
        } else if (track.context.currentTime - start >= seconds) {
          window.clearInterval(poll);
          void track.context.suspend().then(resolve, reject);
        }
      }, 5);
    });
  }, seconds);
  await page.waitForTimeout(120);
}
async function assertClockAndPosition(page, scope, expectedMeasure, expectedNote = null) {
  const audio = (await audioState(page)).findLast((track) => track.starts > 0 && track.state !== "closed");
  assert.ok(audio, "Native audio clock must still be available");
  const expectedElapsed = Math.max(0, audio.currentTime - audio.scheduledStart);
  const observedElapsed = Number(await panel(scope).getAttribute("data-elapsed-seconds"));
  assert.ok(Math.abs(observedElapsed - expectedElapsed) < .12,
    `UI elapsed ${observedElapsed} must follow native AudioContext elapsed ${expectedElapsed}`);
  assert.equal(await activeRows(scope).getAttribute("data-measure-index"), String(expectedMeasure));
  if (expectedNote === null) assert.equal(await activeSyllables(scope).count(), 0);
  else assert.equal(await activeSyllables(scope).getAttribute("data-note-id"), expectedNote);
  report.clockChecks.push({ expectedMeasure, expectedNote, observedElapsed, nativeElapsed: expectedElapsed });
}
async function assertIdle(scope) {
  assert.equal(await panel(scope).getAttribute("data-phase"), "idle");
  assert.equal(await activeRows(scope).count(), 0);
  assert.equal(await activeSyllables(scope).count(), 0);
}
async function assertFits(locator, viewport, label) {
  const box = await locator.boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 &&
    box.y + box.height <= viewport.height + 1, `${label} must fit in the visible viewport`);
}

async function verifyNativeClockAndLyrics() {
  const { page, context } = await setup("native-clock", undefined, true);
  try {
    await openSong(page);
    const menu = songMenu(page);
    await assertIdle(menu);
    assert.ok((await panel(menu).textContent()).includes("우리"));
    await page.screenshot({ path: path.join(outputDir, "desktop-lyrics-before-play.png") });
    await playButton(menu).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="community-lyrics"]')
      ?.getAttribute("data-phase") === "preparing");
    await page.waitForTimeout(800);
    assert.equal(await activeSyllables(menu).count(), 0, "Sample preparation must not start lyric highlighting");
    assert.equal(await activeRows(menu).count(), 0, "Sample preparation must not advance a measure");
    assert.equal(Number(await panel(menu).getAttribute("data-elapsed-seconds")), 0);
    await releaseSamples(page);
    await waitForSound(page, menu);
    await freezeAt(page, .1);
    await assertClockAndPosition(page, menu, 0, "lyric-0-0");
    const frozenElapsed = Number(await panel(menu).getAttribute("data-elapsed-seconds"));
    await page.waitForTimeout(450);
    assert.ok(Math.abs(Number(await panel(menu).getAttribute("data-elapsed-seconds")) - frozenElapsed) < .03,
      "Paused native AudioContext must freeze lyrics despite advancing wall-clock time");
    await freezeAt(page, .35);
    await assertClockAndPosition(page, menu, 0, "lyric-0-1");
    await freezeAt(page, .75);
    await assertClockAndPosition(page, menu, 0, "lyric-0-2");
    await page.screenshot({ path: path.join(outputDir, "desktop-current-korean-syllable.png") });
    await freezeAt(page, 1.2);
    await assertClockAndPosition(page, menu, 0);
    await freezeAt(page, 1.7);
    await assertClockAndPosition(page, menu, 0);
    await freezeAt(page, 2.2);
    await assertClockAndPosition(page, menu, 1, "lyric-1-0");
    await menu.getByRole("button", { name: "악보 보기", exact: true }).click();
    const score = page.getByRole("dialog", { name: `${song.title} 악보`, exact: true });
    await assertClockAndPosition(page, score, 1, "lyric-1-0");
    await page.screenshot({ path: path.join(outputDir, "score-current-lyrics.png") });
    await stopButton(score).click();
    await waitForStopped(page);
    await assertIdle(score);
    await score.getByRole("button", { name: "악보 닫기", exact: true }).click();
    await assertIdle(menu);
    await playButton(menu).click();
    await waitForSound(page, menu);
    await freezeAt(page, .1);
    await assertClockAndPosition(page, menu, 0, "lyric-0-0");
    await stopButton(menu).click();
    await waitForStopped(page);
    await page.waitForTimeout(400);
    await assertIdle(menu);
    report.cases.push({ name: "Korean syllable timing follows native audio clock, preparation stays idle, rests/empty lyrics unhighlight, score sync and replay reset",
      audio: await audioState(page) });
  } finally { await context.close(); }
}

async function verifyScrollAndAccess() {
  const { page, context } = await setup("scoped-scroll-access");
  try {
    await openSong(page, audioSong);
    const menu = songMenu(page, audioSong);
    assert.equal(await menu.getByRole("button", { name: "악보 보기", exact: true }).isDisabled(), true);
    assert.equal(await menu.getByRole("button", { name: "프로젝트 보기", exact: true }).isDisabled(), true);
    await playButton(menu).click();
    await waitForSound(page, menu);
    const before = await page.evaluate(() => ({ body: document.documentElement.scrollTop,
      dialog: document.querySelector(".album-song-dialog")?.getBoundingClientRect().top }));
    await freezeAt(page, 12.2);
    await assertClockAndPosition(page, menu, 6, "lyric-6-0");
    const active = await activeRows(menu).boundingBox();
    const bounds = await panel(menu).boundingBox();
    assert.ok(active && bounds && active.y >= bounds.y && active.y + active.height <= bounds.y + bounds.height + 1,
      "The currently playing lyric must scroll into its own panel");
    const after = await page.evaluate(() => ({ body: document.documentElement.scrollTop,
      dialog: document.querySelector(".album-song-dialog")?.getBoundingClientRect().top }));
    assert.deepEqual(after, before, "Lyric following must not scroll the page or move the music dialog");
    await page.screenshot({ path: path.join(outputDir, "lyrics-panel-scrolled-current-measure.png") });
    await stopButton(menu).click();
    await waitForStopped(page);
    report.cases.push({ name: "Audio-only publication retains locked score/project, current lyrics scroll inside their own panel", before, after });
  } finally { await context.close(); }
}

async function verifyMobileAndNoLyrics() {
  const viewport = { width: 375, height: 667 };
  const { page, context } = await setup("mobile-empty", viewport);
  try {
    await openSong(page);
    const menu = songMenu(page);
    await assertFits(panel(menu), viewport, "Mobile lyric panel");
    await playButton(menu).click();
    await waitForSound(page, menu);
    await assertFits(stopButton(menu), viewport, "Mobile Stop button");
    await freezeAt(page, .75);
    await assertClockAndPosition(page, menu, 0, "lyric-0-2");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "Mobile page must not overflow horizontally");
    await page.screenshot({ path: path.join(outputDir, "mobile-korean-current-lyrics.png") });
    await menu.getByRole("button", { name: "음악 메뉴 닫기", exact: true }).click();
    await waitForStopped(page);
    await openSong(page, noLyricsSong);
    const empty = songMenu(page, noLyricsSong);
    await assertIdle(empty);
    assert.match(await panel(empty).textContent(), /가사.*없|가사.*아직/);
    assert.equal(await panel(empty).locator("[data-note-id]").count(), 0);
    await playButton(empty).click();
    await page.waitForFunction(() => window.__albumLyricsAudio.tracks.some((track) =>
      track.starts.length && track.context.state === "running"), null, { timeout: 25000 });
    await assertFits(stopButton(empty), viewport, "Instrumental Stop button");
    await page.screenshot({ path: path.join(outputDir, "mobile-instrumental-no-lyrics.png") });
    await stopButton(empty).click();
    await waitForStopped(page);
    report.cases.push({ name: "375px mobile lyrics and Stop remain visible without overflow, instrumental song has an honest no-lyrics state and remains playable" });
  } finally { await context.close(); }
}

try {
  await verifyNativeClockAndLyrics();
  await verifyScrollAndAccess();
  await verifyMobileAndNoLyrics();
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
