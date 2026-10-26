import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadActualSceneGraphics } from "./scene-travel-verification.mjs";

export async function verifySceneBpmGraphics(page, outputDir, ids, original) {
  await loadActualSceneGraphics(page, outputDir);
  const results = await page.evaluate(({ ids, original }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    function draw(id, bpm, beat, intro = 0, relative = false) {
      const seconds = 60 / bpm;
      const scene = { ...original, motion: id, choreography: undefined };
      const timed = { scene, startSeconds: 0, endSeconds: intro + 16 * seconds, lyricText: "" };
      const plan = { title: "", bpm, introSeconds: intro, lyrics: { title: "", hasLyrics: false, frames: [] }, scenes: [timed] };
      const time = (relative ? intro : 0) + beat * seconds;
      context.fillStyle = scene.background;
      context.fillRect(0, 0, 1280, 720);
      context.save();
      context.scale(4 / 3, 4 / 3);
      window.SceneTravelGraphics.drawSceneMotionGraphics(context, timed, plan, time);
      context.restore();
      return { frame: context.getImageData(0, 0, 1280, 720).data,
        pose: window.SceneTravelGraphics.sampleSceneGraphicPose(timed, bpm, time, intro) };
    }
    function difference(a, b) {
      let exactChanged = 0, visibleChanged = 0, totalDifference = 0;
      for (let index = 0; index < a.length; index += 4) {
        const delta = Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
        if (delta) exactChanged++;
        if (delta > 90) visibleChanged++;
        totalDifference += delta;
      }
      return { exactChanged, visibleChanged, totalDifference };
    }
    const sameBeat = [];
    for (const id of ids) {
      for (const beat of [.75, 3]) {
        const slow = draw(id, 90, beat);
        const fast = draw(id, 180, beat);
        sameBeat.push({ id, beat, bpms: [90, 180], difference: difference(slow.frame, fast.frame),
          slowPose: slow.pose, fastPose: fast.pose });
      }
    }
    const speed = [];
    for (const id of ["draw-on", "move-right", "zoom"]) {
      const slow = draw(id, 90, .6 * 90 / 60);
      const fast = draw(id, 180, .6 * 180 / 60);
      speed.push({ id, seconds: .6, slowPose: slow.pose, fastPose: fast.pose, difference: difference(slow.frame, fast.frame) });
    }
    const introPhase = [];
    for (const id of ["float", "bounce", "pulse", "sparkle", "snow", "bounce-left", "bounce-right"]) {
      const originalFrame = draw(id, 180, .75, 0, true);
      const offset = .08 + 16 * 60 / 180;
      const shiftedFrame = draw(id, 180, .75, offset, true);
      introPhase.push({ id, musicBeat: .75, introSeconds: offset, difference: difference(originalFrame.frame, shiftedFrame.frame),
        originalPose: originalFrame.pose, shiftedPose: shiftedFrame.pose });
    }
    const pngs = [];
    for (const bpm of [90, 180]) {
      draw("rotate-in", bpm, 3);
      pngs.push({ filename: `bpm-${bpm}-rotate-in-beat-3.png`, data: canvas.toDataURL("image/png").split(",")[1] });
    }
    return { sameBeat, speed, introPhase, pngs };
  }, { ids, original });
  for (const { filename, data } of results.pngs) await writeFile(path.join(outputDir, filename), Buffer.from(data, "base64"));
  delete results.pngs;
  for (const item of results.sameBeat) {
    assert.equal(item.difference.exactChanged, 0, `${item.id}: the same music beat must render the same pixels at 90 and 180 BPM`);
  }
  for (const item of results.speed) {
    const field = item.id === "draw-on" ? "reveal" : item.id === "move-right" ? "dx" : "scale";
    assert.ok(item.fastPose[field] > item.slowPose[field], `${item.id}: a faster score must progress further in the same .6 seconds`);
    assert.ok(item.difference.exactChanged > 100, `${item.id}: faster progress must affect actual drawing pixels`);
  }
  for (const item of results.introPhase) {
    if (item.id.startsWith("bounce-")) {
      assert.ok(Math.abs(item.originalPose.dy - item.shiftedPose.dy) < 1e-9,
        `${item.id}: the hopping phase must use the music intro while horizontal travel keeps its scene progress`);
    } else assert.equal(item.difference.exactChanged, 0, `${item.id}: a scheduling lead-in and intro must not shift the music beat phase`);
  }
  return { source: "actual graphics module, one canvas, 16-beat scores", ...results };
}

export async function verifyAppBpmPreview({ page, outputDir, selectPreset, seekPreview, comparePreview, savedScenes }) {
  const original = await savedScenes();
  const checks = [];
  for (const id of ["draw-on", "bounce", "move-right"]) {
    const durations = [];
    for (const bpm of [90, 180]) {
      await page.getByRole("button", { name: "장면 그리기 닫기", exact: true }).click();
      await page.getByTestId("tempo-number").fill(String(bpm));
      await page.getByTestId("draw-music-video-scene").click();
      await selectPreset(id);
      assert.match(await page.getByTestId("scene-motion-tempo").innerText(), new RegExp(`BPM\\s+${bpm}`));
      const beatSeconds = 60 / bpm;
      await seekPreview(0, "bpm-ui-warm-zero");
      await seekPreview(.1, "bpm-ui-warm-small");
      await seekPreview(.75 * beatSeconds, `ui-${id}-${bpm}`);
      durations.push(Number(await page.getByLabel("움직임 미리보기 시간", { exact: true }).getAttribute("max")));
      const png = await page.getByLabel("장면 움직임 미리보기", { exact: true })
        .evaluate((element) => element.toDataURL("image/png").split(",")[1]);
      await writeFile(path.join(outputDir, `app-bpm-${bpm}-${id}-beat-075.png`), Buffer.from(png, "base64"));
      const selected = await savedScenes();
      assert.deepEqual(selected.map((scene) => scene.elements), original.map((scene) => scene.elements));
      assert.equal(selected[0].motion, id);
    }
    const pixels = await comparePreview(`ui-${id}-90`, `ui-${id}-180`);
    assert.equal(pixels.changed, 0, `${id}: the actual app preview must match at the same .75 beat after changing BPM`);
    assert.ok(Math.abs(durations[0] / durations[1] - 2) < 1e-9, "The actual score's scene duration must halve at double BPM");
    checks.push({ id, bpms: [90, 180], beat: .75, durations, pixels });
  }
  await selectPreset(original[0].motion);
  assert.deepEqual(await savedScenes(), original);
  return { actualTempoInput: true, originalArtworkPreserved: true, checks };
}

export async function verifyMp4BeatSync(page, bytes, bpm, inspectVideo) {
  const seconds = 60 / bpm;
  const intro = .08 + 16 * seconds;
  const times = [intro + 4 * seconds + .01, intro + 4.5 * seconds,
    intro + 5 * seconds + .01, intro + 5.5 * seconds];
  const media = await inspectVideo(bytes, times);
  for (const check of media.checks) {
    assert.ok(check.bounds[1].centerY < check.bounds[0].centerY - 10,
      "The MP4's first-scene hop must peak half a beat after the actual musical beat, including .08 seconds and the intro");
    assert.ok(Math.abs(check.bounds[1].width - check.bounds[0].width) <= 4,
      "The observed half-beat motion must be a hop rather than scaling");
  }
  return { bpm, introSeconds: intro, beats: [4, 4.5, 5, 5.5], times, checks: media.checks };
}
