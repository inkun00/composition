import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp
} from "firebase/firestore";
import { firestore } from "./client";
import { isSavedDraft, type SavedDraft } from "../music/draft";

export type CloudScore = Readonly<{
  id: string;
  title: string;
  creator: string;
  songLength: 8 | 12 | 16;
  updatedAt: number;
  draft: SavedDraft;
}>;

function requireFirestore() {
  if (!firestore) throw new Error("firebase-not-configured");
  return firestore;
}

function cleanDraft(draft: SavedDraft): SavedDraft {
  return JSON.parse(JSON.stringify(draft)) as SavedDraft;
}

export async function listCloudScores(uid: string): Promise<CloudScore[]> {
  const db = requireFirestore();
  const result = await getDocs(query(
    collection(db, "users", uid, "scores"),
    orderBy("updatedAt", "desc"),
    limit(100)
  ));
  return result.docs.flatMap((snapshot) => {
    const data = snapshot.data();
    if (!isSavedDraft(data.draft)) return [];
    const timestamp = data.updatedAt as Timestamp | undefined;
    return [{
      id: snapshot.id,
      title: typeof data.title === "string" ? data.title : data.draft.title,
      creator: typeof data.creator === "string" ? data.creator : data.draft.creator,
      songLength: data.draft.songLength,
      updatedAt: timestamp?.toMillis?.() ?? data.draft.updatedAt,
      draft: data.draft
    }];
  });
}

export async function saveCloudScore(uid: string, draft: SavedDraft, scoreId?: string): Promise<string> {
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
    updatedAt: serverTimestamp(),
    ...(scoreId ? {} : { createdAt: serverTimestamp() }),
    draft: savedDraft
  }, { merge: true });
  return scoreRef.id;
}

export async function deleteCloudScore(uid: string, scoreId: string): Promise<void> {
  await deleteDoc(doc(requireFirestore(), "users", uid, "scores", scoreId));
}
