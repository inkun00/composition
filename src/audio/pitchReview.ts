import type { NoteEvent } from "../music/types";
import { toNumber } from "../music/rational";

export type RecordingPitchReview = Readonly<{
  noteId: string;
  measureIndex: number;
  expectedPitch: number;
  startSeconds: number;
  endSeconds: number;
  detectedPitch: number | null;
  cents: number | null;
  status: "good" | "close" | "off" | "unavailable";
}>;

export type ReviewMeasure = Readonly<{ notes: readonly NoteEvent[]; measureIndex: number }>;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// A small normalized autocorrelation detector. It is deliberately conservative:
// when the recording contains mostly accompaniment or noise it returns null
// instead of pretending to know the singer's pitch.
function detectPitch(samples: Float32Array, sampleRate: number): number | null {
  if (samples.length < 512) return null;
  let mean = 0;
  let power = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  for (const sample of samples) power += (sample - mean) ** 2;
  const rms = Math.sqrt(power / samples.length);
  if (rms < .009) return null;

  const minimumLag = Math.floor(sampleRate / 900);
  const maximumLag = Math.min(Math.floor(sampleRate / 80), Math.floor(samples.length / 2));
  let bestLag = 0;
  let bestCorrelation = 0;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let correlation = 0;
    let firstPower = 0;
    let secondPower = 0;
    for (let index = 0; index < samples.length - lag; index += 1) {
      const first = samples[index] - mean;
      const second = samples[index + lag] - mean;
      correlation += first * second;
      firstPower += first * first;
      secondPower += second * second;
    }
    const normalized = correlation / Math.sqrt(firstPower * secondPower || 1);
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }
  if (bestLag === 0 || bestCorrelation < .56) return null;
  return sampleRate / bestLag;
}

function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function reviewRecordedPitch(
  buffer: AudioBuffer,
  measures: readonly ReviewMeasure[],
  introSeconds: number,
  secondsPerBeat: number
): readonly RecordingPitchReview[] {
  const samples = buffer.getChannelData(0);
  const reviews: RecordingPitchReview[] = [];
  let songCursor = introSeconds;

  measures.forEach((measure) => {
    measure.notes.forEach((note) => {
      const durationSeconds = toNumber(note.duration) * secondsPerBeat;
      const startSeconds = songCursor;
      const endSeconds = startSeconds + durationSeconds;
      songCursor = endSeconds;
      if (note.pitch === null || durationSeconds < .16) return;

      const analysisLength = Math.min(4096, Math.max(1024, Math.floor(durationSeconds * buffer.sampleRate * .54)));
      const centralStart = startSeconds + Math.max(.025, (durationSeconds - analysisLength / buffer.sampleRate) / 2);
      const offsets = [-.035, 0, .035];
      const frequencies = offsets.flatMap((offset) => {
        const sampleStart = Math.max(0, Math.floor((centralStart + offset) * buffer.sampleRate));
        const frame = samples.subarray(sampleStart, Math.min(samples.length, sampleStart + analysisLength));
        const frequency = detectPitch(frame, buffer.sampleRate);
        return frequency ? [frequency] : [];
      });
      const frequency = median(frequencies);
      const detectedPitch = frequency === null ? null : frequencyToMidi(frequency);
      const cents = detectedPitch === null ? null : Math.round((detectedPitch - note.pitch) * 100);
      const distance = cents === null ? null : Math.abs(cents);
      reviews.push({
        noteId: note.id,
        measureIndex: measure.measureIndex,
        expectedPitch: note.pitch,
        startSeconds,
        endSeconds,
        detectedPitch,
        cents,
        status: distance === null ? "unavailable" : distance < 40 ? "good" : distance < 90 ? "close" : "off"
      });
    });
  });
  return reviews;
}
