import { chromium } from "playwright-core";
import path from "node:path";

const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await chromium.launch({ executablePath: edgePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

try {
  await page.goto("http://127.0.0.1:4175/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  
  // Click "추천으로 모두 채우기"
  await page.getByTestId("fill-recommended").click();
  await page.waitForTimeout(500);
  
  // Click "다음 마디로" 7 times or more until finish-composition is visible
  let nextBtn = page.getByTestId("next-measure");
  while (await nextBtn.isVisible()) {
    await nextBtn.click();
    await page.waitForTimeout(150);
  }
  
  // Click "완성" (finish-composition)
  await page.getByTestId("finish-composition").click();
  await page.waitForTimeout(1000);
  
  // Scroll to the lyrics grid where the compact measures are displayed
  await page.locator('.lyrics-grid').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  
  const outputPath = path.resolve("C:/Users/user/.gemini/antigravity/brain/c56bb804-b9d5-4c1b-b167-b0ec44b68f17/app_screenshot.png");
  await page.screenshot({ path: outputPath });
  console.log("Screenshot saved to:", outputPath);
} catch (error) {
  console.error("Error taking screenshot:", error);
} finally {
  await browser.close();
}
