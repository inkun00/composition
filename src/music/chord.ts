const naturalPitchClass: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11
};

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function rootPitchClass(symbol: string): { pitchClass: number; length: number } | null {
  const roman: Record<string, number> = { I: 0, IV: 5, V: 7 };
  if (roman[symbol]) return { pitchClass: roman[symbol], length: symbol.length };
  if (symbol === "I") return { pitchClass: 0, length: 1 };

  const match = symbol.match(/^([A-G])([#♯b♭]?)/);
  if (!match) return null;
  const accidental = match[2] === "#" || match[2] === "♯" ? 1
    : match[2] === "b" || match[2] === "♭" ? -1 : 0;
  return { pitchClass: mod12(naturalPitchClass[match[1]] + accidental), length: match[0].length };
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values.map(mod12))];
}

export function chordPitchClasses(rawSymbol: string): readonly number[] {
  const symbol = rawSymbol.replaceAll(" ", "");
  // Augmented-sixth chords have different colour tones.  Treating all three as
  // the same triad made three supposedly different presets sound identical.
  if (/^It\+6/.test(symbol)) return [8, 0, 6];
  if (/^Fr\+6/.test(symbol)) return [8, 0, 2, 6];
  if (/^Ger\+6/.test(symbol)) return [8, 0, 3, 6];

  const main = symbol.split("/")[0];
  const root = rootPitchClass(main);
  if (!root) return [0, 4, 7];
  const quality = main.slice(root.length);
  let intervals: number[];

  if (/dim|°|m7♭5|m7b5/i.test(quality)) intervals = [0, 3, 6];
  else if (/aug|\+/.test(quality)) intervals = [0, 4, 8];
  else if (/sus4/i.test(quality)) intervals = [0, 5, 7];
  else if (/^5$/.test(quality)) intervals = [0, 7];
  else if (/^m(?!aj)/i.test(quality)) intervals = [0, 3, 7];
  else intervals = [0, 4, 7];

  if (/maj7|\(maj7\)/i.test(quality)) intervals.push(11);
  else if (/7|9|13/.test(quality)) intervals.push(10);
  if (/^6/.test(quality)) intervals.push(9);
  if (/9/.test(quality)) intervals.push(14);
  if (/13/.test(quality)) intervals.push(21);

  const pitchClasses = intervals.map((interval) => root.pitchClass + interval);
  const slashBass = symbol.split("/")[1];
  const bassRoot = slashBass ? rootPitchClass(slashBass) : null;
  if (bassRoot) pitchClasses.unshift(bassRoot.pitchClass);
  return unique(pitchClasses);
}

export function chordMidiPitches(symbol: string): readonly number[] {
  const pitchClasses = chordPitchClasses(symbol);
  const bassClass = pitchClasses[0];
  let bass = 48 + bassClass;
  while (bass > 53) bass -= 12;
  return pitchClasses.slice(0, 4).map((pitchClass, index) => {
    if (index === 0) return bass;
    let pitch = 48 + pitchClass;
    while (pitch <= bass) pitch += 12;
    while (pitch > 64) pitch -= 12;
    return pitch;
  });
}

export function nearestChordTone(target: number, symbol: string): number {
  const allowed = chordPitchClasses(symbol);
  let best = target;
  let distance = Number.POSITIVE_INFINITY;
  for (let pitch = 52; pitch <= 84; pitch += 1) {
    if (!allowed.includes(mod12(pitch))) continue;
    const nextDistance = Math.abs(pitch - target);
    if (nextDistance < distance || (nextDistance === distance && pitch < best)) {
      best = pitch;
      distance = nextDistance;
    }
  }
  return best;
}

export function chordSequenceKey(chords: readonly string[]): string {
  let hash = 0;
  for (const char of chords.join("→")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

const scaleDegreeByLetter: Readonly<Record<string, number>> = {
  C: 1, D: 2, E: 3, F: 4, G: 5, A: 6, B: 7
};

export function chordDegreeLabel(rawSymbol: string): string {
  const symbol = rawSymbol.replaceAll(" ", "");
  if (/^(It|Fr|Ger)\+6/.test(symbol)) return "♭6도";
  const roman = symbol.match(/^(IV|V|I)(?:$|[^IV])/);
  if (roman) return `${({ I: 1, IV: 4, V: 5 } as const)[roman[1] as "I" | "IV" | "V"]}도`;

  const match = symbol.match(/^([A-G])([#♯b♭]?)/);
  if (!match) return "특별";
  const accidental = match[2] === "#" || match[2] === "♯" ? "♯"
    : match[2] === "b" || match[2] === "♭" ? "♭" : "";
  return `${accidental}${scaleDegreeByLetter[match[1]]}도`;
}

export function chordDegreeSequence(chords: readonly string[]): string {
  return `${chords.map(chordDegreeLabel).join(" → ")} 화음`;
}
