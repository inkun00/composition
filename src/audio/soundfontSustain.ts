import { SampleLoader, type SmplrOptions, type SmplrPreset, type SoundfontOptions } from "smplr";

// FluidR3 loop metadata is available and the six-second renders are checked in
// verify-sample-sustain.mjs. Plucked/struck instruments keep their natural decay.
const sustainedInstruments = new Set(["clarinet", "recorder", "flute", "violin", "cello"]);

/** Join the sustain tail to the samples immediately preceding its loop start. */
export function smoothSoundfontLoops(preset: SmplrPreset, buffers: Map<string, AudioBuffer>): void {
  const processed = new Set<string>();
  for (const group of preset.groups) {
    for (const region of group.regions) {
      if (!region.loop || region.loopStart === undefined || region.loopEnd === undefined) continue;
      const buffer = buffers.get(region.sample);
      if (!buffer) continue;
      const start = Math.round(region.loopStart * buffer.sampleRate);
      const end = Math.min(buffer.length, Math.round(region.loopEnd * buffer.sampleRate));
      const fade = Math.min(Math.round(buffer.sampleRate * .002), Math.floor((end - start) / 4), start);
      if (fade < 2 || start < 0 || end <= start) continue;
      const key = `${region.sample}:${start}:${end}`;
      if (processed.has(key)) continue;
      processed.add(key);
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let frame = 0; frame < fade; frame += 1) {
          const blend = (1 - Math.cos(Math.PI * (frame + 1) / fade)) / 2;
          const target = data[start - fade + frame];
          const index = end - fade + frame;
          data[index] = data[index] * (1 - blend) + target * blend;
        }
      }
    }
  }
}

export function soundfontSustainOptions(
  context: BaseAudioContext,
  instrumentId: string
): SoundfontOptions & Partial<SmplrOptions> {
  if (!sustainedInstruments.has(instrumentId)) return {};
  const loader = SampleLoader(context);
  const smoothLoader: SampleLoader = {
    load(preset, options) {
      // Soundfont supplies decoded buffers to its public SampleLoader hook.
      // Smoothing here retains the attack and only touches the 2 ms loop seam.
      if (typeof options !== "function" && options?.buffers) smoothSoundfontLoops(preset, options.buffers);
      return typeof options === "function" ? loader.load(preset, options) : loader.load(preset, options);
    }
  };
  return { loadLoopData: true, loader: smoothLoader };
}
