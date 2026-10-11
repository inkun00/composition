import { chromium } from "playwright-core";

const executablePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4174/");
  const result = await page.evaluate(async () => {
    const { buildLyricVideoPlan } = await import("/src/video/lyricVideoPlan.ts");
    const { exportLyricMp4 } = await import("/src/video/exportLyricMp4.ts");
    const sampleRate = 48_000;
    const samples = sampleRate * 2;
    const wav = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(wav);
    const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    text(0, "RIFF");
    view.setUint32(4, wav.byteLength - 8, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples * 2, true);
    for (let index = 0; index < samples; index++) {
      view.setInt16(44 + index * 2, Math.sin(index * 440 * 2 * Math.PI / sampleRate) * 4000, true);
    }
    const audioUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    const notes = ["안", "녕"].map((lyric, index) => ({
      id: String(index), pitch: 60 + index * 2, lyric, duration: { numerator: 1, denominator: 1 }
    }));
    const plan = buildLyricVideoPlan("시험 노래", [{ notes }], 120, 0.5, 2);
    const progress = [];
    const blob = await exportLyricMp4(audioUrl, plan, (value) => progress.push(value));
    URL.revokeObjectURL(audioUrl);
    const signature = String.fromCharCode(...new Uint8Array(await blob.slice(4, 8).arrayBuffer()));
    const { ALL_FORMATS, BlobSource, Input } = await import("/node_modules/.vite/deps/mediabunny.js");
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const tracks = await Promise.all((await input.getTracks()).map(async (track) => ({
      type: track.type, codec: await track.getCodec()
    })));
    const videoUrl = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = videoUrl;
    const metadata = await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => reject(new Error("만든 MP4를 브라우저에서 재생할 수 없어요."));
    });
    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = video.videoWidth;
    frameCanvas.height = video.videoHeight;
    const frameContext = frameCanvas.getContext("2d");
    async function yellowCenterAt(seconds) {
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = seconds;
      });
      frameContext.drawImage(video, 0, 0);
      const image = frameContext.getImageData(0, 300, frameCanvas.width, 130);
      let totalX = 0;
      let count = 0;
      for (let y = 0; y < image.height; y += 2) {
        for (let x = 0; x < image.width; x += 2) {
          const offset = (y * image.width + x) * 4;
          if (image.data[offset] > 200 && image.data[offset + 1] > 140 && image.data[offset + 2] < 130) {
            totalX += x;
            count++;
          }
        }
      }
      return count ? totalX / count : null;
    }
    const firstLyricX = await yellowCenterAt(0.75);
    const secondLyricX = await yellowCenterAt(1.25);
    URL.revokeObjectURL(videoUrl);
    return { bytes: blob.size, signature, tracks, progress, metadata, firstLyricX, secondLyricX };
  });

  if (result.signature !== "ftyp" || result.bytes < 1000 || result.progress.at(-1) !== 100) {
    throw new Error(`MP4 검증 실패: ${JSON.stringify(result)}`);
  }
  if (!result.tracks.some((track) => track.type === "video" && track.codec === "avc") ||
    !result.tracks.some((track) => track.type === "audio" && track.codec === "aac")) {
    throw new Error(`MP4 음성/영상 트랙 검증 실패: ${JSON.stringify(result)}`);
  }
  if (Math.abs(result.metadata.duration - 2) > 0.2 || result.metadata.width !== 1280) {
    throw new Error(`영상 길이/크기 검증 실패: ${JSON.stringify(result)}`);
  }
  if (result.firstLyricX === null || result.secondLyricX === null ||
    result.firstLyricX >= result.secondLyricX) {
    throw new Error(`가사 하이라이트 타이밍 검증 실패: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await browser.close();
}
