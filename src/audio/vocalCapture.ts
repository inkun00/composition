export type RecordingCaptureMode = "personal" | "choir";

export type VocalCaptureProfile = Readonly<{
  constraints: MediaTrackConstraints;
  useNoiseGate: boolean;
  highPassHz: number;
  lowPassHz: number;
  mudCutDb: number;
  presenceDb: number;
  deEsserDb: number;
  compressorThreshold: number;
  compressorRatio: number;
  dryGain: number;
  reverbSend: number;
  reverbReturn: number;
  vocalBusGain: number;
  mixBusGain: number;
}>;

/**
 * 현재 브라우저에서 MediaRecorder가 지원하는 오디오 codec을 선택한다.
 * 우선순위: audio/webm;codecs=opus (Chrome/Android — 고품질) →
 *           audio/mp4 (iOS Safari) → audio/ogg;codecs=opus → 기본값
 * audio/mp4를 먼저 두면 Android Chrome도 mp4를 선택하는데,
 * mp4의 기본 비트레이트가 16~32kbps로 전화 음질 수준이므로 webm을 우선한다.
 */
export function selectRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];
  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return null;
}

export function vocalCaptureProfile(mode: RecordingCaptureMode): VocalCaptureProfile {
  if (mode === "choir") {
    return {
      constraints: {
        // echoCancellation을 끈다: 스마트폰은 스피커-마이크 거리가 짧아
        // EC가 반주음을 에코로 판단해 목소리까지 함께 억제한다.
        // 에코 제어는 Web Audio 처리 체인(필터·컴프레서·믹스)이 담당한다.
        echoCancellation: false,
        noiseSuppression: false,
        // AGC를 꺼서 마이크 감도가 제멋대로 치솟아 먼 소음까지 빨아들이는 현상을 차단한다
        autoGainControl: false,
        channelCount: 1
      },
      useNoiseGate: false,
      highPassHz: 70,
      lowPassHz: 15000,
      mudCutDb: -0.6,
      presenceDb: 0.45,
      deEsserDb: -0.35,
      compressorThreshold: -14,
      compressorRatio: 1.6,
      dryGain: 1,
      reverbSend: 0.025,
      reverbReturn: 0.16,
      vocalBusGain: 1.35,
      mixBusGain: 0.94
    };
  }
  return {
    constraints: {
      // echoCancellation을 끈다: 스마트폰은 스피커-마이크 거리가 짧아
      // EC가 반주음을 에코로 판단해 목소리까지 함께 억제한다.
      // 에코 제어는 Web Audio 처리 체인(필터·컴프레서·믹스)이 담당한다.
      echoCancellation: false,
      // 개인 녹음은 주변 일상 잡음을 억제하기 위해 noiseSuppression을 활성화한다
      noiseSuppression: true,
      // AGC를 꺼서 조용할 때 마이크 민감도가 자동 폭증해 먼 소리를 다 녹음하는 현상을 차단한다
      autoGainControl: false,
      channelCount: 1
    },
    useNoiseGate: true,
    highPassHz: 85,   // 85Hz: 책상 진동 및 실내 저주파 웅웅거림을 억제하면서 보컬의 온기는 보존
    lowPassHz: 16000, // 16kHz까지 확장해 공기감 및 선명도 확보
    mudCutDb: -1.4,
    presenceDb: 1.2,
    deEsserDb: -1.2,
    compressorThreshold: -20,
    compressorRatio: 2.2,
    dryGain: 0.96,
    reverbSend: 0.09,
    reverbReturn: 0.32,
    vocalBusGain: 1.3,
    mixBusGain: 0.96
  };
}

export function createGentleNoiseGate(context: AudioContext): Readonly<{
  input: GainNode;
  output: GainNode;
  stop: () => void;
}> {
  const input = context.createGain();
  const output = context.createGain();
  output.gain.value = 0.05;
  input.connect(output);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  input.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let frame = 0;
  let closed = false;

  const tick = () => {
    if (closed || context.state === "closed") return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
    const rms = Math.sqrt(sum / data.length);
    const now = context.currentTime;
    // 발성하지 않는 조용한 구간(rms < 0.007)은 게인을 0.04(-28dB)로 대폭 낮춰
    // 방 안의 먼 소음과 공조기 소리가 들어가지 않도록 확실하게 차단한다.
    // 발성 시(rms >= 0.016)에는 20ms 빠른 어택으로 첫 음절 끊김을 방지하고,
    // 발성이 끝날 때는 약 140ms 릴리즈로 부드럽게 닫아 자연스러운 여운을 유지한다.
    const target = rms < 0.007 ? 0.04 : rms < 0.016 ? 0.45 : 1;
    output.gain.cancelScheduledValues(now);
    output.gain.setTargetAtTime(target, now, target < output.gain.value ? 0.14 : 0.02);
    frame = window.setTimeout(tick, 35);
  };
  tick();

  return {
    input,
    output,
    stop: () => {
      closed = true;
      window.clearTimeout(frame);
    }
  };
}

export function karaokeBackingGainForRms(rms: number): number {
  return rms > 0.025 ? 0.96 : 1.06;
}

export function createVocalMonitor(
  context: AudioContext,
  source: AudioNode,
  backingMaster: GainNode,
  onInputLevel?: (level: number) => void,
  mode: RecordingCaptureMode = "personal"
): () => void {
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.78;
  source.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let timer = 0;
  let stopped = false;

  const tick = () => {
    if (stopped || context.state === "closed") return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += sample * sample;
    const rms = Math.sqrt(sum / data.length);
    // 기준값을 낮춰 레벨 미터가 실제 입력에 더 민감하게 반응하도록 한다
    onInputLevel?.(Math.min(1, rms / (mode === "choir" ? 0.045 : 0.06)));
    const targetBacking = mode === "choir" ? 1 : karaokeBackingGainForRms(rms);
    backingMaster.gain.setTargetAtTime(targetBacking, context.currentTime,
      mode === "choir" ? 0.18 : rms > 0.025 ? 0.09 : 0.22);
    timer = window.setTimeout(tick, 70);
  };
  tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    onInputLevel?.(0);
  };
}
