import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { isSavedDraft, type SavedDraft } from "../music/draft";
import { isMusicVideoScenes, type MusicVideoScene } from "../video/musicVideoModel";

/** Leave room for the score and document metadata under Firestore's document limit. */
export const MAX_CLOUD_SCENE_BYTES = 700_000;
export const MAX_CLOUD_EXPANDED_SCENE_BYTES = 8_000_000;
/** JSON overestimates Firestore strings; reserve extra room for document fields and names. */
export const MAX_CLOUD_DRAFT_BYTES = 900_000;

export type CloudDraft = Omit<SavedDraft, "musicVideoScenes"> & Readonly<{
  musicVideoScenesJson?: string;
  musicVideoScenesLz?: string;
}>;

const encoder = new TextEncoder();
const compressedAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-";
const sizeError = "그림 데이터가 너무 커서 클라우드에 저장할 수 없어요. 장면이나 선을 줄여 주세요.";

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function sceneJson(scenes: readonly MusicVideoScene[]): string {
  if (!isMusicVideoScenes(scenes)) throw new Error("뮤직비디오의 장면 정보를 다시 확인해 주세요.");
  const json = JSON.stringify(scenes);
  if (byteLength(json) > MAX_CLOUD_EXPANDED_SCENE_BYTES) throw new Error(sizeError);
  return json;
}

/** Read LZ phrase lengths first, so hostile data cannot allocate unbounded decoded strings. */
function boundedExpandedLength(encoded: string): number | null {
  if (!encoded || encoded.length > MAX_CLOUD_SCENE_BYTES || !/^[A-Za-z0-9+-]+$/.test(encoded)) return null;
  let offset = 0;
  function readBits(width: number): number {
    if (offset + width > encoded.length * 6) throw new Error("truncated-scene-data");
    let value = 0;
    for (let bit = 0; bit < width; bit++, offset++) {
      const character = compressedAlphabet.indexOf(encoded[Math.floor(offset / 6)]);
      value += ((character >> (5 - offset % 6)) & 1) * 2 ** bit;
    }
    return value;
  }
  function finished(length: number): number | null {
    const remaining = encoded.length * 6 - offset;
    return remaining <= 6 && readBits(remaining) === 0 ? length : null;
  }
  try {
    const initial = readBits(2);
    if (initial === 2) return finished(0);
    if (initial !== 0 && initial !== 1) return null;
    readBits(initial === 0 ? 8 : 16);
    const lengths = [0, 0, 0, 1];
    let previousLength = 1;
    let totalLength = 1;
    let dictionarySize = 4;
    let enlargeIn = 4;
    let width = 3;
    while (true) {
      let code = readBits(width);
      if (code === 2) return finished(totalLength);
      if (code === 0 || code === 1) {
        readBits(code === 0 ? 8 : 16);
        lengths[dictionarySize++] = 1;
        code = dictionarySize - 1;
        enlargeIn--;
      }
      if (enlargeIn === 0) {
        enlargeIn = 2 ** width;
        width++;
      }
      const entryLength = lengths[code] || (code === dictionarySize ? previousLength + 1 : 0);
      if (!entryLength) return null;
      totalLength += entryLength;
      if (totalLength > MAX_CLOUD_EXPANDED_SCENE_BYTES) return null;
      lengths[dictionarySize++] = previousLength + 1;
      previousLength = entryLength;
      enlargeIn--;
      if (enlargeIn === 0) {
        enlargeIn = 2 ** width;
        width++;
      }
    }
  } catch {
    return null;
  }
}

function decodedSceneJson(stored: Record<string, unknown>): string | null {
  if (Object.hasOwn(stored, "musicVideoScenesJson")) {
    return typeof stored.musicVideoScenesJson === "string" &&
      byteLength(stored.musicVideoScenesJson) <= MAX_CLOUD_SCENE_BYTES ? stored.musicVideoScenesJson : null;
  }
  if (typeof stored.musicVideoScenesLz !== "string") return null;
  const expectedLength = boundedExpandedLength(stored.musicVideoScenesLz);
  if (expectedLength === null) return null;
  const json = decompressFromEncodedURIComponent(stored.musicVideoScenesLz);
  return typeof json === "string" && json.length === expectedLength &&
    byteLength(json) <= MAX_CLOUD_EXPANDED_SCENE_BYTES ? json : null;
}

function fitsCloudDraft(draft: Record<string, unknown>): boolean {
  return byteLength(JSON.stringify(draft)) <= MAX_CLOUD_DRAFT_BYTES;
}

/** Firestore rejects arrays inside arrays; keep drawing point tuples in one JSON string. */
export function encodeCloudDraft(draft: SavedDraft): CloudDraft {
  const clean = JSON.parse(JSON.stringify(draft)) as Record<string, unknown>;
  delete clean.musicVideoScenes;
  delete clean.musicVideoScenesJson;
  delete clean.musicVideoScenesLz;
  if (draft.musicVideoScenes === undefined) {
    if (!fitsCloudDraft(clean)) throw new Error(sizeError);
    return clean as CloudDraft;
  }
  const json = sceneJson(draft.musicVideoScenes);
  const plain = { ...clean, musicVideoScenesJson: json };
  if (byteLength(json) <= MAX_CLOUD_SCENE_BYTES && fitsCloudDraft(plain)) return plain as CloudDraft;
  const compressed = compressToEncodedURIComponent(json);
  const compact = { ...clean, musicVideoScenesLz: compressed };
  if (compressed.length > MAX_CLOUD_SCENE_BYTES || !fitsCloudDraft(compact)) throw new Error(sizeError);
  return compact as CloudDraft;
}

/** Recover only validated drawings when unrelated score fields no longer load. */
export function decodeCloudScenes(value: unknown): readonly MusicVideoScene[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  try {
    const fields = ["musicVideoScenes", "musicVideoScenesJson", "musicVideoScenesLz"]
      .filter((field) => Object.hasOwn(stored, field));
    if (fields.length !== 1) return null;
    if (fields[0] === "musicVideoScenes") {
      const scenes = stored.musicVideoScenes;
      return isMusicVideoScenes(scenes) && byteLength(sceneJson(scenes)) <= MAX_CLOUD_SCENE_BYTES ? scenes : null;
    }
    const json = decodedSceneJson(stored);
    if (json === null) return null;
    const scenes: unknown = JSON.parse(json);
    return isMusicVideoScenes(scenes) ? scenes : null;
  } catch {
    return null;
  }
}

/** Invalid drawing data invalidates the saved item instead of silently discarding drawings. */
export function decodeCloudDraft(value: unknown): SavedDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  try {
    const fields = ["musicVideoScenes", "musicVideoScenesJson", "musicVideoScenesLz"]
      .filter((field) => Object.hasOwn(stored, field));
    if (fields.length > 1) return null;
    if (Object.hasOwn(stored, "musicVideoScenesJson") || Object.hasOwn(stored, "musicVideoScenesLz")) {
      const scenes = decodeCloudScenes(stored);
      if (scenes === null) return null;
      const { musicVideoScenesJson: _encoded, musicVideoScenesLz: _compressed, ...draft } = stored;
      const decoded = { ...draft, musicVideoScenes: scenes };
      return isSavedDraft(decoded) ? decoded : null;
    }
    if (!isSavedDraft(stored)) return null;
    if (stored.musicVideoScenes !== undefined && byteLength(sceneJson(stored.musicVideoScenes)) > MAX_CLOUD_SCENE_BYTES) return null;
    return stored;
  } catch {
    return null;
  }
}
