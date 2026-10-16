import { Mp3Encoder } from "@breezystack/lamejs";
import { calculateVocalMakeupGain } from "./vocalCapture";

export type KaraokePostProcessPreset = "natural" | "clear" | "soft" | "loud" | "singer";

function floatTo16BitPcm(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

export function encodeAudioBufferToMp3(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, 192);
  const chunks: BlobPart[] = [];
  const blockSize = 1152;
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : null;

  for (let offset = 0; offset < left.length; offset += blockSize) {
    const leftChunk = floatTo16BitPcm(left.subarray(offset, offset + blockSize));
    const encoded = right
      ? encoder.encodeBuffer(leftChunk, floatTo16BitPcm(right.subarray(offset, offset + blockSize)))
      : encoder.encodeBuffer(leftChunk);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }
  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(new Uint8Array(finalChunk));
  return new Blob(chunks, { type: "audio/mpeg" });
}

export function renderedAudioPeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let index = 0; index < samples.length; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]));
    }
  }
  return peak;
}

function createRoomImpulse(context: BaseAudioContext, seconds = 0.65, decay = 2.4): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const impulse = context.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const fade = (1 - index / length) ** decay;
      data[index] = (Math.random() * 2 - 1) * fade * 0.22;
    }
  }
  return impulse;
}

export async function renderProcessedKaraokeMp3(
  buffer: AudioBuffer,
  preset: KaraokePostProcessPreset
): Promise<Blob> {
  const context = new OfflineAudioContext(
    Math.min(2, buffer.numberOfChannels),
    buffer.length,
    buffer.sampleRate
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  const inputGain = context.createGain();
  const tone = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const outputGain = context.createGain();

  tone.type = "peaking";
  tone.frequency.value = 2600;
  tone.Q.value = 0.9;
  tone.gain.value = 0;
  inputGain.gain.value = 1;
  outputGain.gain.value = 1;
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 2.2;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.18;

  if (preset === "clear") {
    tone.frequency.value = 3400;
    tone.gain.value = 3.6;
    outputGain.gain.value = 1.02;
  } else if (preset === "soft") {
    tone.frequency.value = 4200;
    tone.gain.value = -1.8;
    outputGain.gain.value = 0.96;
  } else if (preset === "loud") {
    compressor.threshold.value = -20;
    compressor.ratio.value = 4.2;
    outputGain.gain.value = 1.18;
  } else if (preset === "singer") {
    tone.frequency.value = 3000;
    tone.gain.value = 1.2;
    compressor.threshold.value = -16;
    compressor.ratio.value = 2.8;
    outputGain.gain.value = 0.96;
  }

  source.connect(inputGain).connect(tone).connect(compressor).connect(outputGain).connect(context.destination);
  if (preset === "singer") {
    const spaceSend = context.createGain();
    spaceSend.gain.value = 0.18;
    const reverb = context.createConvolver();
    reverb.buffer = createRoomImpulse(context, 1.15, 2.1);
    const reverbReturn = context.createGain();
    reverbReturn.gain.value = 0.5;
    const delay = context.createDelay(0.35);
    delay.delayTime.value = 0.11;
    const delayGain = context.createGain();
    delayGain.gain.value = 0.08;
    const feedback = context.createGain();
    feedback.gain.value = 0.18;
    outputGain.connect(spaceSend).connect(reverb).connect(reverbReturn).connect(context.destination);
    outputGain.connect(delay).connect(delayGain).connect(context.destination);
    delayGain.connect(feedback).connect(delay);
  }
  source.start();
  const rendered = await context.startRendering();
  return encodeAudioBufferToMp3(rendered);
}

export async function renderKaraokePreviewMix(
  vocalBuffer: AudioBuffer,
  backingBuffer: AudioBuffer,
  backingVolume: number,
  introSeconds = 0,
  outroSeconds = 0
): Promise<Readonly<{ blob: Blob; audioBuffer: AudioBuffer }>> {
  const channels = Math.min(2, Math.max(vocalBuffer.numberOfChannels, backingBuffer.numberOfChannels));
  const sampleRate = Math.max(vocalBuffer.sampleRate, backingBuffer.sampleRate);
  const length = Math.max(vocalBuffer.length, backingBuffer.length);
  const context = new OfflineAudioContext(channels, length, sampleRate);
  const vocal = context.createBufferSource();
  const backing = context.createBufferSource();
  vocal.buffer = vocalBuffer;
  backing.buffer = backingBuffer;
  const vocalGain = context.createGain();
  const backingGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  vocalGain.gain.value = calculateVocalMakeupGain(vocalBuffer, introSeconds, outroSeconds);
  backingGain.gain.value = Math.max(0.02, Math.min(1.0, backingVolume * 0.45));
  compressor.threshold.value = -3;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.1;
  vocal.connect(vocalGain).connect(compressor);
  backing.connect(backingGain).connect(compressor);
  compressor.connect(context.destination);
  vocal.start();
  backing.start();
  const audioBuffer = await context.startRendering();
  return { audioBuffer, blob: encodeAudioBufferToMp3(audioBuffer) };
}
