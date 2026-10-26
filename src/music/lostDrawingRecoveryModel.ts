import { decompressFromUTF16 } from "lz-string";
import { decodeCloudDraft, decodeCloudScenes } from "../firebase/cloudDraft";
import { isMusicVideoScenes, type MusicVideoScene } from "../video/musicVideoModel";
import { DRAFT_COMPRESSED_PREFIX, isSavedDraft, type SavedDraft } from "./draft";

export type LostDrawingSourceKind = "primary" | "backup" | "damaged" | "archive" | "legacy" | "cloud";
export type LostDrawingRecoveryCandidate = Readonly<{
  id: string;
  projectId?: string;
  title: string;
  updatedAt: number;
  scenes: readonly MusicVideoScene[];
  draft?: SavedDraft;
  source: string;
  sourceKind: LostDrawingSourceKind;
  reason: string;
  partial: boolean;
  currentPointer?: boolean;
  preserved?: boolean;
}>;
export type LostDrawingRecordSource = Readonly<{
  value: unknown;
  source: string;
  sourceKind: LostDrawingSourceKind;
  currentPointer?: boolean;
}>;

const MAX_RAW_CHARACTERS = 16_000_000;

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const fields = item as Record<string, unknown>;
    return Object.fromEntries(Object.keys(fields).sort().map((key) => [key, fields[key]]));
  });
}

export function lostDrawingSceneFingerprint(scenes: readonly MusicVideoScene[]): string {
  // Restoration prompts describe surviving artwork. Rebinding a project or
  // changing motion/timing must not make the same picture look newly lost.
  const text = canonical(scenes.map((scene) => ({ background: scene.background,
    elements: scene.elements.map(({ tool, color, width, points }) => ({ tool, color, width, points })) })));
  let hash = 14695981039346656037n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `drawings-${hash.toString(36)}-${text.length}`;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringEnd(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index + 1;
  }
  return -1;
}

function objectEnd(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '"') {
      const end = stringEnd(text, index);
      if (end < 0) return -1;
      index = end - 1;
    } else if (text[index] === "{") depth += 1;
    else if (text[index] === "}" && --depth === 0) return index + 1;
  }
  return -1;
}

/** Only complete JSON object substrings are parsed; missing points are never invented. */
function intactSceneFragments(text: string): unknown[] {
  const recovered: unknown[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '"') continue;
    const end = stringEnd(text, index);
    if (end < 0) break;
    let key: unknown;
    try { key = JSON.parse(text.slice(index, end)); } catch { index = end - 1; continue; }
    index = end - 1;
    if (key !== "musicVideoScenes") continue;
    const colon = text.slice(end).match(/^\s*:\s*\[/);
    if (!colon) continue;
    let cursor = end + colon[0].length;
    while (cursor < text.length) {
      while (/[\s,]/.test(text[cursor] ?? "")) cursor += 1;
      if (text[cursor] !== "{") break;
      const close = objectEnd(text, cursor);
      if (close < 0) break;
      try { recovered.push(JSON.parse(text.slice(cursor, close))); } catch { /* Keep only complete valid scenes. */ }
      cursor = close;
    }
  }
  return recovered;
}

function parsedRecord(value: unknown): { value: unknown; fragments: boolean } {
  if (typeof value !== "string") return { value, fragments: false };
  if (value.length > MAX_RAW_CHARACTERS) return { value: null, fragments: false };
  let text = value;
  if (text.startsWith(DRAFT_COMPRESSED_PREFIX)) {
    try { text = decompressFromUTF16(text.slice(DRAFT_COMPRESSED_PREFIX.length)) ?? ""; }
    catch { return { value: null, fragments: false }; }
    if (!text || text.length > MAX_RAW_CHARACTERS) return { value: null, fragments: false };
  }
  try { return { value: JSON.parse(text.replace(/^\uFEFF/, "")), fragments: false }; }
  catch { return { value: { musicVideoScenes: intactSceneFragments(text) }, fragments: true }; }
}

function sceneArrays(record: unknown): unknown[][] {
  if (Array.isArray(record)) return [record];
  const fields = object(record);
  if (!fields) return [];
  const sceneFields = ["musicVideoScenes", "musicVideoScenesJson", "musicVideoScenesLz"]
    .filter((key) => Object.hasOwn(fields, key));
  if (sceneFields.length > 1) return [];
  const arrays: unknown[][] = [];
  if (Array.isArray(fields.musicVideoScenes)) arrays.push(fields.musicVideoScenes);
  if (fields.format === "maeum-melody-scene" && fields.scene) arrays.push([fields.scene]);
  for (const key of ["musicVideoScenesJson", "musicVideoScenesLz"] as const) {
    if (typeof fields[key] !== "string") continue;
    const decoded = decodeCloudScenes({ [key]: fields[key] });
    if (decoded) arrays.push([...decoded]);
    else if (key === "musicVideoScenesJson" && fields[key].length <= MAX_RAW_CHARACTERS) {
      try { const raw: unknown = JSON.parse(fields[key]); if (Array.isArray(raw)) arrays.push(raw); } catch { /* Encoded JSON is incomplete. */ }
    }
  }
  return arrays;
}

function groupedValidScenes(values: unknown[]): readonly MusicVideoScene[][] {
  const groups: MusicVideoScene[][] = [];
  let current: MusicVideoScene[] = [];
  for (const value of values) {
    if (!isMusicVideoScenes([value])) continue;
    const scene = value as MusicVideoScene;
    if (!isMusicVideoScenes([...current, scene])) {
      if (current.some((item) => item.elements.length > 0)) groups.push(current);
      current = [];
    }
    current.push(scene);
  }
  if (current.some((item) => item.elements.length > 0)) groups.push(current);
  return groups;
}

export function extractLostDrawingCandidates(input: LostDrawingRecordSource): LostDrawingRecoveryCandidate[];
export function extractLostDrawingCandidates(value: unknown, source: string, sourceKind: LostDrawingSourceKind): LostDrawingRecoveryCandidate[];
export function extractLostDrawingCandidates(value: unknown, source?: string, sourceKind?: LostDrawingSourceKind): LostDrawingRecoveryCandidate[] {
  const input = source === undefined ? value as LostDrawingRecordSource : { value, source, sourceKind: sourceKind! };
  const parsed = parsedRecord(input.value);
  const outer = object(parsed.value);
  const record = outer && object(outer.draft) ? outer.draft : parsed.value;
  const fields = object(record);
  const encoded = fields && (Object.hasOwn(fields, "musicVideoScenesJson") || Object.hasOwn(fields, "musicVideoScenesLz"));
  const completeDraft = encoded ? decodeCloudDraft(record) ?? undefined : isSavedDraft(record) ? record : undefined;
  const candidates: LostDrawingRecoveryCandidate[] = [];
  for (const values of sceneArrays(record)) {
    const groups = groupedValidScenes(values);
    for (const scenes of groups) {
      const partial = parsed.fragments || !completeDraft || groups.length !== 1 || scenes.length !== values.length;
      const id = typeof fields?.projectId === "string" && fields.projectId.length <= 160 ? fields.projectId : undefined;
      candidates.push({
        id: `${input.sourceKind === "cloud" ? `${input.source}:` : ""}${lostDrawingSceneFingerprint(scenes)}`, projectId: id,
        title: typeof fields?.title === "string" && fields.title.trim() ? fields.title.slice(0, 120) : "기기에 남아 있는 그림",
        updatedAt: typeof fields?.updatedAt === "number" && Number.isFinite(fields.updatedAt) ? fields.updatedAt : 0,
        scenes, ...(completeDraft && !partial ? { draft: completeDraft } : {}), source: input.source,
        sourceKind: input.sourceKind, partial, currentPointer: input.currentPointer,
        reason: parsed.fragments ? "손상된 저장 기록에서 완전한 장면을 찾았어요." : partial
          ? "악보 전체를 열 수 없지만 남아 있는 그림은 복구할 수 있어요." : input.sourceKind === "backup"
            ? "이전 자동 저장본에 그림이 남아 있어요." : input.sourceKind === "damaged"
              ? "별도로 보관된 원본에서 그림을 찾았어요." : "이 기기에 저장된 그림을 찾았어요."
      });
    }
  }
  return candidates;
}
