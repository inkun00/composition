import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const outputDirectory = path.resolve("tmp/pdf-downloads");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ executablePath: edgePath, headless: true });
const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });

try {
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.getByTestId("fill-recommended").click();
  await page.getByTestId("measure-8").click();
  await page.getByTestId("finish-composition").click();
  await page.getByTestId("song-title").fill("햇살 산책 검증곡");
  await page.getByTestId("creator-name").fill("새봄");
  await page.getByTestId("lyric-1").fill("햇살 따라 걸어가요");

  const pages = await page.locator("[data-pdf-page]").count();
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("export-pdf").click();
  const download = await downloadPromise;
  const outputPath = path.join(outputDirectory, download.suggestedFilename());
  await download.saveAs(outputPath);

  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.getByTestId("length-16").click();
  await page.getByTestId("fill-recommended").click();
  await page.getByTestId("measure-16").click();
  await page.getByTestId("finish-composition").click();
  const pagesForSixteenMeasures = await page.locator("[data-pdf-page]").count();

  console.log(JSON.stringify({ pages, pagesForSixteenMeasures, outputPath }));
} finally {
  await browser.close();
}
