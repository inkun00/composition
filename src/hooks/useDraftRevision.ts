import { useMemo, useRef } from "react";
import { draftFingerprint, type SavedDraft } from "../music/draft";

/** Binding a cloud ID is not an edit; reopening a project retains its revision time. */
export function useDraftRevision(draft: SavedDraft, initialUpdatedAt?: number) {
  const revision = useRef({ fingerprint: "", updatedAt: initialUpdatedAt ?? Date.now() });
  const fingerprint = useMemo(() => draftFingerprint(draft), [draft]);
  if (revision.current.fingerprint && revision.current.fingerprint !== fingerprint) {
    revision.current.updatedAt = Math.max(Date.now(), revision.current.updatedAt + 1);
  }
  revision.current.fingerprint = fingerprint;
  const updatedAt = revision.current.updatedAt;
  const currentDraft = useMemo(() => ({ ...draft, updatedAt }), [draft, updatedAt]);
  function adopt(updated: SavedDraft) {
    revision.current = { fingerprint: "", updatedAt: updated.updatedAt };
  }
  return { currentDraft, fingerprint, adopt };
}
