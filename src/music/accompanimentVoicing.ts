import { distance, fromMidi, midi, pitchClass } from "@tonaljs/note";
import { search } from "@tonaljs/voicing";

const candidateCache = new Map<string, readonly (readonly number[])[]>();
const maximumCachedChords = 512;

function pc(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

/** Keep the defining colour tones when an extended chord needs four voices. */
export function chordVoicingClasses(tones: readonly number[]): readonly number[] {
  const classes = [...new Set(tones.filter(Number.isInteger).map(pc))];
  if (classes.length <= 4) return classes;
  if (classes.length === 5) return [classes[0], classes[1], classes[3], classes[4]];
  return [classes[1], classes[3], classes[4], classes[classes.length - 1]];
}

function intervalSets(classes: readonly number[]): readonly string[] {
  const tonic = classes[0];
  const rootNote = fromMidi(60 + tonic);
  const offsets = classes.map((tone) => pc(tone - tonic)).sort((left, right) => left - right);
  const shapes = new Set<string>();
  const addShape = (pitches: readonly number[]) => {
    const sorted = [...pitches].sort((left, right) => left - right);
    const shift = sorted[0] < 0 ? 12 : 0;
    shapes.add(sorted.map((offset) => distance(rootNote, fromMidi(60 + tonic + offset + shift))).join(" "));
  };

  for (let inversion = 0; inversion < offsets.length; inversion += 1) {
    const closed = [...offsets.slice(inversion), ...offsets.slice(0, inversion).map((offset) => offset + 12)];
    addShape(closed);
    // Drop the second highest voice an octave to leave room in the inner
    // register. This creates open voicings without adding any new chord tone.
    if (closed.length >= 3) {
      const dropTwo = [...closed];
      dropTwo[dropTwo.length - 2] -= 12;
      addShape(dropTwo);
    }
  }
  return [...shapes];
}

/**
 * Tonal enumerates closed and drop-two inversions in the instrument's range.
 * The custom dictionary contains only the student's actual chord tones;
 * Tonal's jazz dictionary would otherwise add ninths and other extensions.
 * An empty result lets the caller handle an instrument too narrow for a chord.
 */
export function accompanimentVoicingCandidates(
  tones: readonly number[], range: readonly number[]
): readonly (readonly number[])[] {
  const classes = chordVoicingClasses(tones);
  const [rangeMin, rangeMax] = range;
  if (!classes.length || !Number.isFinite(rangeMin) || !Number.isFinite(rangeMax)) return [];
  const min = Math.max(0, Math.ceil(rangeMin));
  const max = Math.min(127, Math.floor(rangeMax));
  if (min > max) return [];
  const center = Number.isFinite(range[2]) ? range[2] : (min + max) / 2;
  const cacheKey = `${classes.join(",")}:${min}:${max}:${center}`;
  const cached = candidateCache.get(cacheKey);
  if (cached) return cached;

  const tonic = pitchClass(fromMidi(60 + classes[0]));
  // The empty chord suffix is a dictionary key, not a claim that every input
  // is major. Its interval sets encode minor, altered and special chords too.
  const dictionary = { "": [...intervalSets(classes)] };
  const candidates = search(tonic, [fromMidi(min), fromMidi(max)], dictionary);
  const unique = new Map<string, readonly number[]>();
  for (const candidate of candidates) {
    const pitches = candidate.map(midi);
    if (pitches.some((pitch) => pitch === null)) continue;
    const valid = (pitches as number[]).sort((left, right) => left - right);
    if (valid.length !== classes.length || new Set(valid.map(pc)).size !== classes.length) continue;
    if (valid.some((pitch) => pitch < min || pitch > max || !classes.includes(pc(pitch)))) continue;
    unique.set(valid.join(","), Object.freeze(valid));
  }
  const result = Object.freeze([...unique.values()].sort((left, right) => {
    const average = (pitches: readonly number[]) => pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length;
    return Math.abs(average(left) - center) - Math.abs(average(right) - center)
      || left[0] - right[0];
  }));
  if (candidateCache.size >= maximumCachedChords) {
    const oldest = candidateCache.keys().next().value;
    if (oldest !== undefined) candidateCache.delete(oldest);
  }
  candidateCache.set(cacheKey, result);
  return result;
}
