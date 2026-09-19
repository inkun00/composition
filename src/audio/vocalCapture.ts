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
      // echoCancellation: true
      // 이어폰/스피커 재생음이 마이크로 물리적/전기적으로 유입되는 것을 방지하기 위해 AEC 활성화
      echoCancellation: true,
      // 개인 녹음은 주변 일상 잡음을 억제하기 위해 noiseSuppression을 활성화한다
      noiseSuppression: true,
      // AGC를 꺼서 조용할 때 마이크 민감도가 자동 폭증해 먼 소리를 다 녹음하는 현상을 차단한다
      autoGainControl: false,
      channelCount: 1
    },
    useNoiseGate: true,
    highPassHz: 90,   // 90Hz: 책상 진동 및 실내 저주파 웅웅거림을 억제하면서 보컬의 온기는 보존
    lowPassHz: 16000, // 16kHz까지 확장해 공기감 및 선명도 확보
    mudCutDb: -1.4,
    presenceDb: 1.2,
    deEsserDb: -1.2,
    compressorThreshold: -16, // 과도한 압축으로 미세 누음이 펌핑 증폭되는 것을 방지
    compressorRatio: 2.0,
    dryGain: 1.0,
    // 실시간 녹음 시 리버브를 극소화하여 이어폰 누음이 동굴 메아리로 변질되는 현상 원천 차단
    // (공간계 리버브는 녹음 후 완성 단계의 후가공 프리셋에서 처리)
    reverbSend: 0.008,
    reverbReturn: 0.03,
    vocalBusGain: 1.0, // 1.2 → 1.0: 마이크 트랙 과증폭 방지
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
  output.gain.value = 0.01;
  input.connect(output);

  // 음성 감지용 사이드체인 필터: 220Hz 하이패스로 반주 베이스·드럼 누음에 의한 게이트 오작동 방지
  const detectionFilter = context.createBiquadFilter();
  detectionFilter.type = "highpass";
  detectionFilter.frequency.value = 220;
  detectionFilter.Q.value = 0.7;
  input.connect(detectionFilter);

  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
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
    // 발성하지 않는 조용한 구간 및 일상 실내 소음(rms < 0.015)은 게인을 0.01(-40dB)로 확실하게 닫아
    // 방 안의 잔류 소음 및 이어폰 누음이 들어가지 않도록 완벽히 차단한다.
    // 발성 시작 시(rms >= 0.03)에는 15ms 빠른 어택으로 첫 음절을 즉각 통과시키고,
    // 발성이 끝날 때는 약 140ms 릴리즈로 부드럽게 닫아 자연스러운 여운을 유지한다.
    const target = rms < 0.015 ? 0.01 : rms < 0.03 ? 0.35 : 1;
    output.gain.cancelScheduledValues(now);
    output.gain.setTargetAtTime(target, now, target < output.gain.value ? 0.14 : 0.015);
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
