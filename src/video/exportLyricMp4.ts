import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality,
  canEncodeAudio, canEncodeVideo
} from "mediabunny";
import type { LyricVideoFrame, LyricVideoPlan } from "./lyricVideoPlan";

const WIDTH = 1280;
const HEIGHT = 720;

export type LyricMp4Options = Readonly<{
  allowEmptyLyrics?: boolean;
  /** A custom scene renderer shares the same lyric boundaries and original audio. */
  drawFrame?: (context: CanvasRenderingContext2D, frame: LyricVideoFrame, timeSeconds: number) => void;
  /** Omit for still images; motion is sampled without moving any lyric boundaries. */
  frameRate?: number;
}>;

function renderFrames(plan: LyricVideoPlan, frameRate?: number): readonly LyricVideoFrame[] {
  if (!frameRate) return plan.frames;
  return plan.frames.flatMap((frame) => {
    const count = Math.ceil((frame.endSeconds - frame.startSeconds) * frameRate);
    return Array.from({ length: count }, (_, index) => ({
      ...frame,
      startSeconds: frame.startSeconds + index / frameRate,
      endSeconds: Math.min(frame.endSeconds, frame.startSeconds + (index + 1) / frameRate)
    }));
  });
}

function drawFrame(context: CanvasRenderingContext2D, title: string, frame: LyricVideoFrame): void {
  context.fillStyle = "#000";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#d8d8d8";
  context.font = '500 30px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  context.fillText(title, WIDTH / 2, 110, WIDTH - 120);

  if (frame.syllables.length === 0) return;
  let fontSize = 82;
  const font = (size: number) => `700 ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  const widths = () => frame.syllables.map((syllable) => context.measureText(syllable).width);
  context.font = font(fontSize);
  while (fontSize > 34 && widths().reduce((sum, width) => sum + width + 10, 0) > WIDTH - 120) {
    fontSize -= 4;
    context.font = font(fontSize);
  }

  const syllableWidths = widths();
  const totalWidth = syllableWidths.reduce((sum, width) => sum + width, 0) + 10 * (syllableWidths.length - 1);
  let x = (WIDTH - totalWidth) / 2;
  context.textAlign = "left";
  frame.syllables.forEach((syllable, index) => {
    context.fillStyle = index === frame.activeSyllable ? "#ffd34f" : "#fff";
    context.fillText(syllable, x, HEIGHT / 2, WIDTH - 120);
    x += syllableWidths[index] + 10;
  });
}

async function decodeRecording(audioUrl: string): Promise<AudioBuffer> {
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error("녹음 파일을 읽지 못했어요. 다시 녹음해 주세요.");
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await response.arrayBuffer());
  } finally {
    await context.close();
  }
}

export async function exportLyricMp4(
  audioSource: string | AudioBuffer,
  plan: LyricVideoPlan,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  options: LyricMp4Options = {}
): Promise<Blob> {
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException("영상 만들기를 멈췄어요.", "AbortError");
  };
  checkAbort();
  if (!plan.hasLyrics && !options.allowEmptyLyrics) {
    throw new Error("가사를 한 글자 이상 적은 뒤 다시 녹음해 주세요.");
  }
  onProgress(2);
  const audioBuffer = typeof audioSource === "string" ? await decodeRecording(audioSource) : audioSource;
  checkAbort();
  onProgress(8);

  const frameRate = options.frameRate === undefined || !Number.isFinite(options.frameRate)
    ? undefined : Math.max(1, Math.min(60, options.frameRate));
  const frames = renderFrames(plan, frameRate);

  const videoQuality = new Quality({ bitrate: 1_200_000 });
  const audioQuality = new Quality({ bitrate: 192_000 });
  const [videoSupported, audioSupported] = await Promise.all([
    canEncodeVideo("avc", { width: WIDTH, height: HEIGHT, frameRate: frameRate ?? 10, quality: videoQuality }),
    canEncodeAudio("aac", {
      numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
      sampleRate: audioBuffer.sampleRate,
      quality: audioQuality
    })
  ]);
  checkAbort();
  if (!videoSupported || !audioSupported) {
    throw new Error("이 브라우저는 MP4 만들기를 지원하지 않아요. 최신 크롬이나 엣지에서 다시 시도해 주세요.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("영상 화면을 만들 수 없어요.");

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: "avc", quality: videoQuality });
  const audio = new AudioBufferSource({ codec: "aac", quality: audioQuality });
  output.addVideoTrack(video);
  output.addAudioTrack(audio);

  try {
    checkAbort();
    await output.start();
    await audio.add(audioBuffer);
    checkAbort();
    onProgress(18);

    let previousMeasure: number | null = null;
    for (const [index, frame] of frames.entries()) {
      checkAbort();
      const endSeconds = Math.min(audioBuffer.duration, frame.endSeconds);
      if (frame.startSeconds >= endSeconds) continue;
      if (options.drawFrame) options.drawFrame(context, frame, frame.startSeconds);
      else drawFrame(context, plan.title, frame);
      await video.add(frame.startSeconds, endSeconds - frame.startSeconds, {
        keyFrame: index === 0 || previousMeasure !== frame.measureIndex
      });
      previousMeasure = frame.measureIndex;
      onProgress(18 + Math.round(77 * (index + 1) / frames.length));
      if (index % 8 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    checkAbort();
    await output.finalize();
    checkAbort();
    if (!output.target.buffer) throw new Error("MP4 파일을 완성하지 못했어요.");
    onProgress(100);
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined);
    }
    throw error;
  }
}
