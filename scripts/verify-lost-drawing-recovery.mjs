import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import LZString from "lz-string";

// Native UI regression in fresh private contexts only. APP_URL uses the same
// checks against production without importing application source modules.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/lost-drawing-recovery");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const report = { startedAt: new Date().toISOString(), baseUrl, isolatedContexts: true, blockedCloudRequests: 0, errors: [], cases: [] };
const DRAFT = "maeum-melody:draft:v1";
const PROMPT_SHOWN = "maeum-melody:lost-drawings:auto-prompt-shown:v1";

async function verifyBuildHashes() {
  const response = await fetch(baseUrl, { cache: "no-store" });
  assert.equal(response.status, 200);
  const html = await response.text();
  const assets = { javascript: /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html)?.[1],
    stylesheet: /href="([^"]*\/assets\/index-[^"]+\.css)"/.exec(html)?.[1] };
  const hashes = {};
  for (const [kind, assetPath] of Object.entries(assets)) {
    assert.ok(assetPath, `${kind} entry must exist`);
    const deployed = await fetch(new URL(assetPath, baseUrl), { cache: "no-store" });
    assert.equal(deployed.status, 200);
    const bytes = Buffer.from(await deployed.arrayBuffer());
    const local = await readFile(path.join("dist", new URL(assetPath, baseUrl).pathname));
    const hash = (value) => createHash("sha256").update(value).digest("hex");
    hashes[kind] = hash(bytes);
    assert.equal(hash(bytes), hash(local), `${kind} must match the tested local build`);
  }
  report.build = { assets, hashes, matchesLocalBuild: true };
}

function scene(id = "surviving-scene", points = [[100, 100, .5], [220, 180, .8], [360, 140, .5]]) {
  return { id, background: "#fff8ed", endLyric: null, endMeasureIndex: 7, motion: "bounce", elements: [
    { id: "surviving-stroke", tool: "brush", color: "#22c55e", width: 8, points }
  ] };
}

function fixture(projectId, scenes = []) {
  const words = ["나의노래", "우리그림", "함께불러", "리듬따라", "반짝이는", "작은마음", "노래만들", "다시만나"];
  return { version: 1, updatedAt: Date.now() - 10_000, projectId, sourceHash: "", title: "현재 작품 보호 검증",
    creator: "검증용 작곡가", originalCreator: "", presetId: "H001", songLength: 8,
    meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "piano", accompanimentStyleId: "arpeggio",
    accompanimentInstrumentIds: ["piano"], lyrics: words, showArrangement: true,
    measures: words.map((word, index) => ({ candidateId: "custom", candidateName: "그림 복구 검증", chords: [index % 2 ? "F" : "C"], effects: [],
      notes: Array.from(word, (lyric, note) => ({ id: `recovery-note-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 1, denominator: 1 } })) })), musicVideoScenes: scenes };
}

function oldBackup(current) {
  return { ...current, updatedAt: current.updatedAt - 60_000, title: "이전 그림이 있는 노래", musicVideoScenes: [scene()] };
}

async function setup(records, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(/firestore\.googleapis\.com|firebaseio\.com/, (route) => {
    report.blockedCloudRequests += 1;
    return route.abort();
  });
  await context.addInitScript((records) => {
    if (sessionStorage.getItem("recovery-test-seeded")) return;
    for (const [key, raw] of Object.entries(records)) localStorage.setItem(key, raw);
    sessionStorage.setItem("recovery-test-seeded", "1");
  }, records);
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push({ label, message: error.message }));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${baseUrl}?start=new`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
  return { page, context };
}

async function localDraft(page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), DRAFT);
  return raw ? JSON.parse(raw.startsWith("lz16:") ? LZString.decompressFromUTF16(raw.slice(5)) : raw) : null;
}

async function recordsIn(page, database, store) {
  return page.evaluate(async ({ database, store }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(database);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      if (!db.objectStoreNames.contains(store)) return [];
      return await new Promise((resolve, reject) => {
        const request = db.transaction(store, "readonly").objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally { db.close(); }
  }, { database, store });
}

async function inbox(page) { return recordsIn(page, "maeum-melody-lost-drawings", "records"); }
async function projects(page) { return recordsIn(page, "maeum-melody-projects", "projects"); }
function popup(page) { return page.getByTestId("lost-drawing-recovery-dialog"); }

async function settleUi(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function verifyOneAutomaticOffer(closeMethod) {
  const current = fixture(`recovery-offer-once-${closeMethod}`);
  const backup = oldBackup(current);
  const rawBackup = JSON.stringify(backup);
  const { context, page } = await setup({ [DRAFT]: JSON.stringify(current), [`${DRAFT}:backup`]: rawBackup }, closeMethod);
  try {
    await popup(page).waitFor();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), PROMPT_SHOWN), "1",
      "Displaying the first recovery offer must persist its browser preference immediately");
    await page.screenshot({ path: path.join(outputDir, `offer-once-${closeMethod}.png`) });
    if (closeMethod === "escape") await popup(page).press("Escape");
    else await popup(page).getByRole("button", { name: "그림 복구 나중에 하기", exact: true }).click();
    await popup(page).waitFor({ state: "hidden" });
    const original = (await inbox(page)).find((entry) => entry.originals.some((item) => item.raw === rawBackup));
    assert.ok(original, "Closing must keep the complete recovery source");
    assert.notEqual(original.resolution, "dismissed", "Closing must not mark the drawing discarded");
    const unchanged = await localDraft(page);
    for (const key of ["projectId", "title", "creator", "lyrics", "measures", "musicVideoScenes"]) {
      assert.deepEqual(unchanged[key], current[key], `Closing must not alter ${key}`);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
    await page.waitForTimeout(700);
    assert.equal(await popup(page).count(), 0, "The same unresolved source must not auto-open after reload");

    const newer = { ...backup, title: "나중에 발견된 다른 그림", updatedAt: Date.now(),
      musicVideoScenes: [scene(`new-source-${closeMethod}`, [[120, 100, .5], [400, 330, .8]])] };
    const rawNewer = JSON.stringify(newer);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: `${DRAFT}:recovery`, raw: rawNewer });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
    await page.waitForTimeout(700);
    assert.equal(await popup(page).count(), 0, "A new source must not trigger a second automatic offer in this browser");
    assert.ok((await inbox(page)).some((entry) => entry.originals.some((item) => item.raw === rawNewer)),
      "A new drawing must still be discovered and preserved in the background");
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await page.getByRole("menuitem", { name: "사라진 그림 찾기", exact: true }).click();
    await popup(page).getByTestId("restore-lost-drawing").waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-testid="lost-drawing-recovery-dialog"] button:disabled'));
    assert.ok((await popup(page).textContent()).includes(newer.title), "Manual search must expose the later record");
    const preserved = await inbox(page);
    assert.ok(preserved.some((entry) => entry.originals.some((item) => item.raw === rawBackup)));
    assert.ok(preserved.some((entry) => entry.originals.some((item) => item.raw === rawNewer)));
    await popup(page).getByRole("button", { name: "그림 복구 나중에 하기", exact: true }).click();
    await popup(page).waitFor({ state: "hidden" });
    report.cases.push({ name: `one automatic offer per fresh browser, ${closeMethod} retains unresolved records, reload and later source stay silent, manual finder remains available` });
  } finally { await context.close(); }
}

async function verifyDismissAndManualReopen() {
  const current = fixture("recovery-dismiss-project");
  const backup = oldBackup(current);
  const rawBackup = JSON.stringify(backup);
  const { context, page } = await setup({ [DRAFT]: JSON.stringify(current), [`${DRAFT}:backup`]: rawBackup }, "dismiss");
  try {
    await popup(page).waitFor();
    assert.equal(await popup(page).getAttribute("aria-modal"), "true");
    assert.equal(await page.getByRole("dialog", { name: "이전에 그린 그림을 찾았어요", exact: true }).count(), 1);
    assert.equal((await localDraft(page)).projectId, current.projectId);
    assert.deepEqual((await localDraft(page)).musicVideoScenes, []);
    const saved = await inbox(page);
    assert.ok(saved.some((entry) => entry.originals.some((original) => original.source.endsWith(":backup") && original.raw === rawBackup)));
    await page.screenshot({ path: path.join(outputDir, "found-before-migration.png") });
    await popup(page).getByRole("button", { name: "복구하지 않기", exact: true }).click();
    await popup(page).waitFor({ state: "hidden" });
    assert.ok((await inbox(page)).some((entry) => entry.resolution === "dismissed"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
    await settleUi(page);
    assert.equal(await popup(page).count(), 0);
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await page.getByRole("menuitem", { name: "사라진 그림 찾기", exact: true }).click();
    await popup(page).getByTestId("restore-lost-drawing").waitFor();
    assert.ok((await popup(page).textContent()).includes(backup.title));
    await popup(page).getByRole("button", { name: "그림 복구 나중에 하기", exact: true }).click();
    await settleUi(page);
    assert.equal(await popup(page).count(), 0, "Closing a manual search must not re-open dismissed candidates automatically");
    report.cases.push({ name: "old drawn backup preserved before migration, dismiss survives reload, manual search can reopen and close" });
  } finally { await context.close(); }
}

async function verifyIndependentRestore() {
  const current = fixture("recovery-protected-current");
  const backup = oldBackup(current);
  const { context, page } = await setup({ [DRAFT]: JSON.stringify(current),
    [`${DRAFT}:backup`]: `lz16:${LZString.compressToUTF16(JSON.stringify(backup))}` }, "restore");
  try {
    await popup(page).waitFor();
    assert.equal((await localDraft(page)).title, current.title);
    await popup(page).getByTestId("restore-lost-drawing").click();
    await page.getByTestId("scene-paint-canvas").waitFor();
    await popup(page).waitFor({ state: "hidden" });
    assert.equal(await popup(page).count(), 0);
    const restored = await localDraft(page);
    assert.notEqual(restored.projectId, current.projectId);
    assert.match(restored.title, /복구/);
    assert.deepEqual(restored.musicVideoScenes, backup.musicVideoScenes);
    assert.equal(await page.getByTestId("scene-paint-canvas").locator(":scope > path").count(), 1);
    const archived = (await projects(page)).find((row) => row.id === current.projectId)?.draft;
    assert.equal(archived.title, current.title);
    assert.deepEqual(archived.musicVideoScenes, []);
    assert.ok((await inbox(page)).some((entry) => entry.resolution === "restored" && entry.originals.length > 0));
    await page.screenshot({ path: path.join(outputDir, "restored-independent-copy.png") });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
    await settleUi(page);
    assert.equal(await popup(page).count(), 0);
    assert.deepEqual((await localDraft(page)).musicVideoScenes, backup.musicVideoScenes);
    report.cases.push({ name: "compressed old backup restores independent project and studio, original current project and raw source remain archived" });
  } finally { await context.close(); }
}

async function verifyRepresentedBackups() {
  for (const variant of ["duplicate", "stroke-prefix"]) {
    const active = scene();
    const current = fixture(`recovery-${variant}`, [active]);
    const saved = variant === "duplicate" ? { ...active, motion: "still" }
      : scene(active.id, active.elements[0].points.slice(0, 2));
    const backup = { ...oldBackup(current), musicVideoScenes: [saved] };
    const { context, page } = await setup({ [DRAFT]: JSON.stringify(current), [`${DRAFT}:backup`]: JSON.stringify(backup) }, variant);
    try {
      await settleUi(page);
      assert.equal(await popup(page).count(), 0, `${variant} already represented in current drawings must not interrupt`);
      assert.deepEqual((await localDraft(page)).musicVideoScenes, current.musicVideoScenes);
      report.cases.push({ name: `${variant} backup already represented by active drawing is suppressed` });
    } finally { await context.close(); }
  }
}

async function verifyDamagedRecoveryRecord() {
  const current = fixture("recovery-damaged-current");
  const surviving = scene("intact-scene-inside-truncated-json");
  const raw = `{"title":"손상된 이전 작품","musicVideoScenes":[${JSON.stringify(surviving)},{"id":"incomplete`;
  const { context, page } = await setup({ [DRAFT]: JSON.stringify(current), [`${DRAFT}:recovery`]: raw }, "damaged");
  try {
    await popup(page).waitFor();
    assert.ok((await popup(page).textContent()).includes("기록에서 읽을 수 있는 장면만"));
    assert.equal(await popup(page).getByRole("button", { name: "그림 사본으로 복구", exact: true }).count(), 1);
    await popup(page).getByTestId("restore-lost-drawing").click();
    await page.getByTestId("scene-paint-canvas").waitFor();
    await popup(page).waitFor({ state: "hidden" });
    const restored = await localDraft(page);
    assert.notEqual(restored.projectId, current.projectId);
    assert.deepEqual(restored.musicVideoScenes, [surviving]);
    const originalMeasures = (await projects(page)).find((row) => row.id === current.projectId).draft.measures;
    assert.deepEqual(restored.measures, JSON.parse(JSON.stringify(originalMeasures)));
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), `${DRAFT}:recovery`), raw);
    assert.ok((await inbox(page)).some((entry) => entry.originals.some((original) => original.raw === raw)));
    await page.screenshot({ path: path.join(outputDir, "damaged-record-restored.png") });
    report.cases.push({ name: "intact drawing salvaged from truncated recovery JSON without inventing broken scene or changing original raw record" });
  } finally { await context.close(); }
}

async function verifyEmptyManualFinder() {
  const current = fixture("recovery-empty-finder");
  const { context, page } = await setup({ [DRAFT]: JSON.stringify(current) }, "empty");
  try {
    await settleUi(page);
    assert.equal(await popup(page).count(), 0);
    await page.getByTestId("account-library-button").click();
    await page.getByRole("button", { name: "사라진 그림 찾아보기", exact: true }).click();
    await page.getByRole("dialog", { name: "남아 있는 그림 기록 확인", exact: true }).waitFor();
    await page.getByRole("button", { name: "다시 찾기", exact: true }).waitFor();
    assert.equal(await page.getByTestId("restore-lost-drawing").count(), 0);
    assert.ok((await popup(page).textContent()).includes("복구 가능한 기록을 찾지 못했어요"));
    await page.screenshot({ path: path.join(outputDir, "empty-account-manual-search.png") });
    await popup(page).getByRole("button", { name: "확인", exact: true }).click();
    await settleUi(page);
    assert.equal(await popup(page).count(), 0);
    assert.equal((await localDraft(page)).projectId, current.projectId);
    report.cases.push({ name: "signed-out account manual finder shows honest empty result and never changes current composition" });
  } finally { await context.close(); }
}

async function verifyIntentionalNewProject() {
  const current = fixture("recovery-intentional-new", [scene()]);
  const { context, page } = await setup({ [DRAFT]: JSON.stringify(current) }, "intentional-new");
  try {
    await settleUi(page);
    assert.equal(await popup(page).count(), 0);
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.getByRole("menuitem", { name: "새로 시작하기", exact: true }).click()
    ]);
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
    await settleUi(page);
    assert.equal(await popup(page).count(), 0);
    assert.notEqual((await localDraft(page)).projectId, current.projectId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).waitFor();
    await settleUi(page);
    assert.equal(await popup(page).count(), 0, "Intentional new project must not report normally archived old drawings as lost after next reload");
    report.cases.push({ name: "intentional new project and subsequent reload preserve archive without false automatic lost-drawing offer" });
  } finally { await context.close(); }
}

try {
  if (process.env.APP_URL && process.env.VERIFY_BUILD_HASHES !== "0") await verifyBuildHashes();
  await verifyOneAutomaticOffer("close-button");
  await verifyOneAutomaticOffer("escape");
  await verifyDismissAndManualReopen();
  await verifyIndependentRestore();
  await verifyRepresentedBackups();
  await verifyDamagedRecoveryRecord();
  await verifyEmptyManualFinder();
  await verifyIntentionalNewProject();
  assert.deepEqual(report.errors, [], "Recovery must not cause an uncaught application error");
  assert.equal(report.blockedCloudRequests, 0, "These isolated browser checks must never access real cloud projects");
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
console.log(JSON.stringify(report, null, 2));
