export const BEAT_SAMPLE_RATES = [0.988, 0.994, 1, 1.006, 1.012] as const;
const PROCESSOR_TAIL_SECONDS = .12;

function leadingFrameCount(sampleRate: number): number {
  return 128 * Math.ceil(sampleRate * .12 / 128);
}

export function preparedBeatLeadSeconds(sampleRate: number): number {
  return leadingFrameCount(sampleRate) / sampleRate;
}

type Profile = Readonly<{
  filterType: BiquadFilterType;
  frequency: number;
  filterGain: number;
  q?: number;
}>;

function frameCount(buffer: AudioBuffer, sampleRate: number, rate: number): number {
  return Math.ceil((buffer.duration / rate + PROCESSOR_TAIL_SECONDS) * sampleRate);
}

export function preparedBeatSampleBytes(buffer: AudioBuffer, sampleRate: number): number {
  const channels = Math.min(2, buffer.numberOfChannels);
  return BEAT_SAMPLE_RATES.reduce((bytes, rate) =>
    bytes + frameCount(buffer, sampleRate, rate) * channels * Float32Array.BYTES_PER_ELEMENT, 0);
}

/** Preserve independent-hit filtering/compression without hundreds of persistent DSP chains. */
export async function prepareBeatSampleVariants(buffer: AudioBuffer, profile: Profile,
  sampleRate: number): Promise<readonly AudioBuffer[]> {
  return Promise.all(BEAT_SAMPLE_RATES.map(async (rate) => {
    const channels = Math.min(2, buffer.numberOfChannels);
    const frames = frameCount(buffer, sampleRate, rate);
    // Let filter coefficients and the compressor settle on silence, just like
    // a hit scheduled in the future of the full song's audio context.
    const leadingFrames = leadingFrameCount(sampleRate);
    const context = new OfflineAudioContext(channels, frames + leadingFrames, sampleRate);
    const source = context.createBufferSource();
    const tone = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    tone.type = profile.filterType;
    tone.frequency.value = profile.frequency;
    tone.gain.value = profile.filterGain;
    if (profile.q !== undefined) tone.Q.value = profile.q;
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 2;
    compressor.attack.value = .006;
    compressor.release.value = .09;
    source.connect(tone).connect(compressor).connect(context.destination);
    try {
      source.start(leadingFrames / sampleRate);
      const rendered = await context.startRendering();
      const prepared = context.createBuffer(channels, frames, sampleRate);
      for (let channel = 0; channel < channels; channel += 1) {
        prepared.copyToChannel(rendered.getChannelData(channel).subarray(leadingFrames), channel);
      }
      return prepared;
    } finally {
      source.disconnect();
      tone.disconnect();
      compressor.disconnect();
    }
  }));
}
