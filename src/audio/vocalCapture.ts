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
        // 합창 녹음 시에도 스피커 반주음이 마이크로 재유입되어 울리는 현상을 막기 위해 AEC 활성화
        echoCancellation: true,
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
      reverbSend: 0.002,
      reverbReturn: 0.02,
      vocalBusGain: 1.0,
      mixBusGain: 0.94
    };
  }
  return {
    constraints: {
      // 이어폰/스피커 재생음이 마이크로 유입되는 것을 방지하기 위해 AEC 활성화
      echoCancellation: true,
      // 스마트폰의 다중 마이크 빔포밍을 활성화하여 바람소리, 입김, 주변 공기 난류를 차단한다
      noiseSuppression: true,
      // AGC를 꺼서 조용할 때 마이크 민감도가 자동 폭증해 먼 소리를 다 녹음하는 현상을 차단한다
      autoGainControl: false,
      channelCount: 1
    },
    useNoiseGate: true,
    highPassHz: 110,  // 110Hz: 마이크 터치 및 100Hz 이하 저역 럼블/부밍을 차단
    lowPassHz: 16000, // 16kHz까지 확장해 공기감 및 선명도 확보
    mudCutDb: -4.5,   // 120~250Hz 근접 효과로 인한 웅웅거림과 머드 대역을 -4.5dB 시원하게 감쇄
    presenceDb: 4.2,  // 3.4kHz 자음/성대 명료도 대역을 +4.2dB 부스트하여 가사 전달력 극대화
    deEsserDb: -1.0,
    compressorThreshold: -18,
    compressorRatio: 2.4,
    dryGain: 1.25,    // 드라이 게인 +2dB
    // 실시간 녹음 시 리버브를 극소화하여 이어폰 누음이 동굴 메아리로 변질되는 현상 원천 차단
    // (공간계 리버브는 녹음 후 완성 단계의 후가공 프리셋에서 처리)
    reverbSend: 0.008,
    reverbReturn: 0.03,
    vocalBusGain: 2.8, // 하드웨어 AGC 해제 시 저하되는 마이크 캡슐 신호를 +9dB 프리앰프 보정
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
  analyser.smoothingTimeConstant = 0.62;
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
    // 모바일 마이크의 낮은 캡슐 신호(RMS 0.003~0.018)와 PC(0.03~0.08) 모두에서
    // 게이지가 생동감 있게 반응하도록 비선형(제곱근) 지각 음량 커브 적용
    const sensitivity = mode === "choir" ? 0.035 : 0.022;
    const rawLevel = Math.min(1, rms / sensitivity);
    const displayLevel = rms < 0.0015 ? 0 : Math.min(1, Math.sqrt(rawLevel));
    onInputLevel?.(displayLevel);
    const targetBacking = mode === "choir" ? 1 : karaokeBackingGainForRms(rms);
    backingMaster.gain.setTargetAtTime(targetBacking, context.currentTime,
      mode === "choir" ? 0.18 : rms > 0.025 ? 0.09 : 0.22);
    timer = window.setTimeout(tick, 60);
  };
  tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    onInputLevel?.(0);
  };
}
