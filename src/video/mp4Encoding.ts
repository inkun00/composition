import {
  canEncodeAudio, canEncodeVideo, Quality,
  type AudioEncodingConfig, type VideoEncodingConfig
} from "mediabunny";

type Mp4EncodingRequest = Readonly<{
  width: number;
  height: number;
  frameRate: number;
  videoBitrate: number;
  audioBuffer: Pick<AudioBuffer, "numberOfChannels" | "sampleRate">;
  signal?: AbortSignal;
}>;

export type Mp4Encoding = Readonly<{
  width: number;
  height: number;
  videoConfig: VideoEncodingConfig;
  audioConfig: AudioEncodingConfig;
}>;

let aacRegistration: Promise<void> | undefined;

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("영상 만들기를 멈췄어요.", "AbortError");
}

function ensureAacEncoder(): Promise<void> {
  if (!aacRegistration) {
    aacRegistration = import("@mediabunny/aac-encoder")
      .then(({ registerAacEncoder }) => { registerAacEncoder(); })
      .catch((error: unknown) => {
        aacRegistration = undefined;
        throw error;
      });
  }
  return aacRegistration;
}

/** Use the same concrete encoder settings for capability checks and output. */
export async function resolveMp4Encoding(request: Mp4EncodingRequest): Promise<Mp4Encoding> {
  const { width, height, frameRate, videoBitrate, audioBuffer, signal } = request;
  checkAbort(signal);
  const baseline = (bitrate: number, hardwareAcceleration: "prefer-software" | "no-preference"): VideoEncodingConfig => ({
    codec: "avc", quality: new Quality({ bitrate }), fullCodecString: "avc1.42001f", hardwareAcceleration
  });
  const candidates: { width: number; height: number; config: VideoEncodingConfig }[] = [
    { width, height, config: { codec: "avc", quality: new Quality({ bitrate: videoBitrate }) } },
    { width, height, config: baseline(videoBitrate, "prefer-software") },
    { width, height, config: baseline(videoBitrate, "no-preference") }
  ];
  if (width >= 1280 && height >= 720) {
    const lowerBitrate = Math.min(videoBitrate, 900_000);
    candidates.push({ width: 854, height: 480, config: baseline(lowerBitrate, "prefer-software") },
      { width: 854, height: 480, config: baseline(lowerBitrate, "no-preference") });
  }

  let selected: typeof candidates[number] | undefined;
  let videoError: unknown;
  for (const candidate of candidates) {
    checkAbort(signal);
    let supported = false;
    try {
      supported = await canEncodeVideo("avc", { ...candidate.config, width: candidate.width,
        height: candidate.height, frameRate });
    } catch (error) {
      videoError = error;
    }
    checkAbort(signal);
    if (supported) {
      selected = candidate;
      break;
    }
  }
  if (!selected) {
    throw new Error("이 기기에서 MP4 영상(H.264)을 만들 수 없어요. 컴퓨터의 크롬이나 엣지에서 이 사이트의 HTTPS 주소를 직접 열어 다시 저장해 주세요.",
      { cause: videoError });
  }

  const audioConfig: AudioEncodingConfig = { codec: "aac", quality: new Quality({ bitrate: 192_000 }),
    ...(audioBuffer.numberOfChannels > 2 ? { transform: { numberOfChannels: 2 } } : {}) };
  const audioProbe = {
    numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
    sampleRate: audioBuffer.sampleRate,
    quality: audioConfig.quality
  };
  let audioSupported = false;
  let audioError: unknown;
  try {
    audioSupported = await canEncodeAudio("aac", audioProbe);
  } catch (error) {
    audioError = error;
  }
  checkAbort(signal);
  if (!audioSupported) {
    try {
      await ensureAacEncoder();
      checkAbort(signal);
      audioSupported = await canEncodeAudio("aac", audioProbe);
      checkAbort(signal);
    } catch (error) {
      checkAbort(signal);
      audioError = error;
    }
  }
  checkAbort(signal);
  if (!audioSupported) {
    throw new Error("MP4 소리(AAC)를 준비하지 못했어요. 인터넷 연결을 확인하고 화면을 새로고침한 뒤 다시 저장해 주세요.",
      { cause: audioError });
  }
  return { width: selected.width, height: selected.height, videoConfig: selected.config, audioConfig };
}
