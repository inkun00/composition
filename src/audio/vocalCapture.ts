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

export function vocalCaptureProfile(mode: RecordingCaptureMode): VocalCaptureProfile {
  if (mode === "choir") {
    return {
      constraints: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 }
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
      vocalBusGain: 1.12,
      mixBusGain: 0.94
    };
  }
  return {
    constraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      channelCount: 1
    },
    useNoiseGate: true,
    highPassHz: 90,
    lowPassHz: 12000,
    mudCutDb: -1.4,
    presenceDb: 1.2,
    deEsserDb: -1.2,
    compressorThreshold: -20,
    compressorRatio: 2.2,
    dryGain: 0.96,
    reverbSend: 0.09,
    reverbReturn: 0.32,
    vocalBusGain: 1.08,
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
  output.gain.value = 0.9;
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
    const target = rms < 0.006 ? 0.65 : rms < 0.012 ? 0.86 : 1;
    output.gain.cancelScheduledValues(now);
    output.gain.setTargetAtTime(target, now, target < output.gain.value ? 0.18 : 0.055);
    frame = window.setTimeout(tick, 45);
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
    onInputLevel?.(Math.min(1, rms / (mode === "choir" ? 0.075 : 0.11)));
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
