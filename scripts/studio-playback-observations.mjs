import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";

// Passive Chrome instrumentation: no AudioContext, renderer, or media API is
// replaced. WebAudio events/clock and native AudioBuffer instances are read only.
export async function observeStudioAudio(page) {
  const session = await page.context().newCDPSession(page);
  const contexts = new Map();
  const nodes = [];
  const events = [];
  session.on("WebAudio.contextCreated", ({ context }) => {
    contexts.set(context.contextId, context);
    events.push({ type: "created", ...context });
  });
  session.on("WebAudio.contextChanged", ({ context }) => {
    contexts.set(context.contextId, context);
    events.push({ type: "changed", ...context });
  });
  session.on("WebAudio.contextWillBeDestroyed", ({ contextId }) => {
    const context = contexts.get(contextId);
    contexts.set(contextId, { ...context, contextId, destroyed: true });
    events.push({ type: "destroyed", contextId });
  });
  session.on("WebAudio.audioNodeCreated", ({ node }) => nodes.push(node));
  await session.send("WebAudio.enable");

  async function clock() {
    const context = [...contexts.values()].filter((entry) => entry.contextType === "realtime" &&
      entry.contextState === "running" && !entry.destroyed).at(-1);
    assert.ok(context, "The preview must use a running native realtime AudioContext");
    const { realtimeData } = await session.send("WebAudio.getRealtimeData", { contextId: context.contextId });
    return { contextId: context.contextId, state: context.contextState, sampleRate: context.sampleRate, ...realtimeData };
  }

  async function pcm(duration) {
    const prototype = await session.send("Runtime.evaluate", { expression: "AudioBuffer.prototype", objectGroup: "preview-pcm" });
    const objects = await session.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId, objectGroup: "preview-pcm" });
    const result = await session.send("Runtime.callFunctionOn", {
      objectId: objects.objects.objectId,
      functionDeclaration: `function(duration) {
        return this.filter(buffer => Math.abs(buffer.duration - duration) < .2).map(buffer => {
          const samples = buffer.getChannelData(0);
          let sum = 0, peak = 0, count = 0;
          const step = Math.max(1, Math.floor(samples.length / 8192));
          for (let index = 0; index < samples.length; index += step) {
            sum += samples[index] * samples[index];
            peak = Math.max(peak, Math.abs(samples[index]));
            count++;
          }
          return { duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate,
            samples: buffer.length, rms: Math.sqrt(sum / count), peak };
        });
      }`,
      arguments: [{ value: duration }], returnByValue: true
    });
    await session.send("Runtime.releaseObjectGroup", { objectGroup: "preview-pcm" });
    assert.equal(result.exceptionDetails, undefined);
    const buffers = result.result.value;
    assert.ok(buffers.some((buffer) => buffer.rms > .0001 && buffer.peak > .001),
      "The native prepared full-length PCM must contain actual non-silent music");
    return buffers;
  }

  async function videoEncoders() {
    const prototype = await session.send("Runtime.evaluate", { expression: "typeof VideoEncoder === 'function' ? VideoEncoder.prototype : null",
      objectGroup: "preview-encoders" });
    if (!prototype.result.objectId) return 0;
    const objects = await session.send("Runtime.queryObjects", { prototypeObjectId: prototype.result.objectId, objectGroup: "preview-encoders" });
    const result = await session.send("Runtime.callFunctionOn", { objectId: objects.objects.objectId,
      functionDeclaration: "function() { return this.length; }", returnByValue: true });
    await session.send("Runtime.releaseObjectGroup", { objectGroup: "preview-encoders" });
    return result.result.value;
  }

  async function closed(contextId) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const context = contexts.get(contextId);
      if (context?.destroyed || context?.contextState === "closed") return { contextId, ...context };
      await page.waitForTimeout(100);
    }
    assert.fail(`Preview AudioContext ${contextId} must close or be destroyed after the dialog closes`);
  }

  return { clock, pcm, videoEncoders, closed, events, nodes, session };
}

export async function rememberStudioFrame(page, key) {
  return page.getByTestId("music-video-preview-canvas").evaluate(async (canvas, key) => {
    await new Promise(requestAnimationFrame);
    (window.__studioFrames ??= {})[key] = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    return { width: canvas.width, height: canvas.height };
  }, key);
}

export async function compareStudioFrames(page, first, second, region = [0, 0, 1280, 720]) {
  return page.evaluate(({ first, second, region }) => {
    const a = window.__studioFrames[first], b = window.__studioFrames[second];
    let changed = 0, exactChanged = 0, yellow = 0;
    const [left, top, right, bottom] = region;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const index = (y * 1280 + x) * 4;
      const delta = Math.abs(a[index] - b[index]) + Math.abs(a[index + 1] - b[index + 1]) + Math.abs(a[index + 2] - b[index + 2]);
      if (delta > 90) changed++;
      if (delta) exactChanged++;
      if (b[index] > 180 && b[index + 1] > 150 && b[index + 2] < 160) yellow++;
    }
    return { changed, exactChanged, yellow };
  }, { first, second, region });
}

export async function studioBackground(page) {
  return page.getByTestId("music-video-preview-canvas").evaluate((canvas) =>
    [...canvas.getContext("2d").getImageData(20, 120, 1, 1).data].slice(0, 3));
}

export async function captureStudioFrame(page, outputDir, filename) {
  const png = await page.getByTestId("music-video-preview-canvas")
    .evaluate((canvas) => canvas.toDataURL("image/png").split(",")[1]);
  await writeFile(path.join(outputDir, filename), Buffer.from(png, "base64"));
}
