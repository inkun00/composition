import { CanvasSource, type VideoEncodingConfig } from "mediabunny";

type FrameEncoding = Readonly<{ width: number; height: number; videoConfig: VideoEncodingConfig }>;

/** Keep the original drawing coordinates when the encoder needs a smaller canvas. */
export function createMp4FrameSource(canvas: HTMLCanvasElement, encoding: FrameEncoding) {
  const { width, height, videoConfig } = encoding;
  let outputCanvas = canvas;
  let outputContext: CanvasRenderingContext2D | null = null;
  if (canvas.width !== width || canvas.height !== height) {
    outputCanvas = document.createElement("canvas");
    outputCanvas.width = width;
    outputCanvas.height = height;
    outputContext = outputCanvas.getContext("2d", { alpha: false });
    if (!outputContext) throw new Error("MP4에 담을 영상 화면을 만들 수 없어요.");
  }

  const video = new CanvasSource(outputCanvas, videoConfig);
  return {
    video,
    addFrame(start: number, duration: number, keyFrame: boolean) {
      outputContext?.drawImage(canvas, 0, 0, width, height);
      return video.add(start, duration, { keyFrame });
    }
  };
}
