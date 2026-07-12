import { Soundfont } from "smplr";
import { INSTRUMENTS, type InstrumentId } from "../music/instruments";

type LoadedInstrument = Readonly<{ kind: "soundfont"; player: Soundfont }>;

const soundFontIds = new Set<string>([
  ...INSTRUMENTS.map((inst) => inst.id),
  "piano",
  "guitar",
  "violin",
  "flute",
  "trumpet",
  "xylophone",
  "gayageum",
  "daegeum",
  "haegeum",
  "piri"
]);

const loaded = new Map<string, Promise<LoadedInstrument>>();
const nodeIds = new WeakMap<object, number>();
let nextNodeId = 1;
let tempContext: AudioContext | null = null;

function nodeKey(node: object): number {
  const existing = nodeIds.get(node);
  if (existing) return existing;
  const id = nextNodeId;
  nextNodeId += 1;
  nodeIds.set(node, id);
  return id;
}

function cacheKey(context: BaseAudioContext, destination: AudioNode, id: InstrumentId): string {
  return `${id}:${nodeKey(context)}:${nodeKey(destination)}`;
}

function mapInstrumentId(id: InstrumentId): string {
  switch (id) {
    case "piano":
      return "acoustic_grand_piano";
    case "guitar":
      return "acoustic_guitar_nylon";
    case "violin":
      return "violin";
    case "flute":
      return "flute";
    case "trumpet":
      return "trumpet";
    case "xylophone":
      return "xylophone";
    case "gayageum":
      return "acoustic_guitar_nylon";
    case "daegeum":
      return "flute";
    case "haegeum":
      return "violin";
    case "piri":
      return "clarinet";
    default:
      return id;
  }
}

async function loadSoundFont(
  context: BaseAudioContext,
  destination: AudioNode,
  id: InstrumentId
): Promise<LoadedInstrument> {
  const player = Soundfont(context, {
    instrument: mapInstrumentId(id),
    kit: "FluidR3_GM",
    destination
  });
  await player.ready;
  return { kind: "soundfont", player };
}

export function loadSampleInstrument(
  context: BaseAudioContext,
  destination: AudioNode,
  id: InstrumentId
): Promise<LoadedInstrument> {
  const key = cacheKey(context, destination, id);
  const existing = loaded.get(key);
  if (existing) return existing;
  const pending = loadSoundFont(context, destination, id);
  loaded.set(key, pending);
  pending.catch(() => loaded.delete(key));
  return pending;
}

export async function preloadInstrument(id: InstrumentId): Promise<void> {
  try {
    tempContext ??= new AudioContext();
    const player = Soundfont(tempContext, {
      instrument: mapInstrumentId(id),
      kit: "FluidR3_GM"
    });
    await player.ready;
  } catch (error) {
    console.warn(`${id} 악기 프리로드 실패:`, error);
  }
}

export function queueSampleNote(
  instrument: LoadedInstrument,
  _context: BaseAudioContext,
  _destination: AudioNode,
  midi: number,
  start: number,
  duration: number,
  volume: number
): void {
  const velocity = Math.max(1, Math.min(127, Math.round(volume * 9.0 * 127)));
  instrument.player.start({
    note: midi,
    velocity,
    time: start,
    duration
  });
}

export function isSampleBackedInstrument(id: InstrumentId): boolean {
  return soundFontIds.has(id);
}

export function resetSampleInstrumentCache(): void {
  loaded.clear();
}
