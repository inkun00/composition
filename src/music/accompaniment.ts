import type { InstrumentId } from "./instruments";
import type { Meter } from "./meter";

export const MAX_ACCOMPANIMENT_INSTRUMENTS = 4;
export const MAX_SAVED_ACCOMPANIMENT_INSTRUMENTS = 10;

export type AccompanimentStyleId =
  | "strum" | "arpeggio" | "riff" | "folk" | "bossa" | "shuffle" | "comping"
  | "kpop" | "anime_rock" | "children_song" | "animation_ost" | "opera" | "musical";

export type AccompanimentStyle = Readonly<{
  id: AccompanimentStyleId;
  name: string;
  alias: string;
  description: string;
  category: "genre" | "playing";
  recommendedInstrumentIds?: readonly InstrumentId[];
}>;

export type AccompanimentEvent = Readonly<{
  offsetBeats: number;
  durationBeats: number;
  voice: "root" | "chord" | "step";
  step?: number;
}>;

export type AccompanimentLayerRole = Readonly<{
  id: "bass" | "chords" | "high" | "pulse" | "middle" | "sparkle";
  label: string;
}>;

const ACCOMPANIMENT_LAYER_ROLES: readonly AccompanimentLayerRole[] = [
  { id: "bass", label: "낮은 받침" },
  { id: "chords", label: "화음 채우기" },
  { id: "high", label: "높은 꾸밈" },
  { id: "pulse", label: "리듬 받침" },
  { id: "middle", label: "가운데 연결" },
  { id: "sparkle", label: "반짝이는 끝" }
];

export function accompanimentLayerRole(index: number): AccompanimentLayerRole {
  return ACCOMPANIMENT_LAYER_ROLES[index % ACCOMPANIMENT_LAYER_ROLES.length];
}

export const ACCOMPANIMENT_STYLES: readonly AccompanimentStyle[] = [
  {
    id: "kpop", name: "K-POP 무대", alias: "K-POP", category: "genre",
    description: "단단한 낮은 음과 짧은 화음이 반복되어 힘차고 또렷해요.",
    recommendedInstrumentIds: ["electric_piano_1", "electric_bass_finger", "electric_guitar_muted", "string_ensemble_1"]
  },
  {
    id: "anime_rock", name: "애니 오프닝 록", alias: "애니 록", category: "genre",
    description: "빠른 밴드 드럼과 힘찬 기타가 후렴으로 갈수록 커져요.",
    recommendedInstrumentIds: ["electric_bass_pick", "distortion_guitar", "bright_acoustic_piano", "string_ensemble_1"]
  },
  {
    id: "children_song", name: "동요 놀이터", alias: "동요", category: "genre",
    description: "또렷한 박자 위에서 친숙한 악기들이 가볍게 주고받아요.",
    recommendedInstrumentIds: ["acoustic_grand_piano", "acoustic_bass", "acoustic_guitar_nylon", "glockenspiel"]
  },
  {
    id: "animation_ost", name: "애니메이션 OST", alias: "애니 OST", category: "genre",
    description: "피아노 물결 위에 현악과 관악이 펼쳐져 장면이 크게 느껴져요.",
    recommendedInstrumentIds: ["acoustic_grand_piano", "contrabass", "string_ensemble_1", "flute"]
  },
  {
    id: "opera", name: "오페라 극장", alias: "오페라", category: "genre",
    description: "긴 화음과 합창 소리가 천천히 이어져 웅장하게 들려요.",
    recommendedInstrumentIds: ["church_organ", "contrabass", "string_ensemble_1", "french_horn"]
  },
  {
    id: "musical", name: "뮤지컬 무대", alias: "뮤지컬", category: "genre",
    description: "또렷한 박자 사이로 금관과 목관이 대답해 장면 전환이 선명해요.",
    recommendedInstrumentIds: ["bright_acoustic_piano", "contrabass", "string_ensemble_1", "trumpet"]
  },
  { id: "strum", name: "시원한 쓸기 리듬", alias: "스트럼", category: "playing", description: "화음을 한 번에 쓸어 내려 시원하고 힘차게 받쳐 줘요." },
  { id: "arpeggio", name: "반짝이는 물결", alias: "아르페지오", category: "playing", description: "화음의 음을 차례로 연주해 노래를 돋보이게 해요." },
  { id: "riff", name: "귀에 쏙 반복 무늬", alias: "리프·루프", category: "playing", description: "짧은 음 무늬를 반복해 기억에 남는 반주를 만들어요." },
  { id: "folk", name: "따뜻한 통기타 걸음", alias: "포크", category: "playing", description: "낮은 음과 화음을 번갈아 연주해 담백하게 흘러가요." },
  { id: "bossa", name: "찰랑찰랑 라틴 리듬", alias: "보사노바", category: "playing", description: "살짝 흔들리는 리듬으로 나른하고 부드럽게 연주해요." },
  { id: "shuffle", name: "통통 튀는 리듬", alias: "셔플·바운스", category: "playing", description: "긴 음과 짧은 음이 짝을 이루어 경쾌하게 움직여요." },
  { id: "comping", name: "노래와 대화하는 화음", alias: "컴핑", category: "playing", description: "노래 사이의 빈 곳에 짧은 화음을 넣어 대화하듯 연주해요." }
];

export const ACCOMPANIMENT_GENRE_STYLES = ACCOMPANIMENT_STYLES.filter((style) => style.category === "genre");
export const ACCOMPANIMENT_PLAYING_STYLES = ACCOMPANIMENT_STYLES.filter((style) => style.category === "playing");

export type AccompanimentModeId =
  | "minimal" | "piano_ballad" | "acoustic" | "kpop_band" | "children_playground"
  | "anime_opening_rock" | "animation_cinema" | "bossa_cafe" | "musical_stage" | "opera_hall" | "bounce_band";

export type AccompanimentMode = Readonly<{
  id: AccompanimentModeId;
  icon: string;
  name: string;
  description: string;
  styleId: AccompanimentStyleId;
  instrumentIds: readonly InstrumentId[];
}>;

export const ACCOMPANIMENT_MODES: readonly AccompanimentMode[] = [
  {
    id: "minimal", icon: "🌙", name: "조용조용", description: "피아노와 낮은 음이 살짝 받쳐 줘요",
    styleId: "comping", instrumentIds: ["acoustic_grand_piano", "acoustic_bass"]
  },
  {
    id: "piano_ballad", icon: "🎹", name: "포근한 피아노", description: "피아노와 현악기가 부드럽게 이어져요",
    styleId: "arpeggio", instrumentIds: ["acoustic_grand_piano", "acoustic_bass", "cello", "string_ensemble_2"]
  },
  {
    id: "acoustic", icon: "🪵", name: "소풍 가는 기타", description: "통기타와 리코더가 가볍게 걸어가요",
    styleId: "folk", instrumentIds: ["acoustic_guitar_steel", "acoustic_bass", "acoustic_grand_piano", "recorder"]
  },
  {
    id: "children_playground", icon: "🎈", name: "통통 동요", description: "밝은 피아노와 종소리가 통통 튀어요",
    styleId: "children_song", instrumentIds: ["bright_acoustic_piano", "acoustic_bass", "acoustic_guitar_nylon", "glockenspiel"]
  },
  {
    id: "kpop_band", icon: "✨", name: "반짝 K-POP", description: "베이스와 짧은 기타가 힘차게 연주해요",
    styleId: "kpop", instrumentIds: ["electric_piano_1", "electric_bass_finger", "electric_guitar_muted", "string_ensemble_1"]
  },
  {
    id: "anime_opening_rock", icon: "⚡", name: "애니 오프닝 록",
    description: "강한 기타와 밴드 드럼이 후렴까지 힘차게 달려가요",
    styleId: "anime_rock",
    instrumentIds: ["electric_bass_pick", "distortion_guitar", "bright_acoustic_piano", "string_ensemble_1"]
  },
  {
    id: "bounce_band", icon: "🚂", name: "신나는 바운스", description: "짧고 긴 박자가 번갈아 신나게 달려요",
    styleId: "shuffle", instrumentIds: ["bright_acoustic_piano", "electric_bass_pick", "electric_guitar_muted", "marimba"]
  },
  {
    id: "animation_cinema", icon: "🎬", name: "영화 속 모험", description: "현악기와 플루트가 멋진 장면을 만들어요",
    styleId: "animation_ost", instrumentIds: ["acoustic_grand_piano", "contrabass", "string_ensemble_1", "flute"]
  },
  {
    id: "bossa_cafe", icon: "☕", name: "살랑살랑 카페", description: "부드러운 기타와 비브라폰이 흔들려요",
    styleId: "bossa", instrumentIds: ["electric_piano_1", "acoustic_bass", "acoustic_guitar_nylon", "vibraphone"]
  },
  {
    id: "musical_stage", icon: "🎭", name: "신나는 뮤지컬", description: "현악기와 트럼펫이 씩씩하게 대답해요",
    styleId: "musical", instrumentIds: ["bright_acoustic_piano", "contrabass", "string_ensemble_1", "trumpet"]
  },
  {
    id: "opera_hall", icon: "🏛️", name: "웅장한 무대", description: "오르간과 오케스트라가 크게 울려요",
    styleId: "opera", instrumentIds: ["church_organ", "contrabass", "string_ensemble_1", "french_horn"]
  }
];

// Previous code and saved UI tests referred to these as ensemble presets.
// Keep the export as an alias while the product now presents them as modes.
export const ENSEMBLE_PRESETS = ACCOMPANIMENT_MODES;

export const ACCOMPANIMENT_INSTRUMENT_IDS: readonly InstrumentId[] = [
  "acoustic_grand_piano", "bright_acoustic_piano", "electric_piano_1", "electric_piano_2",
  "church_organ", "accordion",
  "acoustic_guitar_nylon", "acoustic_guitar_steel", "electric_guitar_clean",
  "electric_guitar_muted", "overdriven_guitar", "distortion_guitar",
  "acoustic_bass", "electric_bass_finger", "electric_bass_pick", "contrabass",
  "violin", "viola", "cello", "string_ensemble_1", "string_ensemble_2",
  "pizzicato_strings", "orchestral_harp",
  "flute", "recorder", "clarinet", "oboe", "french_horn", "trumpet", "trombone",
  "xylophone", "glockenspiel", "marimba", "vibraphone", "timpani", "orchestra_hit"
];

const accompanimentInstrumentIdSet = new Set(ACCOMPANIMENT_INSTRUMENT_IDS);

export function isAccompanimentInstrument(id: InstrumentId): boolean {
  const legacy = id === "piano" ? "acoustic_grand_piano"
    : id === "guitar" ? "acoustic_guitar_nylon" : id;
  return accompanimentInstrumentIdSet.has(legacy);
}

export function transposeOctaves(pitch: number, octaves: number): number {
  return pitch + octaves * 12;
}

export function findAccompanimentStyle(id: string): AccompanimentStyle {
  return ACCOMPANIMENT_STYLES.find((style) => style.id === id) ??
    ACCOMPANIMENT_STYLES.find((style) => style.id === "arpeggio") ?? ACCOMPANIMENT_STYLES[0];
}

function event(offsetBeats: number, durationBeats: number, voice: AccompanimentEvent["voice"], step?: number) {
  return { offsetBeats, durationBeats, voice, step } satisfies AccompanimentEvent;
}

function fitEvents(events: readonly AccompanimentEvent[], beats: number): readonly AccompanimentEvent[] {
  return events.filter((item) => item.offsetBeats >= 0 && item.offsetBeats < beats).map((item) => ({
    ...item,
    durationBeats: Math.min(item.durationBeats, Math.max(.12, beats - item.offsetBeats))
  }));
}

export function createAccompanimentPattern(
  styleId: AccompanimentStyleId,
  beats: number,
  meter?: Meter
): readonly AccompanimentEvent[] {
  const events: AccompanimentEvent[] = [];
  const compoundSixEight = meter?.beats === 6 && meter.beatUnit === 8;
  if (compoundSixEight) {
    if (styleId === "strum") {
      events.push(event(0, 1.18, "chord"), event(1.5, 1.18, "chord"));
    } else if (styleId === "arpeggio" || styleId === "animation_ost") {
      const steps = styleId === "animation_ost" ? [0, 1, 2, 1, 2, 1] : [0, 1, 2, 0, 1, 2];
      for (let beat = 0, index = 0; beat < beats; beat += .5, index += 1) {
        events.push(event(beat, .43, "step", steps[index % steps.length]));
      }
    } else if (styleId === "riff") {
      [0, .5, 1.5, 2].forEach((beat, index) => events.push(event(beat, .4, "step", [0, 2, 1, 2][index])));
    } else if (styleId === "folk") {
      events.push(event(0, 1.08, "root"), event(1.5, 1.08, "chord"));
    } else if (styleId === "bossa") {
      events.push(event(0, .62, "root"), event(1, .4, "chord"),
        event(1.5, .62, "root"), event(2.5, .4, "chord"));
    } else if (styleId === "shuffle") {
      events.push(event(0, .7, "root"), event(1, .32, "chord"),
        event(1.5, .7, "root"), event(2.5, .32, "chord"));
    } else if (styleId === "kpop") {
      events.push(event(0, .46, "root"), event(.5, .3, "chord"),
        event(1.5, .4, "chord"), event(2.5, .34, "chord"));
    } else if (styleId === "anime_rock") {
      for (let beat = 0; beat < beats; beat += .5) {
        events.push(event(beat, .36, beat % 1 === 0 ? "chord" : "root"));
      }
    } else if (styleId === "children_song") {
      events.push(event(0, .6, "root"), event(.5, .3, "step", 1),
        event(1.5, .6, "chord"), event(2, .3, "step", 2));
    } else if (styleId === "opera") {
      events.push(event(0, beats, "chord"), event(0, 1.2, "root"), event(2.25, .6, "step", 2));
    } else if (styleId === "musical") {
      events.push(event(0, .65, "root"), event(1, .3, "chord"),
        event(1.5, .55, "chord"), event(2.5, .32, "step", 2));
    } else {
      [.5, 1.5, 2.5].forEach((beat) => events.push(event(beat, .38, "chord")));
    }
    return fitEvents(events, beats);
  }
  if (styleId === "strum") {
    for (let beat = 0; beat < beats; beat += 1) events.push(event(beat, .72, "chord"));
  } else if (styleId === "arpeggio") {
    for (let beat = 0, step = 0; beat < beats; beat += .5, step += 1) events.push(event(beat, .45, "step", step));
  } else if (styleId === "riff") {
    const steps = [0, 2, 1, 2];
    for (let beat = 0, index = 0; beat < beats; beat += .5, index += 1) events.push(event(beat, .42, "step", steps[index % steps.length]));
  } else if (styleId === "folk") {
    for (let beat = 0; beat < beats; beat += 1) events.push(event(beat, .78, beat % 2 === 0 ? "root" : "chord"));
  } else if (styleId === "bossa") {
    for (let start = 0; start < beats; start += 2) {
      events.push(event(start, .62, "root"), event(start + .75, .5, "chord"), event(start + 1.5, .42, "chord"));
    }
  } else if (styleId === "shuffle") {
    for (let beat = 0; beat < beats; beat += 1) {
      events.push(event(beat, .58, "root"), event(beat + 2 / 3, .25, "chord"));
    }
  } else if (styleId === "kpop") {
    for (let start = 0; start < beats; start += 2) {
      events.push(event(start, .46, "root"), event(start + .5, .3, "chord"),
        event(start + 1, .34, "chord"), event(start + 1.5, .38, "chord"));
    }
  } else if (styleId === "anime_rock") {
    for (let beat = 0; beat < beats; beat += .5) {
      events.push(event(beat, .34, beat % 1 === 0 ? "chord" : "root"));
    }
  } else if (styleId === "children_song") {
    for (let beat = 0; beat < beats; beat += 1) {
      events.push(event(beat, .56, beat % 2 === 0 ? "root" : "chord"));
      events.push(event(beat + .5, .3, "step", beat + 1));
    }
  } else if (styleId === "animation_ost") {
    const steps = [0, 1, 2, 1, 2, 3, 2, 1];
    for (let beat = 0, index = 0; beat < beats; beat += .5, index += 1) {
      events.push(event(beat, .46, "step", steps[index % steps.length]));
    }
  } else if (styleId === "opera") {
    events.push(event(0, beats, "chord"), event(0, Math.min(1.2, beats), "root"));
    if (beats > 1.5) events.push(event(beats - .7, .62, "step", 2));
  } else if (styleId === "musical") {
    for (let start = 0; start < beats; start += 2) {
      events.push(event(start, .68, "root"), event(start + .75, .28, "chord"),
        event(start + 1, .42, "chord"), event(start + 1.5, .32, "step", 2));
    }
  } else {
    [0.5, 1.25, 2.5, 3.25].forEach((beat) => events.push(event(beat, .4, "chord")));
  }
  return fitEvents(events, beats);
}

export type AccompanimentInstrumentPart = Readonly<{
  id: "bass" | "keys" | "guitar" | "strings" | "winds" | "percussion" | "support";
  label: string;
}>;

export type AccompanimentInstrumentProfile = Readonly<{
  part: AccompanimentInstrumentPart;
  range: readonly [min: number, max: number, center: number];
  gain: number;
  polyphonic: boolean;
}>;

const PARTS = {
  bass: { id: "bass", label: "낮은 받침" },
  keys: { id: "keys", label: "화음 채우기" },
  guitar: { id: "guitar", label: "쪼갠 리듬" },
  strings: { id: "strings", label: "길게 받치기" },
  winds: { id: "winds", label: "노래 사이의 응답" },
  percussion: { id: "percussion", label: "리듬 꾸밈" }
} as const satisfies Record<string, AccompanimentInstrumentPart>;

const INSTRUMENT_PARTS: Readonly<Record<string, AccompanimentInstrumentPart>> = {
  acoustic_grand_piano: PARTS.keys,
  bright_acoustic_piano: PARTS.keys,
  electric_piano_1: PARTS.keys,
  electric_piano_2: PARTS.keys,
  church_organ: PARTS.keys,
  accordion: PARTS.keys,
  acoustic_guitar_nylon: PARTS.guitar,
  acoustic_guitar_steel: PARTS.guitar,
  electric_guitar_clean: PARTS.guitar,
  electric_guitar_muted: PARTS.guitar,
  overdriven_guitar: PARTS.guitar,
  distortion_guitar: PARTS.guitar,
  acoustic_bass: PARTS.bass,
  electric_bass_finger: PARTS.bass,
  electric_bass_pick: PARTS.bass,
  contrabass: PARTS.bass,
  violin: PARTS.strings,
  viola: PARTS.strings,
  cello: PARTS.strings,
  string_ensemble_1: PARTS.strings,
  string_ensemble_2: PARTS.strings,
  pizzicato_strings: PARTS.strings,
  orchestral_harp: PARTS.guitar,
  flute: PARTS.winds,
  recorder: PARTS.winds,
  clarinet: PARTS.winds,
  oboe: PARTS.winds,
  french_horn: PARTS.winds,
  trumpet: PARTS.winds,
  trombone: PARTS.winds,
  xylophone: PARTS.percussion,
  glockenspiel: PARTS.percussion,
  marimba: PARTS.percussion,
  vibraphone: PARTS.percussion,
  timpani: PARTS.percussion,
  orchestra_hit: PARTS.percussion
};

export function accompanimentInstrumentPart(instrumentId: InstrumentId, layerIndex: number): AccompanimentInstrumentPart {
  const id = instrumentId.toLowerCase();
  const canonicalId = id === "piano" ? "acoustic_grand_piano" : id === "guitar" ? "acoustic_guitar_nylon" : id;
  const explicit = INSTRUMENT_PARTS[canonicalId];
  if (explicit) return explicit;
  if (/(bass|tuba|bassoon|contrabass)/.test(id)) return { id: "bass", label: "낮은 받침" };
  if (/(guitar|banjo|mandolin)/.test(id)) return { id: "guitar", label: "쪼갠 리듬" };
  if (/(piano|organ|accordion|harpsichord|clavinet|celesta)/.test(id)) return { id: "keys", label: "화음 채우기" };
  if (/(violin|viola|cello|string|choir|pad|harp)/.test(id)) return { id: "strings", label: "길게 받치기" };
  if (/(trumpet|trombone|horn|brass|sax|flute|clarinet|oboe|recorder|harmonica)/.test(id)) return { id: "winds", label: "짧은 강조" };
  if (/(xylophone|glockenspiel|marimba|vibraphone|bells|timpani|orchestra_hit)/.test(id)) return { id: "percussion", label: "리듬 꾸밈" };
  return { id: "support", label: accompanimentLayerRole(layerIndex).label };
}

export function accompanimentInstrumentProfile(
  instrumentId: InstrumentId,
  layerIndex: number
): AccompanimentInstrumentProfile {
  const part = accompanimentInstrumentPart(instrumentId, layerIndex);
  const range: AccompanimentInstrumentProfile["range"] = part.id === "bass" ? [32, 52, 40]
    : part.id === "keys" ? [40, 72, 55]
    : part.id === "guitar" ? [48, 76, 61]
    : part.id === "strings" ? [48, 81, 63]
    : part.id === "winds" ? [58, 86, 71]
    : part.id === "percussion" ? [48, 81, 64]
    : [48, 78, 61];
  const gain = instrumentId.includes("glockenspiel") || instrumentId.includes("orchestra_hit") ? .48
    : instrumentId.includes("distortion") || instrumentId.includes("overdriven") ? .7
    : instrumentId.includes("timpani") || part.id === "winds" ? .68
    : part.id === "strings" ? .76
    : part.id === "keys" ? .82
    : part.id === "guitar" || part.id === "percussion" ? .84
    : 1;
  return {
    part,
    range,
    gain,
    polyphonic: part.id === "keys" || /ensemble|choir/.test(instrumentId) ||
      instrumentId.includes("orchestra_hit")
  };
}

function bassPulseOffsets(beats: number, meter?: Meter): readonly number[] {
  if (meter?.beats === 6 && meter.beatUnit === 8) return [0, 1.5].filter((offset) => offset < beats);
  return Array.from({ length: Math.ceil(beats) }, (_, index) => index)
    .filter((offset) => offset < beats);
}

export function createInstrumentAccompanimentPattern(
  styleId: AccompanimentStyleId,
  beats: number,
  instrumentId: InstrumentId,
  layerIndex: number,
  meter?: Meter
): readonly AccompanimentEvent[] {
  const part = accompanimentInstrumentPart(instrumentId, layerIndex);
  if (styleId === "anime_rock") {
    const pulseOffsets = Array.from({ length: Math.ceil(beats * 2) }, (_, index) => index * .5)
      .filter((offset) => offset < beats);
    if (part.id === "bass") {
      return pulseOffsets.map((offset) => event(offset, Math.min(.34, beats - offset), "root"));
    }
    if (part.id === "guitar") return createAccompanimentPattern("anime_rock", beats, meter);
    if (part.id === "keys") {
      return pulseOffsets.filter((_, index) => index % 2 === 1)
        .map((offset) => event(offset, Math.min(.4, beats - offset), "chord"));
    }
    if (part.id === "strings") return [event(0, beats, "chord")];
  }
  if (styleId === "kpop") {
    if (instrumentId.includes("orchestra_hit")) return fitEvents([
      event(0, .3, "chord"), event(Math.max(.5, beats - .5), .3, "chord")
    ], beats);
    if (part.id === "bass") {
      const offsets = bassPulseOffsets(beats, meter);
      return offsets.map((offset) => event(offset, Math.min(.48, beats - offset), "root"));
    }
    if (part.id === "strings") return [event(0, beats, "chord")];
    if (part.id === "winds") return fitEvents([event(Math.max(0, beats - .5), .42, "chord")], beats);
    if (part.id === "guitar" || part.id === "percussion") return createAccompanimentPattern("riff", beats, meter);
  }
  if (styleId === "children_song") {
    if (instrumentId.includes("pizzicato")) return createAccompanimentPattern("folk", beats, meter);
    if (part.id === "bass" || part.id === "guitar") return createAccompanimentPattern("folk", beats, meter);
    if (part.id === "winds") return fitEvents([
      event(0, .42, "step", layerIndex),
      event(Math.max(.5, beats - 1), .42, "step", layerIndex + 1)
    ], beats);
    if (part.id === "percussion") return createAccompanimentPattern("children_song", beats, meter);
  }
  if (styleId === "animation_ost") {
    if (instrumentId.includes("harp")) return createAccompanimentPattern("arpeggio", beats, meter);
    if (part.id === "bass") return [event(0, Math.min(1, beats), "root")];
    if (part.id === "strings") return [event(0, beats, "chord")];
    if (part.id === "winds") return fitEvents([
      event(Math.min(.5, beats - .12), .45, "step", layerIndex),
      event(Math.max(.5, beats - .55), .48, "step", layerIndex + 1)
    ], beats);
    if (part.id === "percussion") return [event(0, Math.min(.72, beats), "root")];
  }
  if (styleId === "opera") {
    if (part.id === "bass" || part.id === "strings" || part.id === "keys") {
      return [event(0, beats, part.id === "bass" ? "root" : "chord")];
    }
    if (part.id === "winds") return fitEvents([
      event(0, .7, "chord"), event(Math.max(.5, beats - .75), .68, "step", layerIndex)
    ], beats);
    if (part.id === "percussion") return [event(0, Math.min(.82, beats), "root")];
  }
  if (styleId === "musical") {
    if (part.id === "bass") {
      const offsets = bassPulseOffsets(beats, meter);
      return offsets.map((offset) => event(offset, Math.min(.64, beats - offset), "root"));
    }
    if (part.id === "strings") return [event(0, beats, "chord")];
    if (part.id === "winds") return fitEvents([
      event(Math.min(.75, beats - .12), .3, "chord"),
      event(Math.max(.5, beats - .5), .42, "step", layerIndex)
    ], beats);
    if (part.id === "percussion") return createAccompanimentPattern("strum", beats, meter);
  }
  if (part.id === "bass") {
    const offsets = meter?.beats === 6 && meter.beatUnit === 8
      ? bassPulseOffsets(beats, meter)
      : beats >= 3 ? [0, Math.min(2, beats - .5)] : [0];
    return offsets.map((offset) => event(offset, Math.min(.82, beats - offset), "root"));
  }
  if (part.id === "strings") return [event(0, beats, "chord")];
  if (part.id === "winds") {
    const ending = Math.max(.5, beats - .75);
    return [event(0, .48, "chord"), event(ending, Math.min(.48, beats - ending), "step", layerIndex)];
  }
  if (part.id === "percussion") return createAccompanimentPattern("riff", beats, meter);
  if (part.id === "guitar") return createAccompanimentPattern(styleId === "strum" ? "strum" : "arpeggio", beats, meter);
  return createAccompanimentPattern(styleId, beats, meter);
}

export function createInstrumentTransitionFill(
  beats: number,
  instrumentId: InstrumentId,
  layerIndex: number,
  meter?: Meter
): readonly AccompanimentEvent[] {
  if (beats < 1) return [];
  const part = accompanimentInstrumentPart(instrumentId, layerIndex);
  const span = meter?.beats === 6 && meter.beatUnit === 8 ? Math.min(1.5, beats) : 1;
  const start = beats - span;
  if (part.id === "percussion") return fitEvents([
    event(start, span / 4, "step", layerIndex), event(start + span / 4, span / 4, "step", layerIndex + 1),
    event(start + span / 2, span / 4, "step", layerIndex + 2), event(start + span * .75, span / 4, "chord")
  ], beats);
  if (part.id === "winds") return fitEvents([
    event(start + span / 2, span / 4, "step", layerIndex + 1),
    event(start + span * .75, span / 4, "step", layerIndex + 2)
  ], beats);
  if (part.id === "keys" || part.id === "guitar") return fitEvents([
    event(start + span / 2, span / 4, "chord"), event(start + span * .75, span / 4, "chord")
  ], beats);
  return [];
}
