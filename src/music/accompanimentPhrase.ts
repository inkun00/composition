// The package's pure clip compiler returns note lengths. Its /browser clip
// creates a Tone.js transport instead and must not own this app's playback.
import { clip } from "scribbletune";
import {
  analyzeEnsembleMelody,
  ensembleRoleForInstrument,
  type AccompanimentEnsembleContext,
  type EnsembleRole
} from "./accompanimentEnsemble";
import type { AccompanimentInstrumentProfile, AccompanimentStyleId } from "./accompaniment";
import { chordPitchClasses } from "./chord";
import type { InstrumentId } from "./instruments";
import type { NoteEvent } from "./types";
import { toNumber } from "./rational";

export type PhraseNote = Readonly<{
  pitch: number;
  offsetBeats: number;
  durationBeats: number;
  velocity: number;
}>;

export type PhrasePeerNote = Readonly<{
  pitch: number;
  offsetSeconds: number;
  durationSeconds: number;
}>;

type PhraseOptions = Readonly<{
  instrumentId: InstrumentId;
  profile: AccompanimentInstrumentProfile;
  styleId: AccompanimentStyleId;
  notes: readonly NoteEvent[];
  chords: readonly string[];
  fallbackPitches: readonly number[];
  context?: AccompanimentEnsembleContext;
  measureIndex: number;
  section: "intro" | "song" | "outro";
  ending: boolean;
  previousPitch?: number;
  peerNotes?: readonly PhrasePeerNote[];
  secondsPerBeat: number;
}>;

type RhythmNote = Readonly<{ offsetBeats: number; durationBeats: number }>;
const rhythmCache = new Map<string, readonly RhythmNote[]>();

/** Scribbletune's x/_/- grammar creates connected notes and explicit breaths. */
export function phraseRhythm(pattern: string, beats: number): readonly RhythmNote[] {
  const key = `${pattern}:${beats}`;
  const cached = rhythmCache.get(key);
  if (cached) return cached;
  const generated = clip({ notes: ["C4"], pattern, subdiv: "16n", amp: 100 });
  const totalTicks = generated.reduce((sum, note) => sum + note.length, 0);
  let ticks = 0;
  const result = generated.flatMap((note) => {
    const offsetBeats = ticks / totalTicks * beats;
    ticks += note.length;
    return note.note ? [{ offsetBeats, durationBeats: note.length / totalTicks * beats }] : [];
  });
  if (rhythmCache.size >= 128) rhythmCache.clear();
  rhythmCache.set(key, result);
  return result;
}

function patternFor(style: AccompanimentStyleId, role: EnsembleRole, busy: boolean, position: number): string {
  const answer = role === "answer" || role === "ornament";
  if (style === "opera") return answer ? "--x_____x_____--" : "x_______x_____--";
  if (style === "animation_ost") return answer ? "--x___x___x___--" : "x_____x_______--";
  if (busy && !answer) return position % 2 === 0 ? "x_______x_____--" : "x_____x_______--";
  if (style === "bossa") return answer ? "--x__-x__-x___--" : "x_____x__-x___--";
  if (style === "shuffle") return answer ? "--x_x___x_x___--" : "x___x___x_____--";
  if (style === "children_song" || style === "folk") {
    return answer ? "--x__-x___x___--" : "x___x___x_____--";
  }
  if (style === "kpop" || style === "riff" || style === "strum") {
    return answer ? "--x___x__-x___--" : "x_____x___x___--";
  }
  return answer ? "--x___x___x___--" : "x___x___x_____--";
}

function rhythmFor(options: PhraseOptions, role: EnsembleRole, beats: number): readonly RhythmNote[] {
  if (options.ending) return [{ offsetBeats: 0, durationBeats: Math.max(.1, beats - .12) }];
  const analysis = options.context?.melody ?? analyzeEnsembleMelody(options.notes);
  const busy = options.section === "song" && analysis.onsetDensity > 1.25;
  const position = options.context?.phrasePosition ?? options.measureIndex % 4;
  const source = phraseRhythm(patternFor(options.styleId, role, busy, position), beats);
  const gap = role === "answer" && options.section === "song"
    ? [...analysis.gaps].filter((item) => item.end - item.onset >= beats * .35)
      .sort((left, right) => right.end - right.onset - (left.end - left.onset))[0] : undefined;
  const held = !gap && role === "answer" && options.section === "song"
    ? spans(options.notes).find((note) => note.end - note.onset >= beats * .45) : undefined;
  const responseWindow = gap ?? (held ? { onset: held.onset + .5, end: held.end } : undefined);
  let result = responseWindow ? source.map((note) => ({
    offsetBeats: responseWindow.onset + note.offsetBeats / beats * (responseWindow.end - responseWindow.onset),
    durationBeats: note.durationBeats / beats * (responseWindow.end - responseWindow.onset)
  })) : source;
  // The response grows across the second half of a phrase; the sustained part
  // remains underneath. Their entrances and breaths consequently do not match.
  if (role === "answer" && position % 4 < 2 && !responseWindow && source.length > 2) {
    result = source.slice(1).map((note, index, response) => ({ ...note,
      durationBeats: Math.min(note.durationBeats + beats / 16,
        (response[index + 1]?.offsetBeats ?? beats - beats / 16) - note.offsetBeats - .02)
    }));
  }
  return result;
}

function spans(notes: readonly NoteEvent[]) {
  let cursor = 0;
  return notes.flatMap((note) => {
    const onset = cursor;
    cursor += toNumber(note.duration);
    return note.pitch === null ? [] : [{ pitch: note.pitch, onset, end: cursor }];
  });
}

const pc = (pitch: number) => ((pitch % 12) + 12) % 12;

function collision(pitch: number, other: number, overlap: number): number {
  const distance = Math.abs(pitch - other);
  const roughness = distance === 1 ? 30 : distance === 2 ? 12
    : distance === 11 || distance === 13 ? 17 : distance === 0 ? 8 : distance < 5 ? 2 : 0;
  return roughness * overlap;
}

/** Harmonic monophonic line: melody-derived contour, smooth travel, register and breathing. */
export function createAccompanimentPhrase(options: PhraseOptions): readonly PhraseNote[] {
  const beats = options.notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  if (beats <= 0) return [];
  const assignment = ensembleRoleForInstrument(options.context, options.instrumentId);
  const role = assignment?.role ?? "answer";
  const analysis = options.context?.melody ?? analyzeEnsembleMelody(options.notes);
  const melody = options.section === "song" ? spans(options.notes) : [];
  const rhythm = rhythmFor(options, role, beats);
  const [min, max, defaultCenter] = options.profile.range;
  const counter = role === "counterline" || role === "pad" || role === "harmony";
  const center = assignment?.registerCenter ?? defaultCenter;
  const targetCenter = options.section !== "song" || analysis.activeFraction === 0 ? center
    : counter ? Math.max(min + 4, Math.min(center, analysis.medianPitch - 7))
      : Math.min(max - 3, Math.max(center, analysis.medianPitch + 7));
  const motif = options.context?.motif ?? [];
  const localContour = analysis.contour;
  const chordBeats = beats / options.chords.length;
  const result: PhraseNote[] = [];
  let previous = options.previousPitch ?? targetCenter;
  for (const [index, source] of rhythm.entries()) {
    const end = source.offsetBeats + source.durationBeats;
    let onset = source.offsetBeats;
    while (onset < end - .001) {
      const chordIndex = Math.min(options.chords.length - 1, Math.floor((onset + .0001) / chordBeats));
      const boundary = Math.min(end, (chordIndex + 1) * chordBeats);
      const symbol = options.chords[chordIndex];
      const tones = symbol ? chordPitchClasses(symbol.split("/")[0]) : options.fallbackPitches.map(pc);
      const direction = localContour[index % Math.max(1, localContour.length)] ??
        motif[(index + (options.context?.phrasePosition ?? 0)) % Math.max(1, motif.length)]?.interval ?? 0;
      const gesture = Math.max(-5, Math.min(5, direction)) * (counter ? -.65 : .8);
      const arch = options.ending ? 0 : [0, 3, 1, -2][(index + options.measureIndex) % 4];
      const target = targetCenter + gesture + arch;
      const nextSymbol = options.context?.next?.chords?.[0];
      const nextTones = nextSymbol ? chordPitchClasses(nextSymbol.split("/")[0]) : [];
      const candidates: number[] = [];
      for (let pitch = min; pitch <= max; pitch += 1) if (tones.includes(pc(pitch))) candidates.push(pitch);
      const score = (pitch: number) => {
        const duration = boundary - onset;
        const melodyCost = melody.reduce((sum, note) => sum + collision(pitch, note.pitch,
          Math.max(0, Math.min(boundary, note.end) - Math.max(onset, note.onset)) / duration), 0);
        const peerCost = (options.peerNotes ?? []).reduce((sum, note) => sum + collision(pitch, note.pitch,
          Math.max(0, Math.min(boundary, (note.offsetSeconds + note.durationSeconds) / options.secondsPerBeat) -
            Math.max(onset, note.offsetSeconds / options.secondsPerBeat)) / duration) * .75, 0);
        const leap = Math.abs(pitch - previous);
        const repeated = result.length > 0 && pitch === previous && !options.ending ? 3.8 : 0;
        const cadence = options.ending && pc(pitch) !== tones[0] ? 2 : 0;
        const connection = index === rhythm.length - 1 && nextTones.includes(pc(pitch)) ? -1.8 : 0;
        return Math.abs(pitch - target) * .65 + leap * .52 + Math.max(0, leap - 7) * 2 +
          melodyCost + peerCost + repeated + cadence + connection;
      };
      const pitch = candidates.sort((left, right) => score(left) - score(right) || left - right)[0];
      if (pitch !== undefined) {
        const phrasePosition = options.context?.phrasePosition ?? options.measureIndex % 4;
        const swell = Math.sin((index + 1) / (rhythm.length + 1) * Math.PI) * .12;
        result.push({ pitch, offsetBeats: onset, durationBeats: boundary - onset,
          velocity: (counter ? .87 : .94) + swell + (phrasePosition >= 2 ? .035 : 0) });
        previous = pitch;
      }
      onset = boundary;
    }
  }
  return result;
}
