import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { draftFingerprint, isSavedDraft, type SavedDraft } from "../music/draft";
import { cloudSaveIssue } from "../music/draftValidation";
import type { CloudScore, CloudScoreListItem } from "../firebase/scores";
import type { CloudListStatus } from "./useCloudScoreList";

type Options = Readonly<{
  draft: SavedDraft;
  fingerprint?: string;
  uid: string | null;
  enabled: boolean;
  scores: readonly CloudScoreListItem[];
  listStatus: CloudListStatus;
  onSaved: (score: CloudScore, fingerprint: string, projectId: string, uid: string) => void;
}>;

/** Stable document IDs and one writer keep rapid edits and reconnect retries in order. */
export function useCloudProjectAutosave(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const running = useRef<Promise<CloudScore | null> | null>(null);
  const mounted = useRef(true);
  const confirmed = useRef(new Map<string, Readonly<{ fingerprint: string; score: CloudScore }>>());
  const copyTargets = useRef(new Map<string, string>());
  const paused = useRef<string | null>(null);
  const pendingTimer = useRef<number | null>(null);
  const fingerprints = useRef(new WeakMap<SavedDraft, string>());
  const fingerprintOf = useCallback((draft: SavedDraft) => {
    let fingerprint = fingerprints.current.get(draft);
    if (fingerprint === undefined) {
      fingerprint = draftFingerprint(draft);
      fingerprints.current.set(draft, fingerprint);
    }
    return fingerprint;
  }, []);
  const fingerprint = useMemo(() => {
    if (options.fingerprint !== undefined) fingerprints.current.set(options.draft, options.fingerprint);
    return options.enabled && options.uid ? fingerprintOf(options.draft) : "";
  }, [options.enabled, options.uid, options.draft, options.fingerprint, fingerprintOf]);

  const writeProject = useCallback(async (asCopy: boolean, manual: boolean): Promise<CloudScore | null> => {
    if (!mounted.current) return null;
    const requestedUid = latest.current.uid;
    const requestedProjectId = latest.current.draft.projectId;
    while (running.current) {
      await running.current.catch(() => undefined);
      if (!mounted.current) return null;
    }
    const context = latest.current;
    const { uid, draft } = context;
    const projectId = draft.projectId;
    if (!uid || !context.enabled || !projectId || uid !== requestedUid || projectId !== requestedProjectId) return null;
    if (!manual && (context.listStatus !== "ready" || draft.cloudOwnerId && draft.cloudOwnerId !== uid ||
      !draft.cloudScoreId && !draft.musicVideoScenes?.some((scene) => scene.elements.length > 0) ||
      paused.current === `${projectId}:${fingerprintOf(draft)}`)) return null;
    if (!isSavedDraft(draft)) throw new Error("그림을 보존하고 있어요. 저장할 수 없는 악보 설정을 확인해 주세요.");
    if (!navigator.onLine) {
      setStatus("브라우저에 보관 중 · 연결되면 프로젝트에 자동 저장해요");
      return null;
    }
    const snapshotFingerprint = fingerprintOf(draft);
    paused.current = null;
    const bindingMatches = draft.cloudOwnerId === uid && Boolean(draft.cloudScoreId);
    let targetId = asCopy ? crypto.randomUUID() : bindingMatches ? draft.cloudScoreId! : projectId;
    const targetKey = `${uid}:${targetId}`;
    const remote = context.scores.find((score) => score.id === targetId);
    const remoteFingerprint = remote?.draft ? fingerprintOf(remote.draft) : null;
    // An older browser copy must never erase a newer revision from another device.
    // Preserve both revisions by giving the local work a stable recovery-copy target.
    const conflict = !asCopy && remote?.draft && remote.updatedAt > draft.updatedAt &&
      remoteFingerprint !== snapshotFingerprint && confirmed.current.get(targetKey)?.fingerprint !== remoteFingerprint;
    if (conflict) {
      targetId = copyTargets.current.get(targetKey) ?? crypto.randomUUID();
      copyTargets.current.set(targetKey, targetId);
    }
    const key = `${uid}:${targetId}`;
    const isCurrent = () => mounted.current && latest.current.uid === uid &&
      latest.current.draft.projectId === projectId &&
      paused.current !== `${projectId}:${fingerprintOf(latest.current.draft)}`;
    const savedDraft: SavedDraft = { ...draft, projectId: asCopy || conflict ? targetId : projectId,
      cloudOwnerId: uid, cloudScoreId: targetId };
    const acknowledged = confirmed.current.get(key);
    const currentScore = acknowledged?.fingerprint === snapshotFingerprint ? acknowledged.score :
      remote?.id === targetId && remote.draft && remoteFingerprint === snapshotFingerprint ? remote as CloudScore : null;
    if (!asCopy && currentScore) {
      // A matching server snapshot is also an acknowledgement. Remember it
      // before callbacks refresh the binding/list and schedule another effect.
      confirmed.current.set(key, { fingerprint: snapshotFingerprint, score: currentScore });
      if (isCurrent()) context.onSaved(currentScore, snapshotFingerprint, projectId, uid);
      if (isCurrent()) { setStatus("프로젝트에 자동 저장됨 ✓"); setError(""); }
      return currentScore;
    }
    setBusy(true);
    setError("");
    setStatus("프로젝트에 저장 중...");
    const job = (async () => {
      const { saveCloudScore } = await import("../firebase/scores");
      const score = await saveCloudScore(uid, savedDraft, targetId);
      confirmed.current.set(key, { fingerprint: snapshotFingerprint, score });
      if (isCurrent()) {
        latest.current.onSaved(score, snapshotFingerprint, projectId, uid);
        setStatus(conflict ? "최신 그림을 프로젝트 복구 사본에 저장했어요 ✓" : "프로젝트에 자동 저장됨 ✓");
      }
      return score;
    })();
    running.current = job;
    try {
      return await job;
    } catch (failure) {
      if (isCurrent()) {
        setError(cloudSaveIssue(failure).message);
        setStatus("프로젝트 저장 대기 · 브라우저 복구본을 유지해요");
      }
      throw failure;
    } finally {
      if (running.current === job) running.current = null;
      if (mounted.current) { setBusy(false); setRetry((value) => value + 1); }
    }
  }, [fingerprintOf]);
  const save = useCallback((asCopy = false) => writeProject(asCopy, true), [writeProject]);

  useEffect(() => {
    setError("");
    setStatus("");
  }, [options.uid, options.draft.projectId]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const { uid, draft, enabled, listStatus } = options;
    if (!enabled || !uid || !draft.projectId) return;
    if (paused.current === `${draft.projectId}:${fingerprint}`) return;
    // Never transfer another account's local work automatically after signing in.
    if (draft.cloudOwnerId && draft.cloudOwnerId !== uid) {
      setStatus("브라우저에 보관 중 · 이 프로젝트를 저장한 계정으로 로그인해 주세요");
      return;
    }
    if (!draft.cloudScoreId && !draft.musicVideoScenes?.some((scene) => scene.elements.length > 0)) return;
    if (!navigator.onLine || listStatus !== "ready") {
      setStatus("브라우저에 보관 중 · 연결되면 프로젝트에 자동 저장해요");
      return;
    }
    const key = `${uid}:${draft.cloudScoreId ?? draft.projectId}`;
    if (confirmed.current.get(key)?.fingerprint === fingerprint) return;
    // Failed writes back off, and online/visibility events retry immediately.
    const timer = window.setTimeout(() => {
      if (pendingTimer.current === timer) pendingTimer.current = null;
      if (latest.current.uid !== uid || latest.current.draft.projectId !== draft.projectId) return;
      void writeProject(false, false).catch(() => undefined);
    }, error ? 15_000 : 700);
    pendingTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (pendingTimer.current === timer) pendingTimer.current = null;
    };
  }, [options.enabled, options.uid, options.draft.projectId, options.draft.cloudScoreId,
    options.draft.cloudOwnerId, fingerprint, options.listStatus, options.scores, writeProject, retry, error]);

  useEffect(() => {
    const flush = () => {
      const context = latest.current;
      if (!context.enabled || !context.uid || context.listStatus !== "ready" ||
        context.draft.cloudOwnerId && context.draft.cloudOwnerId !== context.uid ||
        !context.draft.cloudScoreId && !context.draft.musicVideoScenes?.some((scene) => scene.elements.length > 0)) return;
      if (paused.current === `${context.draft.projectId}:${fingerprintOf(context.draft)}`) return;
      void writeProject(false, false).catch(() => undefined);
    };
    const visible = () => {
      if (document.visibilityState === "hidden") flush();
      else setRetry((value) => value + 1);
    };
    const online = () => { setRetry((value) => value + 1); flush(); };
    window.addEventListener("online", online);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [writeProject, fingerprintOf]);

  const pause = useCallback(() => {
    paused.current = `${latest.current.draft.projectId}:${fingerprintOf(latest.current.draft)}`;
    if (pendingTimer.current !== null) {
      window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  }, [fingerprintOf]);
  return { busy, status, error, save, pause };
}
