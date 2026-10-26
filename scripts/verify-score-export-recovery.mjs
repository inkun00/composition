import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";
import LZString from "lz-string";

// Run the production bundle in isolated browser contexts with synthetic scores.
// Only the optional QR short-link module is replaced to make its ordinary
// network failure immediate. The score renderer, PDF libraries, draft stores,
// recovery dialog and reload remain real. Cloud/auth requests are all blocked.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/score-export-recovery");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const KEY = "maeum-melody:draft:v1";
const report = { startedAt: new Date().toISOString(), baseUrl, isolatedContexts: true,
  syntheticDataOnly: true, productionDataAccess: false, cloudRequestsBlocked: 0,
  qrShortLinkFixture: "ordinary-error-only; actual embedded QR and PDF export",
  stage: "initializing", cases: [], expectedModuleFailures: [], pageErrors: [] };
let activePage;

function fixture(label) {
  const words = Array.from({ length: label === "normal" ? 8 : 16 }, () => "우리");
  return { version: 1, updatedAt: Date.now() - 1000, projectId: `pdf-recovery-${label}`,
    sourceHash: "", title: "악보 오류 복구 검증", creator: "검증용 작곡가", originalCreator: "",
    presetId: "H001", songLength: words.length, meter: { beats: 4, beatUnit: 4 }, bpm: 120,
    instrumentId: "piano", accompanimentStyleId: "arpeggio", accompanimentInstrumentIds: ["piano"],
    lyrics: words, showArrangement: true,
    measures: words.map((word, index) => ({ candidateId: "custom", candidateName: "PDF 검증 가락",
      chords: [index % 2 ? "F" : "C"], notes: Array.from(word, (lyric, note) => ({
        id: `n${index}${note}`, pitch: [60, 64][note], lyric,
        duration: { numerator: 2, denominator: 1 }
      })) })),
    musicVideoScenes: [{ id: "pdf-test-drawing", background: "#ffffff", motion: "float",
      endLyric: null, endMeasureIndex: words.length - 1, elements: [{ id: "pdf-test-drawing-stroke", tool: "rectangle",
        color: "#4285f4", width: 8, points: [[180, 160, .5], [420, 360, .8]] }] }]
  };
}

async function setup(label, failedModule) {
  const draft = fixture(label);
  const mode = { fail: failedModule, attempted: [] };
  const viewport = label.endsWith("mobile") ? { width: 375, height: 812 } : { width: 1440, height: 1000 };
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.route(/https:\/\/(?:firestore|identitytoolkit|securetoken)\.googleapis\.com\//, async (route) => {
    report.cloudRequestsBlocked++;
    await route.abort("blockedbyclient");
  });
  await context.route("**/assets/*", async (route) => {
    const url = route.request().url();
    const file = new URL(url).pathname.split("/").at(-1);
    const match = mode.fail === "jspdf" ? /^jspdf.*\.js$/.test(file) :
      mode.fail === "qrSongs" ? /^qrSongs.*\.js$/.test(file) :
      mode.fail === "css" ? /^index-.*\.css$/.test(file) : false;
    if (match) {
      mode.attempted.push(file);
      report.expectedModuleFailures.push({ label, file });
      return route.fulfill({ status: 404, contentType: "text/plain", body: "Synthetic removed deployment chunk" });
    }
    if (/^qrSongs.*\.js$/.test(file)) {
      return route.fulfill({ contentType: "text/javascript", body:
        'export async function saveQrSong(){throw new Error("synthetic-qr-network-offline");}' +
        'export async function loadQrSong(){return null;}' });
    }
    await route.continue();
  });
  await context.addInitScript(({ key, draft }) => {
    if (sessionStorage.getItem("score-export-seeded")) return;
    localStorage.setItem(key, JSON.stringify(draft));
    sessionStorage.setItem("score-export-seeded", "1");
  }, { key: KEY, draft });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(25_000);
  page.on("pageerror", (error) => report.pageErrors.push({ label, message: error.message }));
  await page.goto(`${baseUrl}?start=new`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("export-pdf").waitFor();
  await page.getByTestId("export-pdf").scrollIntoViewIfNeeded();
  assert.equal(await page.getByTestId("lost-drawing-recovery-dialog").count(), 0);
  return { context, page, draft, mode };
}

async function savedDraft(page) {
  const raw = await page.evaluate((key) => localStorage.getItem(key), KEY);
  assert.ok(raw, "The browser project checkpoint must be present");
  return JSON.parse(raw.startsWith("lz16:") ? LZString.decompressFromUTF16(raw.slice(5)) : raw);
}

async function waitSaved(page, expectedTitle) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const saved = await savedDraft(page);
    if (saved.title === expectedTitle) return saved;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.fail(`Expected latest project title to be saved: ${expectedTitle}`);
}

async function exportPdf(page, label, accompaniment = false) {
  const event = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByTestId(accompaniment ? "export-pdf-with-accompaniment" : "export-pdf").click();
  const download = await event;
  const filePath = path.join(outputDir, `${label}.pdf`);
  await download.saveAs(filePath);
  assert.equal(await download.failure(), null);
  const bytes = await readFile(filePath);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const pageCount = [...bytes.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].length;
  assert.equal(pageCount, Math.ceil((await savedDraft(page)).songLength / (accompaniment ? 8 : 16)));
  assert.ok(bytes.length > 20_000, "The downloaded PDF must contain rendered score image data");
  assert.ok(bytes.toString("latin1").includes("/Subtype /Image"));
  const first = page.locator("[data-pdf-page]").first();
  const qr = first.getByLabel("악보 노래 재생 QR 코드", { exact: true }).first();
  assert.equal(await first.locator("h1").innerText(), (await savedDraft(page)).title);
  assert.ok(await qr.locator("svg path").count() > 0, "The rendered sheet must include actual QR modules");
  assert.equal(await page.getByTestId("score-export-recovery").count(), 0);
  await page.getByTestId("export-pdf").waitFor({ state: "visible" });
  assert.equal(await page.getByTestId("export-pdf").isEnabled(), true);
  return { filePath, fileName: download.suggestedFilename(), bytes: bytes.length, pageCount };
}

function renderPdf(filePath, label) {
  const prefix = path.join(outputDir, label);
  const runtime = path.join(process.env.USERPROFILE || "C:/Users/user", ".cache/codex-runtimes",
    "codex-primary-runtime/dependencies/native/poppler/Library/bin");
  execFileSync(process.env.PDFTOPPM_PATH || path.join(runtime, "pdftoppm.exe"),
    ["-f", "1", "-singlefile", "-r", "220", "-png", filePath, prefix], { timeout: 30_000 });
  const info = execFileSync(process.env.PDFINFO_PATH || path.join(runtime, "pdfinfo.exe"),
    [filePath], { encoding: "utf8", timeout: 10_000 });
  assert.ok(/Page size:\s+595\.28 x 841\.89 pts \(A4\)/.test(info));
  const python = ["import cv2,json,sys", "im=cv2.imread(sys.argv[1])",
    "height,width=im.shape[:2]", "crop=im[:int(height*.25),int(width*.70):]",
    "gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)",
    "_,binary=cv2.threshold(gray,170,255,cv2.THRESH_BINARY_INV)",
    "contours,_=cv2.findContours(binary,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)",
    "rects=[cv2.boundingRect(c) for c in contours]",
    "x,y,w,h=max((r for r in rects if .9<r[2]/r[3]<1.1),key=lambda r:r[2]*r[3])",
    // Remove the decorative border that surrounds the QR quiet zone; it is not
    // QR data and can confuse OpenCV's finder pattern detector.
    "qr=crop[y+4:y+h-4,x+4:x+w-4]",
    "qr=cv2.copyMakeBorder(qr,30,30,30,30,cv2.BORDER_CONSTANT,value=(255,255,255))",
    "qr=cv2.resize(qr,None,fx=3,fy=3,interpolation=cv2.INTER_NEAREST)",
    "value,points,_=cv2.QRCodeDetector().detectAndDecode(qr)",
    "print(json.dumps({'url':value,'detected':points is not None,'width':width,'height':height}))"].join("\n");
  const qr = JSON.parse(execFileSync(process.env.PYTHON_PATH || "python", ["-c", python, `${prefix}.png`],
    { encoding: "utf8", timeout: 30_000 }));
  assert.ok(qr.detected && qr.url.includes("?play=qr#song="), "The actual downloaded PDF QR must decode");
  return { image: `${prefix}.png`, pdfinfo: info, ...qr };
}

async function blockAllProjectWrites(page) {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    const transaction = IDBDatabase.prototype.transaction;
    Storage.prototype.setItem = function () {
      throw new DOMException("Synthetic browser storage full", "QuotaExceededError");
    };
    IDBDatabase.prototype.transaction = function (names, mode, ...rest) {
      if (mode === "readwrite") throw new DOMException("Synthetic IndexedDB quota full", "QuotaExceededError");
      return transaction.call(this, names, mode, ...rest);
    };
    window.__restoreScoreExportStores = () => {
      Storage.prototype.setItem = setItem;
      IDBDatabase.prototype.transaction = transaction;
    };
  });
}

async function verifyRecovery(label, module, failSaveFirst = false) {
  report.stage = label;
  const { context, page, draft, mode } = await setup(label, module);
  let title = `최신 작업 보존 ${label}`;
  await page.getByTestId("song-title").fill(title);
  await waitSaved(page, title);
  await page.getByTestId("export-pdf").click();
  const dialog = page.getByTestId("score-export-recovery");
  await dialog.waitFor();
  assert.ok(mode.attempted.length > 0, `Missing ${module} must actually be requested`);
  assert.equal(await page.getByTestId("export-pdf").isEnabled(), true, "A failed export must release its busy lock");
  const beforeReload = await savedDraft(page);
  assert.equal(beforeReload.title, title);
  assert.deepEqual(beforeReload.musicVideoScenes, draft.musicVideoScenes);
  await dialog.screenshot({ path: path.join(outputDir, `${label}-dialog.png`) });
  const bounds = await dialog.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width + 1);
  assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height + 1);
  if (failSaveFirst) {
    await blockAllProjectWrites(page);
    // An unchanged draft is already durable, so a write failure may safely
    // return true. Create genuinely unsaved work after both stores fail.
    await dialog.getByRole("button", { name: "악보 오류 안내 닫기", exact: true }).click();
    title += " 미저장";
    await page.getByTestId("song-title").fill(title);
    assert.notEqual((await savedDraft(page)).title, title);
    await page.getByTestId("export-pdf").click();
    await dialog.waitFor();
    let navigations = 0;
    const onNavigation = (frame) => { if (frame === page.mainFrame()) navigations++; };
    page.on("framenavigated", onNavigation);
    await dialog.getByTestId("score-export-refresh").click();
    await dialog.getByRole("alert").filter({ hasText: /저장|공간/ }).waitFor();
    await page.waitForTimeout(250);
    assert.equal(navigations, 0, "Failed project persistence must prevent a destructive reload");
    assert.equal(await dialog.isVisible(), true);
    await page.screenshot({ path: path.join(outputDir, `${label}-save-blocked.png`), fullPage: true });
    page.off("framenavigated", onNavigation);
    await page.evaluate(() => window.__restoreScoreExportStores());
  }
  mode.fail = null;
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    dialog.getByTestId("score-export-refresh").click()
  ]);
  await page.getByTestId("export-pdf").waitFor();
  assert.equal(await page.getByTestId("score-export-recovery").count(), 0);
  assert.equal(await page.getByTestId("song-title").inputValue(), title);
  const restored = await savedDraft(page);
  assert.equal(restored.projectId, draft.projectId);
  assert.equal(restored.title, title);
  assert.deepEqual(restored.musicVideoScenes, draft.musicVideoScenes);
  const pdf = await exportPdf(page, `${label}-retry`, failSaveFirst);
  report.cases.push({ name: label, missingModule: module, failureDetected: true,
    busyReleased: true, persistedTitle: title, syntheticDrawingPreserved: true,
    saveFailureBlocksReload: failSaveFirst || undefined, reloadRestored: true, actualRetryPdf: pdf });
  await context.close();
}

try {
  const html = await (await fetch(baseUrl, { cache: "no-store" })).text();
  report.buildEntry = /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
  assert.ok(report.buildEntry, "The real built application entry must be identified");
  report.stage = "normal-pdf-and-embedded-qr";
  const { context, page, draft } = await setup("normal", null);
  const pdf = await exportPdf(page, "normal-score");
  const rendered = renderPdf(pdf.filePath, "normal-score-page1");
  const qrContext = await browser.newContext();
  await qrContext.route(/https:\/\/(?:firestore|identitytoolkit|securetoken)\.googleapis\.com\//,
    (route) => route.abort("blockedbyclient"));
  const qrPage = await qrContext.newPage();
  const decodedLocal = new URL(baseUrl);
  const decoded = new URL(rendered.url);
  decodedLocal.search = decoded.search;
  decodedLocal.hash = decoded.hash;
  await qrPage.goto(decodedLocal.href, { waitUntil: "domcontentloaded" });
  await qrPage.getByText(draft.title, { exact: true }).first().waitFor();
  await qrPage.screenshot({ path: path.join(outputDir, "decoded-pdf-qr-playback.png"), fullPage: true });
  await qrContext.close();
  const accompaniment = await exportPdf(page, "normal-accompaniment", true);
  report.cases.push({ name: "normal real PDF exports and embedded QR offline fallback",
    melody: pdf, accompaniment, actualDownloadedQrDecodes: true, decodedSongTitle: draft.title,
    qrUrlLength: rendered.url.length, renderedImage: rendered.image, pdfinfo: rendered.pdfinfo });
  await context.close();
  if (!process.env.ONLY_NORMAL) {
    await verifyRecovery("missing-jspdf", "jspdf");
    await verifyRecovery("missing-qr-and-storage-failure", "qrSongs", true);
    await verifyRecovery("missing-jspdf-mobile", "jspdf");
  }
  const unexpected = report.pageErrors.filter(({ message }) =>
    !/dynamically imported module|module script|preload|synthetic-/i.test(message));
  assert.deepEqual(unexpected, []);
  report.result = "passed";
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  await activePage?.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await server?.close();
}
