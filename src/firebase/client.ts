import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig, firebaseConfigured } from "./config";

const app = firebaseConfigured ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)) : null;

export const firebaseAuth = app ? getAuth(app) : null;
export const firestore = app ? getFirestore(app) : null;

export function observeAuth(listener: (user: User | null) => void): () => void {
  if (!firebaseAuth) {
    listener(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function signInWithGoogle(): Promise<void> {
  if (!firebaseAuth) throw new Error("firebase-not-configured");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(firebaseAuth, provider);
}

export async function signOutFirebase(): Promise<void> {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
}

export type { User };
