import { accompanimentInstrumentProfile } from "../music/accompaniment";
import { accompanimentTrackSettings, type AccompanimentTrackMixMap } from "../music/accompanimentMix";
import { beatPatternInstrumentIds } from "../music/beatPattern";
import { type InstrumentId } from "../music/instruments";
import { preloadBeatSamples } from "./beatSamples";
import { loadSampleInstrument, releaseSampleInstrument } from "./samplePlayer";
import type { AccompanimentOptions } from "./accompanimentScore";

export type AccompanimentTrackState = Readonly<{
  instrumentId: string;
  status: "loading" | "ready" | "error" | "playing" | "rest" | "muted";
  level: number;
  message?: string;
}>;

export type AccompanimentLayer = {
  id: InstrumentId;
  sample: Awaited<ReturnType<typeof loadSampleInstrument>> | null;
  destination: GainNode;
  muted: boolean;
};

type Runtime = {
  context: BaseAudioContext;
  options?: AccompanimentOptions;
  layers: AccompanimentLayer[];
  analysers: AnalyserNode[];
  timer?: number;
  stateListener?: () => void;
  disposed: boolean;
  states: Map<string, AccompanimentTrackState>;
};

const runtimes = new Map<BaseAudioContext, Runtime>();

/** Every retry gets a fresh player, including when a network request stalls. */
export async function loadSampleWithTimeout(
  context: BaseAudioContext,
  destination: AudioNode,
  instrumentId: InstrumentId,
  timeoutMs = 8000
) {
  let timeout: number | undefined;
  try {
    return await Promise.race([
      loadSampleInstrument(context, destination, instrumentId),
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error("악기 샘플 준비 시간 초과")), timeoutMs);
      })
    ]);
  } catch (error) {
    releaseSampleInstrument(context, destination, instrumentId);
    throw error;
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

function emit(runtime: Runtime, state: AccompanimentTrackState): void {
  const previous = runtime.states.get(state.instrumentId);
  // Avoid rerendering the mixer for an unchanged silent track every 80 ms.
  if (previous?.status === state.status && previous.message === state.message &&
    Math.abs(previous.level - state.level) < .006) return;
  runtime.states.set(state.instrumentId, state);
  runtime.options?.onTrackState?.(state);
}

function applyMix(runtime: Runtime): void {
  runtime.layers.forEach((layer, index) => {
    const settings = accompanimentTrackSettings(runtime.options?.trackMix, layer.id);
    const solo = runtime.options?.soloInstrumentId;
    layer.muted = solo ? solo !== layer.id : settings.muted;
    const gain = layer.muted ? 0 : settings.volume / 100 * accompanimentInstrumentProfile(layer.id, index).gain;
    layer.destination.gain.value = gain;
    if (layer.sample) emit(runtime, { instrumentId: layer.id,
      status: layer.muted || gain === 0 ? "muted" : "rest", level: 0 });
  });
}

/** Change gain buses, rather than MIDI velocities, so ongoing held notes respond too. */
export function setAccompanimentTrackMix(trackMix: AccompanimentTrackMixMap): void {
  runtimes.forEach((runtime) => {
    if (typeof OfflineAudioContext !== "undefined" && runtime.context instanceof OfflineAudioContext) return;
    if (runtime.options) runtime.options = { ...runtime.options, trackMix };
    applyMix(runtime);
  });
}

function startMeter(runtime: Runtime): void {
  const offline = typeof OfflineAudioContext !== "undefined" && runtime.context instanceof OfflineAudioContext;
  if (offline || !runtime.options?.onTrackState) return;
  const buffers = runtime.analysers.map((analyser) => new Float32Array(analyser.fftSize));
  const read = () => {
    if (runtime.disposed) return;
    runtime.layers.forEach((layer, index) => {
      if (!layer.sample) return;
      const muted = layer.muted || layer.destination.gain.value === 0;
      let rms = 0;
      if (!muted && runtime.context.state === "running") {
        const buffer = buffers[index];
        runtime.analysers[index].getFloatTimeDomainData(buffer);
        rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
      }
      // Level represents measured post-fader audio, with display-only sensitivity.
      emit(runtime, { instrumentId: layer.id, status: muted ? "muted" : rms > .0001 ? "playing" : "rest",
        level: Math.max(0, Math.min(1, rms * 5)) });
    });
  };
  runtime.stateListener = () => {
    if (runtime.timer !== undefined) window.clearInterval(runtime.timer);
    runtime.timer = undefined;
    read();
    if (runtime.context.state === "running") runtime.timer = window.setInterval(read, 80);
  };
  runtime.context.addEventListener("statechange", runtime.stateListener);
  runtime.stateListener();
}

export async function loadAccompanimentLayers(
  context: BaseAudioContext,
  destination: AudioNode,
  accompaniment?: AccompanimentOptions
): Promise<AccompanimentLayer[]> {
  releaseAccompanimentRuntime(context);
  const runtime: Runtime = { context, options: accompaniment, layers: [], analysers: [],
    disposed: false, states: new Map() };
  runtimes.set(context, runtime);
  if (accompaniment?.beatPattern?.length && !accompaniment.soloInstrumentId) {
    await preloadBeatSamples(context, beatPatternInstrumentIds(accompaniment.beatPattern));
  }
  if (runtime.disposed || context.state === "closed") return [];
  runtime.layers = [...new Set(accompaniment?.instrumentIds ?? [])].map((id) => {
    const bus = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    bus.connect(analyser).connect(destination);
    runtime.analysers.push(analyser);
    return { id, sample: null, destination: bus, muted: false };
  });
  applyMix(runtime);
  await Promise.all(runtime.layers.map(async (layer) => {
    emit(runtime, { instrumentId: layer.id, status: "loading", level: 0 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (runtime.disposed || context.state === "closed") return;
      try {
        const sample = await loadSampleWithTimeout(context, layer.destination, layer.id, attempt === 0 ? 8000 : 12000);
        if (runtime.disposed || (context.state as string) === "closed") {
          releaseSampleInstrument(context, layer.destination, layer.id);
          return;
        }
        layer.sample = sample;
        emit(runtime, { instrumentId: layer.id, status: "ready", level: 0 });
        return;
      } catch (error) {
        if (runtime.disposed) return;
        if (attempt === 0) {
          emit(runtime, { instrumentId: layer.id, status: "loading", level: 0,
            message: "악기 소리를 다시 준비하고 있어요." });
        } else {
          console.warn(`${layer.id} 반주 샘플 준비 실패`, error);
          emit(runtime, { instrumentId: layer.id, status: "error", level: 0,
            message: "악기 소리를 불러오지 못했어요. 다시 재생해 주세요." });
        }
      }
    }
  }));
  if (!runtime.disposed) startMeter(runtime);
  return runtime.layers;
}

/** Release buses, sample players and polling for this playback or render only. */
export function releaseAccompanimentRuntime(context: BaseAudioContext): void {
  const runtime = runtimes.get(context);
  if (!runtime) return;
  runtime.disposed = true;
  if (runtime.timer !== undefined) window.clearInterval(runtime.timer);
  if (runtime.stateListener) context.removeEventListener("statechange", runtime.stateListener);
  runtime.layers.forEach((layer, index) => {
    releaseSampleInstrument(context, layer.destination, layer.id);
    layer.destination.disconnect();
    runtime.analysers[index].disconnect();
    const previous = runtime.states.get(layer.id);
    emit(runtime, previous?.status === "error" ? { ...previous, level: 0 } :
      { instrumentId: layer.id, status: "ready", level: 0 });
  });
  runtimes.delete(context);
}
