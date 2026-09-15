import { collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "./client";
import { isSharedComposition, type SharedComposition } from "../music/share";

function requireFirestore() {
  if (!firestore) throw new Error("firebase-not-configured");
  return firestore;
}

function cleanComposition(composition: SharedComposition): SharedComposition {
  return JSON.parse(JSON.stringify(composition)) as SharedComposition;
}

export async function saveQrSong(composition: SharedComposition): Promise<string> {
  const songRef = doc(collection(requireFirestore(), "qrSongs"));
  await setDoc(songRef, {
    createdAt: serverTimestamp(),
    composition: cleanComposition(composition)
  });
  return songRef.id;
}

export async function loadQrSong(songId: string): Promise<SharedComposition | null> {
  if (!/^[A-Za-z0-9]{20}$/.test(songId)) return null;
  const snapshot = await getDoc(doc(requireFirestore(), "qrSongs", songId));
  if (!snapshot.exists()) return null;
  const composition: unknown = snapshot.data().composition;
  return isSharedComposition(composition) ? composition : null;
}
