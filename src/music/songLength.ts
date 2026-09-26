export const MIN_SONG_LENGTH = 8;
export const MAX_SONG_LENGTH = 32;
export const QUICK_SONG_LENGTHS = [8, 12, 16, 24, 32] as const;

export type SongLength = number;

export function isSongLength(value: unknown): value is SongLength {
  return Number.isSafeInteger(value) && (value as number) >= MIN_SONG_LENGTH;
}
