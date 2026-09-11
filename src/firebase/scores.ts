import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  Timestamp
} from "firebase/firestore";
import { firestore } from "./client";
import { isSavedDraft, type SavedDraft } from "../music/draft";

export type CloudScore = Readonly<{
  id: string;
  title: string;
  creator: string;
  songLength: SavedDraft["songLength"];
  updatedAt: number;
  draft: SavedDraft;
  unavailableReason?: undefined;
}>;

export type UnavailableCloudScore = Readonly<{
  id: string;
  title: string;
  creator: string;
  songLength: number | null;
  updatedAt: number;
  draft: null;
  unavailableReason: string;
}>;

export type CloudScoreListItem = CloudScore | UnavailableCloudScore;

function requireFirestore() {
  if (!firestore) throw new Error("firebase-not-configured");
  return firestore;
}

function cleanDraft(draft: SavedDraft): SavedDraft {
  return JSON.parse(JSON.stringify(draft)) as SavedDraft;
}

function timestampMillis(value: unknown): number {
  const timestamp = value as Timestamp | undefined;
  return timestamp?.toMillis?.() ?? 0;
}

export function cloudScoreListItem(id: string, data: Record<string, unknown>): CloudScoreListItem {
  const rawDraft = data.draft && typeof data.draft === "object" ? data.draft as Record<string, unknown> : null;
  const updatedAt = timestampMillis(data.updatedAt) || timestampMillis(data.createdAt) ||
    (typeof rawDraft?.updatedAt === "number" ? rawDraft.updatedAt : 0);
  const title = typeof data.title === "string" ? data.title :
    typeof rawDraft?.title === "string" ? rawDraft.title : "이름 없는 저장 자료";
  const creator = typeof data.creator === "string" ? data.creator :
    typeof rawDraft?.creator === "string" ? rawDraft.creator : "";
  if (!isSavedDraft(data.draft)) return {
    id, title, creator,
    songLength: typeof data.songLength === "number" ? data.songLength :
      typeof rawDraft?.songLength === "number" ? rawDraft.songLength : null,
    updatedAt,
    draft: null,
    unavailableReason: "이전 버전에서 저장된 악보예요. 목록에는 보관되지만 지금은 열 수 없어요."
  };
  return { id, title, creator, songLength: data.draft.songLength, updatedAt, draft: data.draft };
}

export async function listCloudScores(uid: string): Promise<CloudScoreListItem[]> {
  const db = requireFirestore();
  const result = await getDocs(collection(db, "users", uid, "scores"));
  return result.docs.map((snapshot) => cloudScoreListItem(snapshot.id, snapshot.data()))
    .sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title, "ko"));
}

export async function saveCloudScore(uid: string, draft: SavedDraft, scoreId?: string): Promise<CloudScore> {
  const db = requireFirestore();
  const scoreRef = scoreId
    ? doc(db, "users", uid, "scores", scoreId)
    : doc(collection(db, "users", uid, "scores"));
  const savedDraft = cleanDraft({ ...draft, updatedAt: Date.now() });
  await setDoc(scoreRef, {
    ownerId: uid,
    title: savedDraft.title || "제목 없는 악보",
    creator: savedDraft.creator,
    songLength: savedDraft.songLength,
    updatedAt: Timestamp.fromMillis(savedDraft.updatedAt),
    ...(scoreId ? {} : { createdAt: Timestamp.fromMillis(savedDraft.updatedAt) }),
    draft: savedDraft
  }, { merge: true });
  return {
    id: scoreRef.id,
    title: savedDraft.title || "제목 없는 악보",
    creator: savedDraft.creator,
    songLength: savedDraft.songLength,
    updatedAt: savedDraft.updatedAt,
    draft: savedDraft
  };
}

export async function deleteCloudScore(uid: string, scoreId: string): Promise<void> {
  await deleteDoc(doc(requireFirestore(), "users", uid, "scores", scoreId));
}
