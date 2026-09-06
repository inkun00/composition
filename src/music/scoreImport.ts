import { strFromU8, unzipSync } from "fflate";
import { measureCapacity, meterKey, SUPPORTED_METERS, validateMeasure, type Meter } from "./meter";
import { rational, toNumber } from "./rational";
import type { SavedDraft } from "./draft";
import type { NoteEvent } from "./types";
import { inferImportedHarmony, type ImportedKeyMode } from "./importedHarmony";
import { keyAlterationForDegree } from "./accidental";

export type ImportConfidence = "high" | "medium" | "low";

export type RecognizedMeasure = Readonly<{
  notes: readonly NoteEvent[];
  chords: readonly string[];
  confidence: ImportConfidence;
  warnings: readonly string[];
  keyFifths?: number;
}>;

export type RecognizedScore = Readonly<{
  title: string;
  meter: Meter;
  measures: readonly RecognizedMeasure[];
  warnings: readonly string[];
  keyFifths?: number;
  keyMode?: ImportedKeyMode;
}>;

type SupportedSongLength = SavedDraft["songLength"];

const supportedSongLengths: readonly SupportedSongLength[] = [8, 12, 16, 20, 24, 28, 32];
const naturalPitchClasses: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};
const degreeByStep: Readonly<Record<string, number>> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

function directChild(element: Element, name: string): Element | null {
  return Array.from(element.children).find((child) => child.localName === name) ?? null;
}

function descendants(element: ParentNode, name: string): Element[] {
  return Array.from(element.querySelectorAll(name));
}

function childText(element: Element, name: string): string {
  return directChild(element, name)?.textContent?.trim() ?? "";
}

function integerText(element: Element, name: string): number | null {
  const value = Number.parseInt(childText(element, name), 10);
  return Number.isInteger(value) ? value : null;
}

function parseXml(source: string): XMLDocument {
  const document = new DOMParser().parseFromString(source, "application/xml");
  const error = document.querySelector("parsererror");
  if (error) throw new Error("악보 파일을 읽지 못했어요. 파일이 올바른지 확인해 주세요.");
  return document;
}

function pitchAlter(note: Element, keyFifths: number): number {
  const pitch = directChild(note, "pitch");
  if (!pitch) return 0;
  const explicitAlter = integerText(pitch, "alter");
  if (explicitAlter !== null) return explicitAlter;
  if (childText(note, "accidental").toLowerCase() === "natural") return 0;
  const step = childText(pitch, "step").toUpperCase();
  return step in degreeByStep ? keyAlterationForDegree(keyFifths, degreeByStep[step]) : 0;
}

function midiPitch(note: Element, keyFifths: number): number | null {
  const pitch = directChild(note, "pitch");
  if (!pitch) return null;
  const step = childText(pitch, "step").toUpperCase();
  const octave = integerText(pitch, "octave");
  const alter = pitchAlter(note, keyFifths);
  if (!(step in naturalPitchClasses) || octave === null) return null;
  const midi = (octave + 1) * 12 + naturalPitchClasses[step] + alter;
  return midi >= 0 && midi <= 127 ? midi : null;
}

function noteAccidental(note: Element, keyFifths: number): NoteEvent["accidental"] {
  const pitch = directChild(note, "pitch");
  const alter = pitchAlter(note, keyFifths);
  if (alter === 1) return "sharp";
  if (alter === -1) return "flat";
  const step = pitch ? childText(pitch, "step").toUpperCase() : "";
  if (step in degreeByStep && keyAlterationForDegree(keyFifths, degreeByStep[step]) !== 0) return "natural";
  return undefined;
}

function noteLyric(note: Element): string | undefined {
  const lyric = descendants(note, "lyric")[0];
  const text = lyric ? descendants(lyric, "text")[0]?.textContent?.trim() : "";
  if (!text) return undefined;
  return Array.from(text).slice(0, 2).join("");
}

function hasTieStart(note: Element): boolean {
  return descendants(note, "tie").some((tie) => tie.getAttribute("type") === "start") ||
    descendants(note, "tied").some((tie) => tie.getAttribute("type") === "start");
}

function accidentalName(step: string, alter: number): string {
  if (alter === 1) return `${step}#`;
  if (alter === -1) return `${step}b`;
  return step;
}

function harmonyKind(kind: Element | null): string | null {
  if (!kind) return "";
  const value = kind.textContent?.trim().toLowerCase() ?? "";
  const suffixes: Readonly<Record<string, string>> = {
    major: "",
    minor: "m",
    dominant: "7",
    "major-seventh": "maj7",
    "minor-seventh": "m7",
    diminished: "dim",
    "half-diminished": "m7b5",
    augmented: "aug",
    "suspended-fourth": "sus4",
    power: "5"
  };
  return value in suffixes ? suffixes[value] : null;
}

function harmonySymbol(harmony: Element): string | null {
  const root = directChild(harmony, "root");
  const step = root ? childText(root, "root-step").toUpperCase() : "";
  if (!(step in naturalPitchClasses)) return null;
  const suffix = harmonyKind(directChild(harmony, "kind"));
  if (suffix === null) return null;
  const rootName = accidentalName(step, integerText(root as Element, "root-alter") ?? 0);
  const bass = directChild(harmony, "bass");
  const bassStep = bass ? childText(bass, "bass-step").toUpperCase() : "";
  const bassName = bassStep in naturalPitchClasses
    ? accidentalName(bassStep, integerText(bass as Element, "bass-alter") ?? 0)
    : "";
  return `${rootName}${suffix}${bassName ? `/${bassName}` : ""}`;
}

function chordsFromMeasure(measure: Element): string[] {
  const result: string[] = [];
  Array.from(measure.children).forEach((item) => {
    if (item.localName !== "harmony") return;
    const symbol = harmonySymbol(item);
    if (symbol && result.length < 4 && result.at(-1) !== symbol) result.push(symbol);
  });
  return result;
}

function meterFromAttributes(attributes: Element, current: Meter): Meter {
  const time = directChild(attributes, "time");
  if (!time) return current;
  const beats = integerText(time, "beats");
  const beatUnit = integerText(time, "beat-type");
  if (beats === null || ![2, 4, 8].includes(beatUnit ?? 0)) return current;
  return { beats, beatUnit: beatUnit as Meter["beatUnit"] };
}

function isSupportedMeter(meter: Meter): boolean {
  return SUPPORTED_METERS.some((supported) => meterKey(supported) === meterKey(meter));
}

type TimedNote = Readonly<{ onset: number; duration: number; note: NoteEvent }>;

function notesFromMeasure(
  measure: Element,
  measureIndex: number,
  divisions: number,
  meter: Meter,
  keyFifths: number
): RecognizedMeasure {
  const warnings: string[] = [];
  const timed: TimedNote[] = [];
  let xmlCursor = 0;
  let selectedVoice = "";
  let selectedStaff = "";
  let skippedPolyphony = false;

  Array.from(measure.children).forEach((item, itemIndex) => {
    if (item.localName === "backup") {
      xmlCursor = Math.max(0, xmlCursor - (integerText(item, "duration") ?? 0) / divisions);
      return;
    }
    if (item.localName === "forward") {
      xmlCursor += (integerText(item, "duration") ?? 0) / divisions;
      return;
    }
    if (item.localName !== "note") return;
    const durationUnits = integerText(item, "duration") ?? 0;
    const duration = durationUnits / divisions;
    const isChordTone = directChild(item, "chord") !== null;
    const voice = childText(item, "voice") || "1";
    const staff = childText(item, "staff") || "1";

    if (!selectedVoice && !isChordTone && duration > 0) {
      selectedVoice = voice;
      selectedStaff = staff;
    }
    const selected = voice === selectedVoice && staff === selectedStaff && !isChordTone;
    if (!selected && duration > 0) skippedPolyphony = true;

    if (selected && directChild(item, "grace")) {
      warnings.push(`${measureIndex + 1}마디 꾸밈음은 가져오지 않았어요.`);
    } else if (selected && duration > 0) {
      const pitch = directChild(item, "rest") ? null : midiPitch(item, keyFifths);
      if (pitch !== null || directChild(item, "rest")) {
        timed.push({
          onset: xmlCursor,
          duration,
          note: {
            id: `imported-${measureIndex}-${itemIndex}`,
            pitch,
            accidental: pitch === null ? undefined : noteAccidental(item, keyFifths),
            duration: rational(durationUnits, divisions),
            dotted: directChild(item, "dot") ? true : undefined,
            linkToNext: hasTieStart(item) ? true : undefined,
            lyric: pitch === null ? undefined : noteLyric(item)
          }
        });
      } else {
        warnings.push(`${measureIndex + 1}마디에서 음높이를 읽지 못한 음표를 건너뛰었어요.`);
      }
    }
    if (!isChordTone) xmlCursor += duration;
  });

  if (skippedPolyphony) warnings.push(`${measureIndex + 1}마디는 첫 번째 성부만 가져왔어요.`);
  const notes: NoteEvent[] = [];
  let cursor = 0;
  timed.sort((left, right) => left.onset - right.onset).forEach((event) => {
    if (event.onset + .0001 < cursor) {
      warnings.push(`${measureIndex + 1}마디에서 겹쳐 연주되는 음표를 건너뛰었어요.`);
      return;
    }
    if (event.onset > cursor + .0001) {
      notes.push({
        id: `imported-${measureIndex}-gap-${notes.length}`,
        pitch: null,
        duration: rational(Math.round((event.onset - cursor) * divisions), divisions)
      });
    }
    notes.push(event.note);
    cursor = event.onset + event.duration;
  });

  if (notes.length === 0) {
    notes.push({ id: `imported-${measureIndex}-empty`, pitch: null, duration: measureCapacity(meter) });
    warnings.push(`${measureIndex + 1}마디에서 음표를 찾지 못해 쉼표로 채웠어요.`);
  }
  if (notes.length > 32) {
    notes.splice(32);
    warnings.push(`${measureIndex + 1}마디는 음표 32개까지만 가져왔어요.`);
  }
  const validation = validateMeasure(notes, meter);
  if (validation.state !== "exact") warnings.push(`${measureIndex + 1}마디의 박자 합계를 확인해 주세요. ${validation.message}`);
  return {
    notes,
    chords: chordsFromMeasure(measure),
    confidence: warnings.length === 0 ? "high" : validation.state === "exact" ? "medium" : "low",
    warnings,
    keyFifths
  };
}

export function parseMusicXml(source: string): RecognizedScore {
  const document = parseXml(source);
  const root = document.documentElement;
  if (!root || !["score-partwise", "score-timewise"].includes(root.localName)) {
    throw new Error("이 악보 파일은 아직 읽을 수 없어요.");
  }
  if (root.localName === "score-timewise") throw new Error("이 악보 파일은 아직 읽을 수 없어요.");
  const part = descendants(root, "part")[0];
  if (!part) throw new Error("악보 파일에서 연주 부분을 찾지 못했어요.");
  const warnings: string[] = [];
  const allParts = descendants(root, "part");
  if (allParts.length > 1) warnings.push("여러 악기 파트 중 첫 번째 파트만 가져왔어요.");
  let divisions = 1;
  let meter: Meter = { beats: 4, beatUnit: 4 };
  let scoreMeter = "";
  let keyFifths = 0;
  let keyMode: ImportedKeyMode | undefined;
  const measures = Array.from(part.children).filter((child) => child.localName === "measure").map((measure, index) => {
    const attributes = directChild(measure, "attributes");
    if (attributes) {
      divisions = integerText(attributes, "divisions") ?? divisions;
      meter = meterFromAttributes(attributes, meter);
      const clefSign = descendants(attributes, "clef")[0] ? descendants(attributes, "sign")[0]?.textContent?.trim() : "";
      if (clefSign && clefSign !== "G") throw new Error("현재는 높은음자리표 단선율 악보만 가져올 수 있어요.");
      const fifths = descendants(attributes, "fifths")[0]?.textContent;
      if (fifths !== undefined) {
        const parsed = Number.parseInt(fifths, 10);
        if (Number.isInteger(parsed)) keyFifths = parsed;
      }
      const mode = descendants(attributes, "mode")[0]?.textContent?.trim().toLowerCase();
      if (mode === "major" || mode === "minor") keyMode = mode;
    }
    if (divisions <= 0) throw new Error(`${index + 1}마디의 박자 정보가 올바르지 않아요.`);
    if (!isSupportedMeter(meter)) throw new Error(`${meterKey(meter)}박자는 아직 프로젝트에서 지원하지 않아요.`);
    if (!scoreMeter) scoreMeter = meterKey(meter);
    if (scoreMeter !== meterKey(meter)) throw new Error("중간에 박자표가 바뀌는 악보는 아직 가져올 수 없어요.");
    return notesFromMeasure(measure, index, divisions, meter, keyFifths);
  });
  if (measures.length === 0) throw new Error("악보 파일에서 마디를 찾지 못했어요.");
  if (measures.length > 32) throw new Error("한 번에 32마디까지 가져올 수 있어요.");
  if (!supportedSongLengths.includes(measures.length as SupportedSongLength)) {
    warnings.push(`${measures.length}마디를 ${normalizedLength(measures.length)}마디 프로젝트로 만들고 남는 마디는 쉼표로 채워요.`);
  }
  const title = (descendants(root, "work-title")[0]?.textContent?.trim() ||
    descendants(root, "movement-title")[0]?.textContent?.trim() || "가져온 악보").slice(0, 60);
  return { title, meter, measures, warnings, keyFifths: measures[0]?.keyFifths, keyMode };
}

function xmlFromMxl(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("압축된 악보 파일을 열지 못했어요.");
  }
  const containerEntry = Object.entries(files).find(([name]) => name.toLowerCase() === "meta-inf/container.xml");
  let scorePath = "";
  if (containerEntry) {
    const container = parseXml(strFromU8(containerEntry[1]));
    scorePath = container.querySelector("rootfile")?.getAttribute("full-path") ?? "";
  }
  const entry = scorePath ? files[scorePath] : Object.entries(files).find(([name]) =>
    /\.(musicxml|xml)$/i.test(name) && !name.toLowerCase().startsWith("meta-inf/"))?.[1];
  if (!entry) throw new Error("압축된 악보에서 읽을 파일을 찾지 못했어요.");
  return strFromU8(entry);
}

function fileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했어요."));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
}

function fileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했어요."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

export async function readMusicScoreFile(file: File): Promise<RecognizedScore> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "mxl") return parseMusicXml(xmlFromMxl(new Uint8Array(await fileBytes(file))));
  if (extension === "xml" || extension === "musicxml" || file.type.includes("xml")) {
    return parseMusicXml(await fileText(file));
  }
  throw new Error("읽을 수 있는 악보 사진이나 악보 파일을 골라 주세요.");
}

function normalizedLength(measureCount: number): SupportedSongLength {
  return supportedSongLengths.find((length) => length >= measureCount) ?? 32;
}

export function recognizedScoreToDraft(score: RecognizedScore, base: SavedDraft): SavedDraft {
  const songLength = normalizedLength(score.measures.length);
  const capacity = measureCapacity(score.meter);
  const harmony = inferImportedHarmony(score.measures, { fifths: score.keyFifths, mode: score.keyMode });
  const measures = Array.from({ length: songLength }, (_, index) => {
    const recognized = score.measures[index];
    return recognized ? {
      candidateId: "imported-score",
      candidateName: "악보에서 가져온 가락",
      notes: recognized.notes,
      chords: harmony.chordsByMeasure[index],
      keyFifths: recognized.keyFifths ?? score.keyFifths,
      effects: []
    } : {
      candidateId: "imported-padding",
      candidateName: "빈 마디",
      notes: [{ id: `imported-padding-${index}`, pitch: null, duration: capacity }],
      chords: [harmony.tonicChord],
      keyFifths: score.keyFifths,
      effects: []
    };
  });
  return {
    ...base,
    updatedAt: Date.now(),
    title: score.title || base.title,
    meter: score.meter,
    songLength,
    lyrics: measures.map((measure) => measure.notes
      .filter((note) => note.pitch !== null).map((note) => note.lyric ?? "").join("").slice(0, 30)),
    measures,
    showArrangement: false
  };
}

export function scoreImportSummary(score: RecognizedScore): Readonly<{
  exactMeasures: number;
  confidence: ImportConfidence;
  warningCount: number;
}> {
  const exactMeasures = score.measures.filter((measure) => validateMeasure(measure.notes, score.meter).state === "exact").length;
  const warningCount = score.warnings.length + score.measures.reduce((total, measure) => total + measure.warnings.length, 0);
  const confidence = score.measures.some((measure) => measure.confidence === "low") ? "low" :
    score.measures.some((measure) => measure.confidence === "medium") || warningCount > 0 ? "medium" : "high";
  return { exactMeasures, confidence, warningCount };
}

export function fillMeasureWithRest(measure: RecognizedMeasure, meter: Meter): RecognizedMeasure {
  const validation = validateMeasure(measure.notes, meter);
  if (validation.state !== "short") return measure;
  const notes = [...measure.notes, {
    id: `imported-fill-${measure.notes.length}-${Date.now()}`,
    pitch: null,
    duration: validation.difference
  }];
  return {
    notes,
    chords: measure.chords,
    confidence: measure.confidence === "low" ? "medium" : measure.confidence,
    warnings: measure.warnings.filter((warning) => !warning.includes("박자 합계를 확인"))
  };
}

export function importedMeasureBeats(measure: RecognizedMeasure): number {
  return measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
}
