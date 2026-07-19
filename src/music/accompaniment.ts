import type { InstrumentId } from "./instruments";

export const MAX_ACCOMPANIMENT_INSTRUMENTS = 10;

export type AccompanimentStyleId =
  | "strum" | "arpeggio" | "riff" | "folk" | "bossa" | "shuffle" | "comping"
  | "kpop" | "children_song" | "animation_ost" | "opera" | "musical";

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
    recommendedInstrumentIds: ["electric_piano_1", "electric_bass_finger", "electric_guitar_muted", "string_ensemble_1", "brass_section", "orchestra_hit"]
  },
  {
    id: "children_song", name: "동요 놀이터", alias: "동요", category: "genre",
    description: "또렷한 박자 위에서 친숙한 악기들이 가볍게 주고받아요.",
    recommendedInstrumentIds: ["acoustic_grand_piano", "acoustic_guitar_nylon", "pizzicato_strings", "recorder", "xylophone", "glockenspiel"]
  },
  {
    id: "animation_ost", name: "애니메이션 OST", alias: "애니 OST", category: "genre",
    description: "피아노 물결 위에 현악과 관악이 펼쳐져 장면이 크게 느껴져요.",
    recommendedInstrumentIds: ["acoustic_grand_piano", "string_ensemble_1", "flute", "french_horn", "orchestral_harp", "timpani"]
  },
  {
    id: "opera", name: "오페라 극장", alias: "오페라", category: "genre",
    description: "긴 화음과 합창 소리가 천천히 이어져 웅장하게 들려요.",
    recommendedInstrumentIds: ["church_organ", "string_ensemble_1", "choir_aahs", "cello", "french_horn", "timpani"]
  },
  {
    id: "musical", name: "뮤지컬 무대", alias: "뮤지컬", category: "genre",
    description: "또렷한 박자 사이로 금관과 목관이 대답해 장면 전환이 선명해요.",
    recommendedInstrumentIds: ["bright_acoustic_piano", "string_ensemble_1", "trumpet", "trombone", "clarinet", "timpani"]
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

export const ENSEMBLE_PRESETS: readonly Readonly<{
  id: "solo" | "acoustic" | "orchestra";
  name: string;
  description: string;
  instrumentIds: readonly InstrumentId[];
}>[] = [
  { id: "solo", name: "한 악기", description: "피아노 한 대로 담백하게", instrumentIds: ["piano"] },
  { id: "acoustic", name: "작은 공연단", description: "피아노·기타·실로폰", instrumentIds: ["piano", "guitar", "xylophone"] },
  { id: "orchestra", name: "풍성한 오케스트라", description: "건반·현악·관악을 함께", instrumentIds: ["piano", "guitar", "violin", "flute", "trumpet", "cello"] }
];

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
  beats: number
): readonly AccompanimentEvent[] {
  const events: AccompanimentEvent[] = [];
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

export function accompanimentInstrumentPart(instrumentId: InstrumentId, layerIndex: number): AccompanimentInstrumentPart {
  const id = instrumentId.toLowerCase();
  if (/(bass|tuba|bassoon|contrabass)/.test(id)) return { id: "bass", label: "낮은 받침" };
  if (/(guitar|banjo|mandolin)/.test(id)) return { id: "guitar", label: "쪼갠 리듬" };
  if (/(violin|viola|cello|string|choir|pad|harp)/.test(id)) return { id: "strings", label: "길게 받치기" };
  if (/(trumpet|trombone|horn|brass|sax|flute|clarinet|oboe|recorder|harmonica)/.test(id)) return { id: "winds", label: "짧은 강조" };
  if (/(xylophone|marimba|vibraphone|bells|timpani|agogo|applause|orchestra_hit|cymbal)/.test(id)) return { id: "percussion", label: "리듬 꾸밈" };
  if (/(piano|organ|accordion|harpsichord|clavinet)/.test(id)) return { id: "keys", label: "화음 채우기" };
  return { id: "support", label: accompanimentLayerRole(layerIndex).label };
}

export function createInstrumentAccompanimentPattern(
  styleId: AccompanimentStyleId,
  beats: number,
  instrumentId: InstrumentId,
  layerIndex: number
): readonly AccompanimentEvent[] {
  const part = accompanimentInstrumentPart(instrumentId, layerIndex);
  if (styleId === "kpop") {
    if (instrumentId.includes("orchestra_hit")) return fitEvents([
      event(0, .3, "chord"), event(Math.max(.5, beats - .5), .3, "chord")
    ], beats);
    if (part.id === "bass") {
      const offsets = Array.from({ length: Math.ceil(beats) }, (_, index) => index)
        .filter((offset) => offset < beats);
      return offsets.map((offset) => event(offset, Math.min(.48, beats - offset), "root"));
    }
    if (part.id === "strings") return [event(0, beats, "chord")];
    if (part.id === "winds") return fitEvents([event(Math.max(0, beats - .5), .42, "chord")], beats);
    if (part.id === "guitar" || part.id === "percussion") return createAccompanimentPattern("riff", beats);
  }
  if (styleId === "children_song") {
    if (instrumentId.includes("pizzicato")) return createAccompanimentPattern("folk", beats);
    if (part.id === "bass" || part.id === "guitar") return createAccompanimentPattern("folk", beats);
    if (part.id === "winds") return fitEvents([
      event(0, .42, "step", layerIndex),
      event(Math.max(.5, beats - 1), .42, "step", layerIndex + 1)
    ], beats);
    if (part.id === "percussion") return createAccompanimentPattern("children_song", beats);
  }
  if (styleId === "animation_ost") {
    if (instrumentId.includes("harp")) return createAccompanimentPattern("arpeggio", beats);
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
      const offsets = Array.from({ length: Math.ceil(beats) }, (_, index) => index)
        .filter((offset) => offset < beats);
      return offsets.map((offset) => event(offset, Math.min(.64, beats - offset), "root"));
    }
    if (part.id === "strings") return [event(0, beats, "chord")];
    if (part.id === "winds") return fitEvents([
      event(Math.min(.75, beats - .12), .3, "chord"),
      event(Math.max(.5, beats - .5), .42, "step", layerIndex)
    ], beats);
    if (part.id === "percussion") return createAccompanimentPattern("strum", beats);
  }
  if (part.id === "bass") {
    const offsets = beats >= 3 ? [0, Math.min(2, beats - .5)] : [0];
    return offsets.map((offset) => event(offset, Math.min(.82, beats - offset), "root"));
  }
  if (part.id === "strings") return [event(0, beats, "chord")];
  if (part.id === "winds") {
    const ending = Math.max(.5, beats - .75);
    return [event(0, .48, "chord"), event(ending, Math.min(.48, beats - ending), "step", layerIndex)];
  }
  if (part.id === "percussion") return createAccompanimentPattern("riff", beats);
  if (part.id === "guitar") return createAccompanimentPattern(styleId === "strum" ? "strum" : "arpeggio", beats);
  return createAccompanimentPattern(styleId, beats);
}
