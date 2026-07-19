import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Timestamp
} from "firebase/firestore";
import { firestore } from "./client";
import { isSavedDraft, type SavedDraft } from "../music/draft";
import type { CloudScore } from "./scores";

export type PublicationAccess = "audio" | "score" | "project";

export type CommunityAlbum = Readonly<{
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  createdAt: number;
  updatedAt: number;
}>;

export type PublishedSong = Readonly<{
  id: string;
  albumId: string;
  ownerId: string;
  ownerName: string;
  sourceScoreId: string;
  title: string;
  creator: string;
  access: PublicationAccess;
  publishedAt: number;
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

function timestampMillis(value: unknown): number {
  const timestamp = value as Timestamp | undefined;
  return timestamp?.toMillis?.() ?? 0;
}

function isPublicationAccess(value: unknown): value is PublicationAccess {
  return value === "audio" || value === "score" || value === "project";
}

export function isPublishableScore(score: Pick<CloudScore, "draft">): boolean {
  return score.draft.measures.every((measure) => Array.isArray(measure.notes) && measure.notes.length > 0);
}

export async function listCommunityAlbums(): Promise<CommunityAlbum[]> {
  const result = await getDocs(collection(requireFirestore(), "communityAlbums"));
  return result.docs.flatMap((snapshot) => {
    const data = snapshot.data();
    if (typeof data.name !== "string" || typeof data.ownerId !== "string") return [];
    return [{
      id: snapshot.id,
      name: data.name,
      ownerId: data.ownerId,
      ownerName: typeof data.ownerName === "string" ? data.ownerName : "마음멜로디 사용자",
      createdAt: timestampMillis(data.createdAt),
      updatedAt: timestampMillis(data.updatedAt)
    }];
  }).sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, "ko"));
}

export async function createCommunityAlbum(ownerId: string, ownerName: string, name: string): Promise<CommunityAlbum> {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 40) throw new Error("invalid-album-name");
  const albumRef = doc(collection(requireFirestore(), "communityAlbums"));
  await setDoc(albumRef, {
    name: trimmedName,
    ownerId,
    ownerName: ownerName.trim().slice(0, 40) || "마음멜로디 사용자",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return {
    id: albumRef.id,
    name: trimmedName,
    ownerId,
    ownerName: ownerName.trim().slice(0, 40) || "마음멜로디 사용자",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export async function deleteCommunityAlbum(albumId: string): Promise<void> {
  const db = requireFirestore();
  const songSnapshots = await getDocs(collection(db, "communityAlbums", albumId, "songs"));
  const songRefs = songSnapshots.docs.map((snapshot) => snapshot.ref);
  for (let index = 0; index < songRefs.length; index += 450) {
    const batch = writeBatch(db);
    songRefs.slice(index, index + 450).forEach((songRef) => batch.delete(songRef));
    await batch.commit();
  }
  await deleteDoc(doc(db, "communityAlbums", albumId));
}

export async function listPublishedSongs(albumId: string): Promise<PublishedSong[]> {
  const result = await getDocs(collection(requireFirestore(), "communityAlbums", albumId, "songs"));
  return result.docs.flatMap((snapshot) => {
    const data = snapshot.data();
    if (!isSavedDraft(data.draft) || !isPublicationAccess(data.access) || typeof data.ownerId !== "string") return [];
    return [{
      id: snapshot.id,
      albumId,
      ownerId: data.ownerId,
      ownerName: typeof data.ownerName === "string" ? data.ownerName : "마음멜로디 사용자",
      sourceScoreId: typeof data.sourceScoreId === "string" ? data.sourceScoreId : "",
      title: typeof data.title === "string" ? data.title : data.draft.title,
      creator: typeof data.creator === "string" ? data.creator : data.draft.creator,
      access: data.access,
      publishedAt: timestampMillis(data.publishedAt),
      updatedAt: timestampMillis(data.updatedAt),
      draft: data.draft
    }];
  }).sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, "ko"));
}

export async function publishScoreToAlbum(
  ownerId: string,
  ownerName: string,
  albumId: string,
  score: CloudScore,
  access: PublicationAccess
): Promise<void> {
  if (!isPublishableScore(score)) throw new Error("incomplete-score");
  const songId = `${ownerId}_${score.id}`;
  const songRef = doc(requireFirestore(), "communityAlbums", albumId, "songs", songId);
  await setDoc(songRef, {
    ownerId,
    ownerName: ownerName.trim().slice(0, 40) || "마음멜로디 사용자",
    sourceScoreId: score.id,
    title: (score.title || "제목 없는 악보").slice(0, 60),
    creator: (score.creator || "어린이 작곡가").slice(0, 40),
    access,
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    draft: cleanDraft(score.draft)
  }, { merge: true });
}

export async function updatePublishedSongAccess(
  albumId: string,
  songId: string,
  access: PublicationAccess
): Promise<void> {
  await setDoc(doc(requireFirestore(), "communityAlbums", albumId, "songs", songId), {
    access,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function removePublishedSong(albumId: string, songId: string): Promise<void> {
  await deleteDoc(doc(requireFirestore(), "communityAlbums", albumId, "songs", songId));
}
