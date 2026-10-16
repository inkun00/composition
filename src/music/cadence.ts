const CHROMATIC_ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NATURAL_ROOTS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function cadenceChords(target: string): readonly [string, string, string] | null {
  const compact = target.replaceAll(" ", "").split("/")[0];
  if (/^I(?:$|[^V])/.test(compact)) return ["IV", "V7", "I"];
  const match = compact.match(/^([A-G])([#♯b♭]?)(.*)$/);
  if (!match) return null;
  const accidental = match[2] === "#" || match[2] === "♯" ? 1
    : match[2] === "b" || match[2] === "♭" ? -1 : 0;
  const root = (NATURAL_ROOTS[match[1]] + accidental + 12) % 12;
  const isMinor = /^m(?!aj)/i.test(match[3]);
  const subdominant = `${CHROMATIC_ROOTS[(root + 5) % 12]}${isMinor ? "m" : ""}`;
  const dominant = `${CHROMATIC_ROOTS[(root + 7) % 12]}7`;
  const tonic = `${CHROMATIC_ROOTS[root]}${isMinor ? "m" : ""}`;
  return [subdominant, dominant, tonic];
}
