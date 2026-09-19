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
  return {
    constraints: {
      // 원음 녹음: 브라우저/기기의 인위적인 음성 왜곡 및 에코 캔슬러에 의한 보컬 차단 방지
      echoCancellation: false,
      noiseSuppression: false,
      channelCount: 1
    },
    useNoiseGate: false,
    highPassHz: 20,
    lowPassHz: 20000,
    mudCutDb: 0,
    presenceDb: 0,
    deEsserDb: 0,
    compressorThreshold: 0,
    compressorRatio: 1,
    dryGain: 1,
    reverbSend: 0,
    reverbReturn: 0,
    vocalBusGain: 1.0,
    mixBusGain: 1.0
  };
}

export function createGentleNoiseGate(context: AudioContext): Readonly<{
  input: GainNode;
  output: GainNode;
  stop: () => void;
}> {
  const input = context.createGain();
  const output = context.createGain();
  output.gain.value = 0.5;
  input.connect(output);

  // 음성 감지용 사이드체인 필터: 75Hz 초저역 럼블만 차단하고 인간 목소리 기저음(100~300Hz)은 온전히 보존
  const detectionFilter = context.createBiquadFilter();
  detectionFilter.type = "highpass";
  detectionFilter.frequency.value = 75;
  detectionFilter.Q.value = 0.7;
  input.connect(detectionFilter);

  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;
  detectionFilter.connect(analyser);
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
    // 발성하지 않는 조용한 구간(rms < 0.0025)에서도 게인을 0.40(-8dB)까지만 완만하게 낮추어
    // 여린 목소리나 끝음 처리가 잘려나가지 않도록 보호한다.
    // 작은 목소리(rms >= 0.0025)는 0.80, 정상 가창(rms >= 0.005)은 1.0(100%)으로 개방한다.
    const target = rms < 0.0025 ? 0.40 : rms < 0.005 ? 0.80 : 1;
    output.gain.cancelScheduledValues(now);
    output.gain.setTargetAtTime(target, now, target < output.gain.value ? 0.22 : 0.012);
    frame = window.setTimeout(tick, 30);
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

/**
 * 녹음된 보컬 오디오를 분석하여 최적의 메이크업 게인을 계산한다.
 * 인트로 반주 구간이나 종료 터치음의 단발성 팝 노이즈에 속지 않도록,
 * 실제 노래 구간의 유의미한 가창 프레임들을 기반으로 견고하게 측정한다.
 */
export function calculateVocalMakeupGain(
  buffer: AudioBuffer,
  introSeconds = 0,
  outroSeconds = 0
): number {
  if (buffer.length === 0) return 1.0;
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration || (sampleRate > 0 ? buffer.length / sampleRate : 0);
  const effectiveIntro = introSeconds > 0 ? introSeconds : Math.min(8.0, duration * 0.18);
  const effectiveOutro = outroSeconds > 0 ? outroSeconds : Math.min(5.0, duration * 0.12);

  const startOffset = Math.min(buffer.length, Math.round(sampleRate * effectiveIntro));
  const endOffset = Math.max(startOffset, buffer.length - Math.round(sampleRate * effectiveOutro));

  const frameSize = Math.floor(sampleRate * 0.05);
  const frameCount = Math.floor((endOffset - startOffset) / frameSize);
  const framePeaks: number[] = [];

  for (let f = 0; f < frameCount; f += 1) {
    let fPeak = 0;
    let fSumSq = 0;
    const fStart = startOffset + f * frameSize;
    for (let i = 0; i < frameSize; i += 2) {
      const v = Math.abs(channel[fStart + i]);
      if (v > fPeak) fPeak = v;
      fSumSq += v * v;
    }
    const fRms = Math.sqrt(fSumSq / (frameSize / 2));
    if (fRms > 0.003 && fPeak > 0.006) {
      framePeaks.push(fPeak);
    }
  }

  let measuredPeak = 0;
  if (framePeaks.length >= 4) {
    framePeaks.sort((a, b) => a - b);
    const p95 = Math.min(framePeaks.length - 1, Math.floor(framePeaks.length * 0.95));
    measuredPeak = framePeaks[p95];
  } else {
    for (let i = startOffset; i < endOffset; i += 4) {
      const abs = Math.abs(channel[i]);
      if (abs > measuredPeak) measuredPeak = abs;
    }
  }

  if (measuredPeak < 0.003) return 1.0;
  return Math.max(1.0, Math.min(18.0, 0.76 / measuredPeak));
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
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);

  // 모바일 브라우저(iOS Safari / Android Chrome)에서 AnalyserNode가 context.destination으로의
  // 오디오 경로가 없을 때 렌더링 퀀텀을 비활성화하여 데이터가 0으로 고정되는 현상을 방지
  const dummyGain = context.createGain();
  dummyGain.gain.value = 0;
  analyser.connect(dummyGain);
  try {
    dummyGain.connect(context.destination);
  } catch {
    // context 상태에 따른 연결 예외 방지
  }

  const data = new Float32Array(analyser.fftSize);
  const byteData = new Uint8Array(analyser.fftSize);
  let timer = 0;
  let stopped = false;

  const tick = () => {
    if (stopped || context.state === "closed") return;
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += sample * sample;
    let rms = Math.sqrt(sum / data.length);

    // 일부 모바일 브라우저에서 FloatTimeDomainData가 0만 반환하는 환경 대응
    if (rms === 0 && typeof analyser.getByteTimeDomainData === "function") {
      analyser.getByteTimeDomainData(byteData);
      let byteSum = 0;
      for (let i = 0; i < byteData.length; i += 1) {
        const diff = (byteData[i] - 128) / 128;
        byteSum += diff * diff;
      }
      rms = Math.sqrt(byteSum / byteData.length);
    }

    // 원음 마이크 입력 감도 및 지각 음량 스케일링:
    // 미세 기저 소음(rms < 0.0008)은 0%로 정적 유지,
    // 부드러운 가창부터 시원한 가창까지 25% ~ 80%("좋아요") 구간으로 생동감 있게 반응
    const sensitivity = mode === "choir" ? 0.045 : 0.035;
    const rawLevel = Math.min(1, rms / sensitivity);
    const displayLevel = rms < 0.0008 ? 0 : Math.min(1, Math.sqrt(rawLevel));
    onInputLevel?.(displayLevel);

    const targetBacking = mode === "choir" ? 1 : karaokeBackingGainForRms(rms);
    backingMaster.gain.setTargetAtTime(targetBacking, context.currentTime,
      mode === "choir" ? 0.18 : rms > 0.025 ? 0.09 : 0.22);
    timer = window.setTimeout(tick, 50);
  };
  tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    try {
      dummyGain.disconnect();
    } catch {
      // ignore
    }
    onInputLevel?.(0);
  };
}
