import { ACCOMPANIMENT_STYLES, MAX_SAVED_ACCOMPANIMENT_INSTRUMENTS } from "./accompaniment";
import { isSavedDraft, type SavedDraft } from "./draft";
import { isValidInstrumentId } from "./instruments";
import { isSoundEffectId } from "./soundEffects";
import type { NoteEvent, SoundEffectEvent } from "./types";

export type SaveIssueTarget = "title" | "creator" | "description" | "measure" | "settings" | "cloud";

export type SaveIssue = Readonly<{
  target: SaveIssueTarget;
  message: string;
  measureIndex?: number;
}>;

function noteIssue(note: NoteEvent, measureIndex: number): SaveIssue | null {
  const label = `${measureIndex + 1}마디`;
  if (!note.id || note.id.length > 120) return { target: "measure", measureIndex, message: `${label}의 음표 정보가 너무 길어요.` };
  if (note.pitch !== null && (!Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127)) {
    return { target: "measure", measureIndex, message: `${label}에 저장할 수 없는 음높이가 있어요.` };
  }
  if (!Number.isInteger(note.duration?.numerator) || !Number.isInteger(note.duration?.denominator) || note.duration.denominator <= 0) {
    return { target: "measure", measureIndex, message: `${label}의 음표 길이 정보가 올바르지 않아요.` };
  }
  if (note.lyric !== undefined && (typeof note.lyric !== "string" || note.lyric.length > 2)) {
    return { target: "measure", measureIndex, message: `${label}의 음표에는 가사를 두 글자까지만 넣을 수 있어요.` };
  }
  return null;
}

function effectIssue(effect: SoundEffectEvent, measureIndex: number): SaveIssue | null {
  if (!effect.id || effect.id.length > 120 || !isSoundEffectId(effect.effectId) ||
    !Number.isFinite(effect.offsetBeats) || effect.offsetBeats < 0 || effect.offsetBeats > 16) {
    return { target: "measure", measureIndex, message: `${measureIndex + 1}마디의 효과음 위치나 종류를 다시 확인해 주세요.` };
  }
  return null;
}

export function findDraftSaveIssues(draft: SavedDraft): SaveIssue[] {
  const issues: SaveIssue[] = [];
  if (draft.title.length > 60) issues.push({ target: "title", message: "곡 제목은 60자까지 저장할 수 있어요." });
  if (draft.creator.length > 40 || draft.originalCreator.length > 40) {
    issues.push({ target: "creator", message: "작곡가 이름은 40자까지 저장할 수 있어요." });
  }
  if ((draft.description?.length ?? 0) > 600) {
    issues.push({ target: "description", message: "노래 이야기는 600자까지 저장할 수 있어요." });
  }
  if (!draft.sourceHash || draft.sourceHash.length <= 50_000) {
    // 빈 공유 주소는 정상입니다.
  } else {
    issues.push({ target: "settings", message: "공유 정보가 너무 커서 저장할 수 없어요. 새 곡으로 연 뒤 다시 저장해 주세요." });
  }
  if (![8, 12, 16, 20, 24, 28, 32].includes(draft.songLength) || draft.measures.length !== draft.songLength || draft.lyrics.length !== draft.songLength) {
    issues.push({ target: "settings", message: "선택한 노래 길이와 실제 마디 수가 맞지 않아요." });
  }
  if (![[2, 4], [3, 4], [4, 4], [6, 8]].some(([beats, unit]) =>
    draft.meter.beats === beats && draft.meter.beatUnit === unit)) {
    issues.push({ target: "settings", message: "저장할 수 없는 박자표예요. 박자를 다시 골라 주세요." });
  }
  if (!isValidInstrumentId(draft.instrumentId) ||
    (draft.accompanimentStyleId !== undefined && !ACCOMPANIMENT_STYLES.some((style) => style.id === draft.accompanimentStyleId)) ||
    (draft.accompanimentInstrumentIds !== undefined && (draft.accompanimentInstrumentIds.length > MAX_SAVED_ACCOMPANIMENT_INSTRUMENTS ||
      new Set(draft.accompanimentInstrumentIds).size !== draft.accompanimentInstrumentIds.length ||
      !draft.accompanimentInstrumentIds.every(isValidInstrumentId))) ||
    (draft.bpm !== undefined && (!Number.isInteger(draft.bpm) || draft.bpm < 40 || draft.bpm > 220))) {
    issues.push({ target: "settings", message: "악기나 빠르기 설정에 저장할 수 없는 값이 있어요." });
  }
  draft.measures.forEach((measure, measureIndex) => {
    if (measure.notes && measure.notes.length > 32) {
      issues.push({ target: "measure", measureIndex, message: `${measureIndex + 1}마디에는 음표를 32개까지만 저장할 수 있어요.` });
    }
    const noteProblem = measure.notes?.map((note) => noteIssue(note, measureIndex)).find(Boolean);
    if (noteProblem) issues.push(noteProblem);
    if ((measure.effects?.length ?? 0) > 16) {
      issues.push({ target: "measure", measureIndex, message: `${measureIndex + 1}마디에는 효과음을 16개까지만 저장할 수 있어요.` });
    }
    const effectProblem = measure.effects?.map((effect) => effectIssue(effect, measureIndex)).find(Boolean);
    if (effectProblem) issues.push(effectProblem);
  });
  if (!isSavedDraft(draft) && issues.length === 0) {
    issues.push({ target: "settings", message: "악보 내부 정보가 올바르지 않아요. 설정과 각 마디를 다시 확인해 주세요." });
  }
  return issues;
}

export function cloudSaveIssue(error: unknown): SaveIssue {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code).replace(/^firestore\//, "") : "";
  if (["unavailable", "deadline-exceeded", "network-request-failed"].includes(code) ||
    (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { target: "cloud", message: "인터넷 연결이 끊겼거나 너무 느려요. 연결을 확인한 뒤 다시 저장해 주세요." };
  }
  if (["unauthenticated", "user-token-expired"].includes(code)) {
    return { target: "cloud", message: "로그인 시간이 끝났어요. 다시 로그인한 뒤 저장해 주세요." };
  }
  if (code === "permission-denied") {
    return { target: "cloud", message: "현재 계정에는 이 악보를 저장할 권한이 없어요. 로그인 계정을 확인해 주세요." };
  }
  if (["resource-exhausted", "quota-exceeded"].includes(code)) {
    return { target: "cloud", message: "클라우드 저장 공간의 사용 한도에 도달했어요. 관리자에게 알려 주세요." };
  }
  if (["invalid-argument", "failed-precondition"].includes(code)) {
    return { target: "settings", message: "악보 데이터 중 클라우드가 받을 수 없는 부분이 있어요." };
  }
  return { target: "cloud", message: "클라우드가 저장 완료를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
}
