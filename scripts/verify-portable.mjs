import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { chromium } from "playwright-core";
import { loadEnv } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verification = path.join(root, "tmp", "portable-verification", randomUUID());
const relocated = path.join(verification, "제출 테스트 & 이동");
const packageDirectory = path.join(relocated, "maeum-melody-portable");
await mkdir(relocated, { recursive: true });

const archive = unzipSync(await readFile(path.join(root, "artifacts", "maeum-melody-portable.zip")));
for (const [relative, bytes] of Object.entries(archive)) {
  const absolute = path.resolve(relocated, relative);
  assert(absolute.startsWith(relocated + path.sep), "ZIP path must remain inside extraction directory");
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
}
const manifest = JSON.parse(await readFile(path.join(packageDirectory, "package.generated.json"), "utf8"));
for (const [relative, expected] of Object.entries(manifest.checksums)) {
  const bytes = await readFile(path.join(packageDirectory, relative));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, `ZIP checksum: ${relative}`);
}
assert(!Object.keys(archive).some((name) => /(?:\.env|node_modules|\.git\/)/.test(name)));

const executablePath = process.env.PORTABLE_BROWSER_PATH ??
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await chromium.launch({ executablePath, headless: true });
const report = { extractedDirectory: packageDirectory, checksummedFiles: Object.keys(manifest.checksums).length };
let server;

function shellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function waitForServer(statusFile) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const status = JSON.parse(await readFile(statusFile, "utf8"));
      assert(!status.error, status.error);
      return status;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Packaged local server did not start");
}

async function verifyFileMode() {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  let interceptedWrites = 0;
  // PDF export normally stores a QR record. Exercise its embedded-QR fallback
  // without creating verification records in the existing production database.
  await context.route("**/firestore.googleapis.com/**", async (route) => {
    const request = route.request();
    if (!/\/Write\/channel|:commit|:batchWrite/.test(request.url())) {
      await route.continue();
      return;
    }
    const headers = {
      "access-control-allow-origin": request.headers().origin ?? "null",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-goog-api-client"
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    interceptedWrites += 1;
    if (new URL(request.url()).searchParams.get("TYPE") === "terminate") {
      await route.fulfill({ status: 200, headers, body: "" });
      return;
    }
    const frame = JSON.stringify([
      [0, ["c", "portable-verification", "", 8, 12, 30000]],
      [1, [{ streamToken: "portable-test-token", streamId: "portable-test-stream" }]],
      [2, [{ error: { status: "PERMISSION_DENIED", message: "Writes disabled in portable verification." } }]]
    ]);
    await route.fulfill({ status: 200, headers, contentType: "application/json",
      body: `${Buffer.byteLength(frame)}\n${frame}` });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(`File browser error: ${error.message}`);
  });
  page.on("dialog", (dialog) => dialog.accept());
  const entry = pathToFileURL(path.join(packageDirectory, "index.html")).href;
  await page.goto(entry, { waitUntil: "load" });
  await page.getByRole("button", { name: "시작하기", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".opening-visual img")?.naturalWidth > 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const image = document.querySelector(".opening-visual img");
    return image?.naturalWidth > 0 && image.currentSrc.startsWith("data:");
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  console.log("File app opening screen and relocated image paths passed.");
  await page.screenshot({ path: path.join(verification, "portable-after-start.png"), fullPage: true });
  const measures = page.locator('.measure-timeline button[data-testid^="measure-"]');
  await measures.first().waitFor();
  const measureCount = await measures.count();
  for (let index = 1; index <= measureCount; index += 1) {
    await page.getByTestId(`measure-${index}`).click();
    await page.locator("button.select-row").first().click();
  }
  await page.getByTestId("finish-composition").click();
  await page.getByTestId("song-title").fill("압축 해제 실행 검증");
  await page.getByTestId("creator-name").fill("배포 확인");
  await page.waitForFunction(() => [...document.images].filter((image) => image.src.startsWith("data:"))
    .every((image) => image.complete && image.naturalWidth > 0));

  report.fileMode = await page.evaluate(async () => {
    const assets = globalThis.__MAEUM_PORTABLE_ASSETS__;
    const audio = new AudioContext();
    const samples = Object.entries(assets).filter(([url]) => url.startsWith("/beat-samples/") ||
      url === "/sound-effects/cc0/bell_01.ogg");
    for (const [url, data] of samples) {
      const response = await fetch(data);
      if (!response.ok) throw new Error(`Sample fetch failed: ${url}`);
      const decoded = await audio.decodeAudioData(await response.arrayBuffer());
      if (decoded.duration <= 0) throw new Error(`Sample decode failed: ${url}`);
    }
    await audio.close();
    return {
      protocol: location.protocol,
      origin: location.origin,
      embeddedAssets: Object.keys(assets).length,
      decodedSamples: samples.length,
      moduleScripts: document.querySelectorAll('script[type="module"]').length,
      secureContext: window.isSecureContext,
      microphoneAvailable: Boolean(navigator.mediaDevices?.getUserMedia)
    };
  });
  assert.equal(report.fileMode.protocol, "file:");
  assert.equal(report.fileMode.moduleScripts, 0);
  await page.getByTestId("play-arranged").click();
  await page.getByTestId("stop-arranged-playback").waitFor();
  await page.getByTestId("stop-arranged-playback").click();
  report.fileMode.instrumentPlaybackStarted = true;
  console.log("File composition, embedded audio and online instrument playback passed.");

  await page.getByTestId("create-mobile-recording-link").click();
  const shareUrl = await page.getByTestId("share-url").inputValue();
  assert(shareUrl.startsWith("https://maeum-melody.vercel.app/?record=1#song="),
    `Invalid portable share URL prefix: ${shareUrl.split("#")[0]}`);
  report.fileMode.sharedUrlUsesOnlineApp = true;

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("save-project-file").click();
  const download = await downloadPromise;
  const savedProject = path.join(verification, "portable-project.txt");
  await download.saveAs(savedProject);
  const projectText = await readFile(savedProject, "utf8");
  assert(projectText.includes("압축 해제 실행 검증"));
  await page.locator("input.project-file-input").setInputFiles(savedProject);
  await page.getByTestId("song-title").waitFor();
  assert.equal(await page.getByTestId("song-title").inputValue(), "압축 해제 실행 검증");
  report.fileMode.projectRoundTrip = true;

  const pdfPromise = page.waitForEvent("download", { timeout: 60000 });
  await page.getByTestId("export-pdf").click();
  const pdf = await pdfPromise;
  const savedPdf = path.join(verification, "portable-score.pdf");
  await pdf.saveAs(savedPdf);
  const pdfBytes = await readFile(savedPdf);
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  report.fileMode.pdfBytes = pdfBytes.length;
  assert(interceptedWrites > 0, "PDF QR storage must be intercepted before reaching the database");
  report.fileMode.databaseWritesIntercepted = interceptedWrites;

  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByText("Google 로그인은 작품 파일을 저장한 뒤", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Google로 계속하기" }).count(), 0);
  report.fileMode.googleLauncherGuidance = true;

  const environment = loadEnv("production", root, "VITE_");
  const databaseUrl = `https://firestore.googleapis.com/v1/projects/${environment.VITE_FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/communityAlbums?pageSize=1&key=${environment.VITE_FIREBASE_API_KEY}`;
  report.fileMode.databaseReadStatus = await page.evaluate(async (url) => (await fetch(url)).status, databaseUrl);
  assert.equal(report.fileMode.databaseReadStatus, 200);
  assert.deepEqual(errors, [], "The file build must not throw browser errors");
  await page.screenshot({ path: path.join(verification, "portable-file.png"), fullPage: false });
  await context.close();
}

async function verifyLocalMode() {
  const statusFile = path.join(verification, "server-status.json");
  const script = path.join(packageDirectory, "start-local.ps1");
  const command = `& ${shellLiteral(script)} -ServerOnly -PackageRoot ${shellLiteral(packageDirectory)}` +
    ` -StatusPath ${shellLiteral(statusFile)} -ParentProcessId ${process.pid}`;
  server = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand",
    Buffer.from(command, "utf16le").toString("base64")], { windowsHide: true, stdio: "ignore" });
  const { port } = await waitForServer(statusFile);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
  await page.getByRole("button", { name: "시작하기", exact: true }).click();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: "Google로 계속하기" }).waitFor();
  report.localMode = { origin: await page.evaluate(() => location.origin), googleLoginAvailable: true };
  assert.deepEqual(errors, [], "The local server build must not throw browser errors");
  await context.close();
}

try {
  await verifyFileMode();
  await verifyLocalMode();
  await writeFile(path.join(verification, "result.generated.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify(report));
  throw error;
} finally {
  server?.kill();
  await browser.close();
}
