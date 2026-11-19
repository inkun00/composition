import { AudioBufferSource, BufferTarget, Mp4OutputFormat, Output } from "mediabunny";
import { resolveMp4Encoding } from "../video/mp4Encoding";
import { createMp4FrameSource } from "../video/mp4FrameSource";
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
  const encoding = await resolveMp4Encoding({
    width: PRACTICE_VIDEO_WIDTH, height: PRACTICE_VIDEO_HEIGHT,
    frameRate: PRACTICE_VIDEO_FPS, videoBitrate: 1_800_000, audioBuffer: rendered.buffer, signal: options.signal
  });
  checkAbort();
  const renderer = await preparePracticeVideoRenderer(plan, input.videoMode ?? "bars");
  checkAbort();
  options.onProgress?.(8);
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const { video, addFrame } = createMp4FrameSource(renderer.canvas, encoding);
  const audio = new AudioBufferSource(encoding.audioConfig);
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
      await addFrame(frame.startSeconds, frame.endSeconds - frame.startSeconds,
        index === 0 || previousMeasure !== frame.measureIndex);
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
