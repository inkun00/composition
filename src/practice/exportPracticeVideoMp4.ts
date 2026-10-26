import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality,
  canEncodeAudio, canEncodeVideo
} from "mediabunny";
import type { PracticeAudioInput, PracticeRenderedAudio } from "./practiceAudioTypes";
import { PRACTICE_VIDEO_FPS, PRACTICE_VIDEO_HEIGHT, PRACTICE_VIDEO_WIDTH } from "./practiceVideoLayout";
import { buildPracticeVideoPlan } from "./practiceVideoPlan";
import { preparePracticeVideoRenderer } from "./practiceVideoRenderer";

type ExportOptions = Readonly<{
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}>;

/** Encode the authored scores directly beside the already rendered audio buffer. */
export async function exportPracticeVideoMp4(
  rendered: PracticeRenderedAudio, input: PracticeAudioInput, options: ExportOptions = {}
): Promise<Blob> {
  const checkAbort = () => {
    if (options.signal?.aborted) throw new DOMException("영상 만들기를 멈췄어요.", "AbortError");
  };
  checkAbort();
  const plan = buildPracticeVideoPlan(input, rendered);
  options.onProgress?.(2);
  const videoQuality = new Quality({ bitrate: 1_800_000 });
  const audioQuality = new Quality({ bitrate: 192_000 });
  const [videoSupported, audioSupported] = await Promise.all([
    canEncodeVideo("avc", {
      width: PRACTICE_VIDEO_WIDTH, height: PRACTICE_VIDEO_HEIGHT,
      frameRate: PRACTICE_VIDEO_FPS, quality: videoQuality
    }),
    canEncodeAudio("aac", {
      numberOfChannels: Math.min(2, rendered.buffer.numberOfChannels),
      sampleRate: rendered.buffer.sampleRate,
      quality: audioQuality
    })
  ]);
  checkAbort();
  if (!videoSupported || !audioSupported) {
    throw new Error("이 브라우저는 MP4 만들기를 지원하지 않아요. 최신 크롬이나 엣지에서 다시 시도해 주세요.");
  }
  const renderer = await preparePracticeVideoRenderer(plan, input.videoMode ?? "bars");
  checkAbort();
  options.onProgress?.(8);
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const video = new CanvasSource(renderer.canvas, { codec: "avc", quality: videoQuality });
  const audio = new AudioBufferSource({ codec: "aac", quality: audioQuality });
  output.addVideoTrack(video);
  output.addAudioTrack(audio);

  try {
    checkAbort();
    await output.start();
    await audio.add(rendered.buffer);
    checkAbort();
    options.onProgress?.(18);
    let previousMeasure: number | null = null;
    for (const [index, frame] of plan.frames.entries()) {
      checkAbort();
      renderer.draw(frame.startSeconds);
      await video.add(frame.startSeconds, frame.endSeconds - frame.startSeconds, {
        keyFrame: index === 0 || previousMeasure !== frame.measureIndex
      });
      previousMeasure = frame.measureIndex;
      options.onProgress?.(18 + Math.round(77 * (index + 1) / plan.frames.length));
      if (index % 8 === 7) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    checkAbort();
    await output.finalize();
    checkAbort();
    if (!output.target.buffer) throw new Error("MP4 파일을 완성하지 못했어요.");
    options.onProgress?.(100);
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => undefined);
    }
    throw error;
  }
}
