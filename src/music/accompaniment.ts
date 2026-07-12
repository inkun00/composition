import type { InstrumentId } from "./instruments";

export const MAX_ACCOMPANIMENT_INSTRUMENTS = 6;

export type AccompanimentStyleId =
  | "strum" | "arpeggio" | "riff" | "folk" | "bossa" | "shuffle" | "comping";

export type AccompanimentStyle = Readonly<{
  id: AccompanimentStyleId;
  name: string;
  alias: string;
  description: string;
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
  { id: "strum", name: "시원한 쓸기 리듬", alias: "스트럼", description: "화음을 한 번에 쓸어 내려 시원하고 힘차게 받쳐 줘요." },
  { id: "arpeggio", name: "반짝이는 물결", alias: "아르페지오", description: "화음의 음을 차례로 연주해 노래를 돋보이게 해요." },
  { id: "riff", name: "귀에 쏙 반복 무늬", alias: "리프·루프", description: "짧은 음 무늬를 반복해 기억에 남는 반주를 만들어요." },
  { id: "folk", name: "따뜻한 통기타 걸음", alias: "포크", description: "낮은 음과 화음을 번갈아 연주해 담백하게 흘러가요." },
  { id: "bossa", name: "찰랑찰랑 라틴 리듬", alias: "보사노바", description: "살짝 흔들리는 리듬으로 나른하고 부드럽게 연주해요." },
  { id: "shuffle", name: "통통 튀는 리듬", alias: "셔플·바운스", description: "긴 음과 짧은 음이 짝을 이루어 경쾌하게 움직여요." },
  { id: "comping", name: "노래와 대화하는 화음", alias: "컴핑", description: "노래 사이의 빈 곳에 짧은 화음을 넣어 대화하듯 연주해요." }
];

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
  return ACCOMPANIMENT_STYLES.find((style) => style.id === id) ?? ACCOMPANIMENT_STYLES[0];
}

function event(offsetBeats: number, durationBeats: number, voice: AccompanimentEvent["voice"], step?: number) {
  return { offsetBeats, durationBeats, voice, step } satisfies AccompanimentEvent;
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
  } else {
    [0.5, 1.25, 2.5, 3.25].forEach((beat) => events.push(event(beat, .4, "chord")));
  }
  return events.filter((item) => item.offsetBeats < beats).map((item) => ({
    ...item,
    durationBeats: Math.min(item.durationBeats, Math.max(.12, beats - item.offsetBeats))
  }));
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
  if (/(trumpet|trombone|horn|sax|flute|clarinet|oboe|recorder|harmonica)/.test(id)) return { id: "winds", label: "짧은 강조" };
  if (/(xylophone|marimba|vibraphone|bells|timpani|agogo|applause)/.test(id)) return { id: "percussion", label: "리듬 꾸밈" };
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
