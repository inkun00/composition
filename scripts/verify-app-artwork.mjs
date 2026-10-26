import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";

// Build after all generated assets are saved. No product APIs are replaced;
// APP_URL and OUTPUT_DIR support the identical focused production inspection.
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/app-generated-artwork");
await mkdir(outputDir, { recursive: true });
const server = process.env.APP_URL ? null : await preview({ preview: { host: "127.0.0.1", port: 0 } });
const baseUrl = process.env.APP_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const report = { startedAt: new Date().toISOString(), baseUrl, errors: [], brokenResponses: [], layouts: [] };
const originalChildren = {
  desktop: "/illustrations/opening-studio-desktop-v2.webp",
  mobile: "/illustrations/opening-studio-mobile-v1.webp",
  rhythm: "/illustrations/character-rhythm-shaker-girl-v1.webp",
  "rhythm-melody": "/illustrations/backing-export-mixing-girl-v2.webp",
  melody: "/illustrations/character-instrument-keyboard-boy-v1.webp",
  setup: "/illustrations/guide-boy-v1.webp",
  tip: "/illustrations/character-music-tip-recorder-boy-v1.webp",
  sound: "/illustrations/character-sound-preview-girl-v1.webp",
  recording: "/illustrations/character-recording-singer-girl-v1.webp",
  complete: "/illustrations/character-song-complete-boy-v1.webp",
  exportKeyboard: "/illustrations/backing-export-keyboard-boy-v2.webp",
  exportRhythm: "/illustrations/backing-export-percussion-girl-v2.webp"
};
let page;

async function verifyOriginalChildrenAssets() {
  return Promise.all(Object.values(originalChildren).map(async (assetPath) => {
    const response = await page.request.get(new URL(assetPath, baseUrl).href);
    assert.equal(response.status(), 200, `Original children image must be deployed: ${assetPath}`);
    assert.match(response.headers()["content-type"] || "", /image\/webp/);
    const bytes = await response.body();
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    const dimensions = await page.evaluate(async (assetPath) => {
      const image = new Image();
      image.src = assetPath;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, assetPath);
    assert.ok(dimensions.width > 0 && dimensions.height > 0, `Original children image must decode: ${assetPath}`);
    return { path: assetPath, bytes: bytes.length, ...dimensions };
  }));
}

async function assertOriginalChildren(name, width) {
  const composerScreens = {
    "composer-settings": [],
    "composer-main": [],
    "composer-saving": [
      [".publish-details-intro > img[data-composer-child='recording']", originalChildren.recording],
      [".publish-section .composition-file-exports > img[data-composer-child='complete']", originalChildren.complete]
    ],
    "recording-guide": [[".recording-guide-dialog img[data-composer-child='recording']", originalChildren.recording]],
    "sound-effect-dialog": [[".measure-sound-dialog img[data-composer-child='sound']", originalChildren.sound]]
  };
  const expected = name === "opening" ? [[".opening-visual img", width <= 700 ? originalChildren.mobile : originalChildren.desktop]]
    : name === "mode-chooser" ? [
      [".practice-mode-hero-art", originalChildren.desktop],
      ...["rhythm", "rhythm-melody", "melody"].map((mode) => [
        `.practice-mode-choice.is-${mode} .practice-mode-character`, originalChildren[mode]
      ])
    ] : composerScreens[name] || [];
  if (name === "composer-main")
    assert.equal(await page.locator(".candidate-sidebar img[data-composer-child='keyboard']").count(), 0,
      "The melody candidate panel must keep its controls without the removed character");
  if (name === "composer-settings")
    assert.equal(await page.locator(
      ".composer-settings :is(.preset-chooser,.song-mood-setup,.meter-chooser) img[data-composer-child]"
    ).count(), 0, "The three simplified song settings cards must not contain child illustrations");
  if (name === "composer-saving")
    assert.equal(await page.locator(".accompaniment-style-with-guide img[data-composer-child]").count(), 0,
      "The accompaniment controls must not retain the removed yellow child");
  const states = [];
  for (const [selector, assetPath] of expected) {
    const image = page.locator(selector);
    assert.equal(await image.count(), 1, `Original children image must appear once: ${selector}`);
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(({ selector, assetPath }) => {
      const image = document.querySelector(selector);
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
        && new URL(image.currentSrc).pathname === assetPath;
    }, { selector, assetPath });
    const state = await image.evaluate(async (image) => {
      await image.decode();
      const box = image.getBoundingClientRect();
      return { path: new URL(image.currentSrc).pathname, width: image.naturalWidth, height: image.naturalHeight,
        renderedWidth: box.width, renderedHeight: box.height,
        decorative: image.hasAttribute("alt") && image.alt === "" && Boolean(image.closest('[aria-hidden="true"]')) };
    });
    assert.equal(state.path, assetPath);
    assert.ok(state.decorative, `Restored children image must remain decorative: ${selector}`);
    assert.ok(state.renderedWidth > 0 && state.renderedHeight > 0, `Restored children image must occupy its original UI: ${selector}`);
    states.push(state);
  }
  return states;
}

async function verifyConditionalChildrenSource() {
  const [app, exportDialog, soundEditor, childArtwork] = await Promise.all([
    readFile("src/App.tsx", "utf8"), readFile("src/components/CompositionMediaExportDialog.tsx", "utf8"),
    readFile("src/components/SoundEffectEditor.tsx", "utf8"), readFile("src/components/ComposerChildArtwork.tsx", "utf8")
  ]);
  assert.match(app, /\{completionCelebration\s*&&\s*\([\s\S]{0,300}<ComposerChildArtwork\s+kind="complete"/);
  for (const kind of ["exportKeyboard", "exportRhythm", "exportMix"])
    assert.ok(exportDialog.includes(`<ComposerChildArtwork kind="${kind}"`), `Export dialog must preserve ${kind}`);
  assert.match(soundEditor, /!compact\s*&&[\s\S]{0,300}<ComposerChildArtwork\s+kind="sound"/);
  const kinds = { setup: "setup", rhythm: "rhythm", keyboard: "melody", tip: "tip", sound: "sound",
    recording: "recording", complete: "complete", exportKeyboard: "exportKeyboard", exportRhythm: "exportRhythm",
    exportMix: "rhythm-melody" };
  for (const [kind, original] of Object.entries(kinds)) {
    const filename = path.posix.basename(originalChildren[original], ".webp");
    assert.ok(childArtwork.includes(`${kind}: "${filename}"`), `Composer child must use its original path: ${kind}`);
  }
  return { completionBanner: true, threeExportCharacters: true, soundOnlyOutsideCompact: true,
    originalCharacterMapping: true, sourceInspectionOnly: true, mediaEncodingStarted: false };
}

async function verifyAssets() {
  const registry = await readFile("src/components/AppArtwork.tsx", "utf8");
  const declaration = registry.match(/APP_IMAGE_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  assert.ok(declaration);
  const names = [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(names.length, 49);
  const studio = (await readdir("public/studio-images/v1")).filter((file) => file.endsWith(".webp")).sort();
  assert.equal(studio.length, 57);
  const assets = [...names.map((name) => ({ name, path: `/app-images/v1/${name}.webp` })),
    ...studio.map((file) => ({ name: path.basename(file, ".webp"), path: `/studio-images/v1/${file}` }))];
  const files = await Promise.all(assets.map(async (asset) => {
    const response = await page.request.get(new URL(asset.path, baseUrl).href);
    assert.equal(response.status(), 200, `${asset.path} must be deployed`);
    assert.match(response.headers()["content-type"] || "", /image\/webp/);
    const bytes = await response.body();
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    return { ...asset, bytes: bytes.length };
  }));
  const decoded = await page.evaluate(async (assets) => Promise.all(assets.map(async (asset) => {
    const image = new Image();
    image.src = asset.path;
    await image.decode();
    if (!image.naturalWidth) throw new Error(`Broken generated artwork ${asset.path}`);
    return { ...asset, width: image.naturalWidth, height: image.naturalHeight };
  })), assets);
  return { files, decoded, count: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) };
}

async function assertImages(scope) {
  const images = await scope.locator("img[data-app-artwork]").evaluateAll(async (images) => Promise.all(images.map(async (image) => {
    await image.decode();
    if (!image.naturalWidth) throw new Error(`Broken UI artwork ${image.src}`);
    const box = image.getBoundingClientRect();
    return { name: image.dataset.appArtwork, decorative: image.alt === "" && image.getAttribute("aria-hidden") === "true",
      width: box.width, height: box.height };
  })));
  assert.ok(images.length > 0);
  assert.ok(images.every((image) => image.decorative), "Generated decoration must preserve concise accessible button names");
  assert.equal(await scope.locator("svg.lucide").count(), 0);
  return images;
}

async function snapshots(name, selector, focusSelector = selector) {
  for (const [width, height] of [[1440, 900], [375, 667]]) {
    await page.setViewportSize({ width, height });
    const scope = page.locator(selector);
    await page.locator(focusSelector).scrollIntoViewIfNeeded();
    const scroll = await scope.evaluate((element) => ({ top: element.scrollTop, left: element.scrollLeft }));
    const images = await assertImages(scope);
    const childrenImages = await assertOriginalChildren(name, width);
    await scope.evaluate((element, scroll) => {
      element.scrollTop = scroll.top;
      element.scrollLeft = scroll.left;
    }, scroll);
    await page.locator(focusSelector).scrollIntoViewIfNeeded();
    const geometry = await scope.evaluate((element) => ({ documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth, scopeWidth: element.clientWidth, scopeContentWidth: element.scrollWidth,
      dataScoreSvgs: element.querySelectorAll("svg.score,.vex-score-layer svg").length,
      overflowElements: document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll(
        ".topbar,main,.composition-workspace,.composition-section,.score-workspace-column,.candidate-sidebar,.publish-section,.note-tools,.practice-main")]
        .map((node) => ({ className: node.className, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
          width: node.getBoundingClientRect().width, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
          overflowX: getComputedStyle(node).overflowX })).filter((box) => box.right > innerWidth + 1) }));
    await page.screenshot({ path: path.join(outputDir, `${name}-${width}.png`) });
    report.layouts.push({ name, width, height, ...geometry, images, childrenImages });
  }
}

async function check44(button) {
  if (!await button.isDisabled()) await button.click({ trial: true });
  const box = await button.boundingBox();
  assert.ok(box && box.width >= 43.9 && box.height >= 43.9, `Touch target must be 44px: ${await button.innerText()}`);
}

async function assertProjectFileToolsRemoved() {
  assert.equal(await page.getByTestId("save-project-file").count(), 0);
  assert.equal(await page.getByTestId("load-project-file").count(), 0);
  assert.equal(await page.locator("input.project-file-input,.publish-advanced-files").count(), 0);
  assert.equal(await page.getByRole("button", { name: /작품 파일 (저장|불러오기)/ }).count(), 0);
  assert.equal(await page.getByText("나중에 고칠 작품 파일", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("menuitem", { name: "악보 불러오기", exact: true }).count(), 0);
}

async function seedComposition() {
  await page.evaluate(() => {
    const words = ["나의노래", "우리그림", "함께불러", "리듬따라", "반짝이는", "작은마음", "노래만들", "다시만나"];
    const measures = words.map((word, index) => ({ candidateId: "custom", candidateName: "이미지 UI 검증", chords: [index % 2 ? "F" : "C"],
      notes: Array.from(word, (lyric, note) => ({ id: `app-art-${index}-${note}`, pitch: 60 + note * 2, lyric,
        duration: { numerator: 1, denominator: 1 } })) }));
    localStorage.setItem("maeum-melody:draft:v1", JSON.stringify({ version: 1, updatedAt: Date.now(), sourceHash: "",
      title: "그림으로 만나는 음악 놀이터", creator: "새로운 작곡가", originalCreator: "", presetId: "H001", songLength: 8,
      meter: { beats: 4, beatUnit: 4 }, bpm: 96, instrumentId: "piano", accompanimentStyleId: "arpeggio",
      accompanimentInstrumentIds: ["piano"], lyrics: words, measures, showArrangement: true }));
  });
  await page.goto(`${baseUrl}?start=new`);
}

async function verifyPractice() {
  await page.getByRole("button", { name: /리듬·가락 직접 만들기/ }).click();
  const chooser = page.getByRole("dialog", { name: "어떻게 만들까요?", exact: true });
  await chooser.waitFor();
  await snapshots("mode-chooser", ".practice-mode-chooser");
  for (const label of ["리듬만들기", "리듬만들고 가락넣기", "가락만들기"])
    await check44(chooser.getByRole("button", { name: label, exact: true }));
  await check44(chooser.getByRole("button", { name: "모드 선택 창 닫기", exact: true }));
  await chooser.getByRole("button", { name: "가락만들기", exact: true }).click();
  assert.equal(await chooser.count(), 0);
  const duration = page.getByTestId("practice-duration-1").first();
  await duration.click();
  assert.equal(await duration.getAttribute("aria-pressed"), "true");
  const emptyCell = page.getByTestId("practice-melody-empty-60-0").first();
  await emptyCell.click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody-practice-v1"))?.measures[0].notes.length > 0);
  await snapshots("practice-editing", ".practice-shell", ".practice-score-workspace");
  await page.getByRole("button", { name: "악보에 넣기", exact: true }).first().click();
  assert.ok(await page.locator(".practice-shell svg.score").count(), "Editable music must retain its data SVG");
  await page.getByRole("tab", { name: /음악 저장하기/ }).click();
  await snapshots("practice-saving", ".practice-save-panel");
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  report.practice = { modeSelection: true, actualNotePlaced: true, musicSvgPreserved: true, saveTabWorks: true };
}

async function verifyMusicVideoPlacement() {
  const sceneDraft = () => page.evaluate(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes ?? []);
  let expectedScenes = await sceneDraft();
  let initialBlankSceneCreated = false;
  const results = [];
  for (const [width, height] of [[1440, 900], [375, 667]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.locator(".mv-feature").count(), 1, "The music video feature must have one state owner");
    assert.equal(await page.locator(".composition-music-video").count(), 1);
    const feature = page.locator(".composition-music-video > .mv-feature");
    await feature.scrollIntoViewIfNeeded();
    const geometry = await feature.evaluate((element) => {
      const section = element.parentElement;
      const publish = document.querySelector(".publish-section");
      const box = element.getBoundingClientRect();
      const parent = section.getBoundingClientRect();
      return { documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
        outsideSaveContainers: !element.closest(".publish-section,.publish-actions,.publish-action-group-files"),
        immediatelyAfterPublish: publish.nextElementSibling === section,
        top: box.top + scrollY, publishBottom: publish.getBoundingClientRect().bottom + scrollY,
        left: box.left, right: box.right, width: box.width,
        parentLeft: parent.left, parentRight: parent.right, parentWidth: parent.width };
    });
    assert.ok(geometry.outsideSaveContainers && geometry.immediatelyAfterPublish,
      "The video entry must be an independent sibling after the save section");
    assert.ok(geometry.top >= geometry.publishBottom - 1, "The video entry must render below the save section");
    assert.ok(geometry.width > 0 && geometry.left >= geometry.parentLeft - 1
      && geometry.right <= geometry.parentRight + 1, "The video entry must fit its independent section");
    assert.ok(geometry.documentWidth <= width + 1, "The relocated video entry must not overflow the document");
    await page.screenshot({ path: path.join(outputDir, `music-video-entry-${width}.png`) });
    report.layouts.push({ name: "music-video-entry", width, height, ...geometry });
    await page.getByTestId("draw-music-video-scene").click();
    const studio = page.getByRole("dialog", { name: "장면 그리기", exact: true });
    await studio.waitFor();
    assert.equal(await studio.count(), 1);
    if (expectedScenes.length === 0) {
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.musicVideoScenes?.length === 1);
      expectedScenes = await sceneDraft();
      assert.deepEqual(expectedScenes[0].elements, []);
      assert.equal(expectedScenes[0].motion, "still");
      assert.equal(expectedScenes[0].endLyric, null);
      initialBlankSceneCreated = true;
    }
    await page.screenshot({ path: path.join(outputDir, `music-video-studio-${width}.png`) });
    await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
    await studio.waitFor({ state: "detached" });
    assert.deepEqual(await sceneDraft(), expectedScenes, "Opening and closing must preserve existing scene drafts");
    assert.equal(await page.locator(".mv-feature").count(), 1);
    results.push({ width, studioOpenedAndClosed: true, existingSceneDraftPreserved: true });
  }
  report.musicVideoEntry = { results, initialBlankSceneCreated, finalSceneCount: expectedScenes.length,
    motionNotSelected: true, mediaEncodingNotStarted: true, microphoneNotStarted: true };
}

async function verifyComposer() {
  await seedComposition();
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  assert.equal(await page.getByRole("menuitem").count(), 3);
  await assertProjectFileToolsRemoved();
  await assertImages(page.getByRole("menu"));
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  const settings = page.locator(".composer-settings");
  await settings.locator("summary").click();
  await page.getByTestId("mood-tempo-fast").click();
  assert.equal(await page.getByTestId("tempo-number").inputValue(), "128");
  await page.getByTestId("mood-tempo-normal").click();
  await snapshots("composer-settings", ".composer-settings", ".app-mood-setup");
  await settings.locator("summary").click();
  await snapshots("composer-main", ".composition-workspace");
  assert.ok(await page.locator(".composition-workspace svg.score").count(), "The main score must remain actual vector music data");
  assert.equal(await page.locator(".candidate-sidebar img[data-composer-child='keyboard']").count(), 0);
  assert.equal(await page.locator(".measure-instrument-picker > img[data-composer-child='keyboard']").count(), 1);
  const instrumentSelection = {};
  for (const [context, width, prefix, otherPrefix] of [
    ["candidate", 375, "candidate-preview-instrument-", "preview-instrument-"],
    ["measure", 1440, "preview-instrument-", "candidate-preview-instrument-"]
  ]) {
    await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
    const choice = page.locator(`.${context}-instrument-picker button[data-testid^='${prefix}'][aria-pressed='false']`).first();
    const instrumentId = (await choice.getAttribute("data-testid")).slice(prefix.length);
    const selected = page.getByTestId(`${prefix}${instrumentId}`);
    await selected.click();
    await page.waitForFunction((instrumentId) =>
      JSON.parse(localStorage.getItem("maeum-melody:draft:v1"))?.instrumentId === instrumentId, instrumentId);
    assert.equal(await selected.getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByTestId(`${otherPrefix}${instrumentId}`).getAttribute("aria-pressed"), "true",
      `Selecting the ${context} instrument must update the other shared picker`);
    instrumentSelection[context] = { instrumentId, draftUpdated: true, otherPickerSelected: true };
  }
  assert.notEqual(instrumentSelection.candidate.instrumentId, instrumentSelection.measure.instrumentId,
    "The reverse synchronization must select a different instrument");
  await page.locator(".measure-sound-open").click();
  await snapshots("sound-effect-dialog", ".measure-sound-dialog");
  assert.equal(await page.locator(".measure-sound-dialog .placed-sound-effect").count(), 0);
  await page.getByRole("button", { name: "소리 추가 창 닫기", exact: true }).click();
  assert.equal(await page.locator(".measure-sound-dialog").count(), 0);
  report.soundEffects = { actualDialogOpenedAndClosed: true, originalCharacterVerifiedAtBothWidths: true,
    effectsNotAdded: true, playbackNotStarted: true };
  await page.setViewportSize({ width: 375, height: 667 });
  const volume = page.getByTestId("beat-volume");
  await volume.scrollIntoViewIfNeeded();
  report.mobileVolumeLayout = await volume.evaluate((input) => {
    const group = input.parentElement.getBoundingClientRect();
    return [...input.parentElement.children].map((child) => {
      const box = child.getBoundingClientRect();
      return { tag: child.tagName, fits: box.left >= group.left && box.right <= group.right + 1, width: box.width };
    });
  });
  assert.ok(report.mobileVolumeLayout.every((control) => control.fits), "Mobile volume controls must fit their own grid without clipping");
  for (const value of [105, 100]) {
    await volume.evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await page.waitForFunction((value) => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")).beatVolume === value, value);
  }
  await page.screenshot({ path: path.join(outputDir, "composer-volume-375.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  const lyric = page.getByTestId("note-lyric-1-1").first();
  await lyric.fill("봄");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("maeum-melody:draft:v1")).measures[0].notes[0].lyric === "봄");
  report.composer = { menuLabelsPreserved: true, actualTempoButtons: true, lyricInputWritesDraft: true,
    originalScoreSvgPreserved: true, mainCandidateIllustrationRemoved: true, measureInstrumentIllustrationPreserved: true,
    sharedInstrumentSelection: instrumentSelection,
    projectFileControlsRemoved: true };
  await snapshots("composer-saving", ".publish-section", ".publish-action-group-files");
  await assertProjectFileToolsRemoved();
  for (const id of ["export-pdf", "export-pdf-with-accompaniment", "export-backing-mp3", "export-lyrics-mp4", "record-song-mp3"])
    await check44(page.getByTestId(id));
  await page.getByTestId("record-song-mp3").click();
  await snapshots("recording-guide", ".recording-guide-dialog");
  await page.getByRole("button", { name: /합창 녹음/ }).click();
  await assertImages(page.getByRole("dialog"));
  assert.match(await page.getByRole("dialog").innerText(), /스피커는 학생 쪽으로/);
  await page.getByRole("button", { name: "취소", exact: true }).click();
  assert.equal(await page.locator(".recording-guide-dialog").count(), 0);
  report.recording = { actualGuideModeSelectionAndCancel: true, microphoneNotStarted: true };
  await verifyMusicVideoPlacement();
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("response", (response) => {
    if ((response.url().includes("/app-images/") || response.url().includes("/studio-images/")
      || response.url().includes("/illustrations/")) && response.status() >= 400)
      report.brokenResponses.push({ url: response.url(), status: response.status() });
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(baseUrl);
  report.bundle = await page.locator('script[type="module"][src]').evaluateAll((items) => items.map((item) => item.src));
  if (process.env.VERIFY_APP_MODE === "diagnose") {
    await seedComposition();
    await page.setViewportSize({ width: 375, height: 667 });
    report.overflowDiagnosis = await page.evaluate(() => [...document.body.querySelectorAll("*")]
      .filter((node) => node instanceof HTMLElement && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().right > innerWidth + 1)
      .map((node) => ({ tag: node.tagName, className: node.className, right: node.getBoundingClientRect().right,
        width: node.getBoundingClientRect().width, visibility: getComputedStyle(node).visibility,
        overflowX: getComputedStyle(node).overflowX, parent: node.parentElement?.className,
        parentWidth: node.parentElement?.clientWidth })).sort((a, b) => b.right - a.right).slice(0, 35));
    console.log(JSON.stringify(report.overflowDiagnosis, null, 2));
  } else {
  report.stage = "106 deployed generated WebP images and original children";
  report.assets = await verifyAssets();
  report.originalChildrenAssets = await verifyOriginalChildrenAssets();
  report.conditionalChildrenSource = await verifyConditionalChildrenSource();
  report.stage = "opening and three activity choices";
  await snapshots("opening", ".opening-screen");
  for (const label of [/새로 시작하기/, /리듬·가락 직접 만들기/])
    await check44(page.locator(".opening-screen").getByRole("button", { name: label }));
  report.stage = "real practice note editing and saving tab";
  await verifyPractice();
  report.stage = "main composer, settings, saving and recording guide";
  await verifyComposer();
  assert.deepEqual(report.brokenResponses, []);
  assert.deepEqual(report.errors, []);
  const overflows = report.layouts.filter((layout) => layout.documentWidth > layout.viewportWidth + 1);
  report.overflows = overflows.map(({ name, width, documentWidth }) => ({ name, width, documentWidth }));
  assert.deepEqual(report.overflows, [], "Main app screens must keep horizontal overflow inside their actual score scrolling regions");
  report.success = true;
  report.stage = "complete";
  console.log(JSON.stringify({ success: true, assets: report.assets.count, bytes: report.assets.bytes,
    screens: report.layouts.length, practice: report.practice, composer: report.composer, errors: report.errors }, null, 2));
  }
} catch (error) {
  report.success = false;
  report.failure = String(error);
  await page?.screenshot({ path: path.join(outputDir, "failure.png") });
  console.error(String(error));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
