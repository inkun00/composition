import { getNote, type NoteId } from "../learningModel";

export type TrainRound = { title: string; mission: string; notes: NoteId[] };
export type TrainCue = { index: number; id: NoteId; beat: number; duration: number; rest: boolean };
export type TrainHit = { index: number; offsetMs: number; quality: "perfect" | "good" };
export type TrainResult = { score: number; stars: number; accuracy: number; hits: number; total: number; extras: number };

export const TRAIN_BPM = 80;
export const TRAIN_ROUNDS: TrainRound[] = [
  { title: "첫 번째 역 · 한 박씩 톡톡", mission: "4분음표 네 개! 한 박에 한 번씩 눌러 출발해요.", notes: ["quarter", "quarter", "quarter", "quarter"] },
  { title: "두 번째 역 · 쉼표 터널", mission: "쉼표에서는 누르지 않아요. 소리를 쉬어도 박자는 계속 가요.", notes: ["quarter", "quarter-rest", "quarter", "quarter"] },
  { title: "마지막 역 · 긴 음, 짧은 음", mission: "2분음표는 한 번 누른 뒤 두 박 기다려요. 마지막 8분음표는 반 박씩!", notes: ["half", "quarter", "eighth", "eighth"] }
];

export function trainTimeline(notes: readonly NoteId[]): TrainCue[] {
  let beat = 0;
  return notes.map((id, index) => {
    const note = getNote(id);
    const cue = { index, id, beat, duration: note.beats, rest: note.rest };
    beat += note.beats;
    return cue;
  });
}

/** Match the nearest remaining onset; repeated inputs never earn the same note twice. */
export function judgeTrainTap(cues: readonly TrainCue[], elapsedMs: number, bpm: number,
  windowMs: number, hits: readonly TrainHit[]): TrainHit | null {
  const beatMs = 60_000 / bpm;
  const remaining = cues.filter((cue) => !cue.rest && !hits.some((hit) => hit.index === cue.index));
  const closest = remaining.sort((a, b) =>
    Math.abs(elapsedMs - a.beat * beatMs) - Math.abs(elapsedMs - b.beat * beatMs))[0];
  if (!closest) return null;
  const offsetMs = elapsedMs - closest.beat * beatMs;
  if (Math.abs(offsetMs) > windowMs) return null;
  return { index: closest.index, offsetMs, quality: Math.abs(offsetMs) <= 95 ? "perfect" : "good" };
}

export function trainResult(cues: readonly TrainCue[], hits: readonly TrainHit[], extras: number): TrainResult {
  const total = cues.filter((cue) => !cue.rest).length;
  const accuracy = total ? Math.max(0, (hits.length - extras * 0.5) / total) : 0;
  const score = Math.max(0, hits.reduce((sum, hit) => sum + (hit.quality === "perfect" ? 100 : 70), 0) - extras * 25);
  return { score, accuracy, hits: hits.length, total, extras, stars: accuracy >= 0.9 ? 3 : accuracy >= 0.6 ? 2 : 1 };
}
