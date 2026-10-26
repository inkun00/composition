import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SavedDraft } from "../music/draft";
import type { CloudScoreListItem } from "../firebase/scores";
import { addLostDrawingRecoveryCandidates, extractLostDrawingCandidates, listLostDrawingRecovery,
  resolveLostDrawingRecovery, scanLostDrawingRecoveryRecords } from "../music/lostDrawingRecovery";
import type { LostDrawingRecoveryCandidate } from "../music/lostDrawingRecoveryModel";
import { hasMissingRecoveredDrawing, shouldOfferLostDrawingAutomatically } from "../music/lostDrawingRecoveryChoice";
import { rememberLostDrawingPromptShown, wasLostDrawingPromptShown } from "../music/lostDrawingRecoveryPrompt";

type Options = Readonly<{
  current: SavedDraft;
  initialCandidates: readonly LostDrawingRecoveryCandidate[];
  allowAutomatic: boolean;
  enabled: boolean;
  uid: string | null;
  scores: readonly CloudScoreListItem[];
  scoresUid?: string | null;
  onRestore: (candidate: LostDrawingRecoveryCandidate) => Promise<void>;
  onPreserved?: () => void;
}>;

export function useLostDrawingRecovery(options: Options) {
  const [records, setRecords] = useState<readonly LostDrawingRecoveryCandidate[]>(options.initialCandidates);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [working, setWorking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const promptShown = useRef(false);
  const represented = useRef(new Set<string>());
  const restored = useRef(new Set<string>());
  const operation = useRef(false);
  const scanningNow = useRef(false);
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(true);
  const scanGeneration = useRef(0);
  const visible = useMemo(() => records.filter((candidate) =>
    (candidate.sourceKind !== "cloud" || Boolean(options.uid) && candidate.source.startsWith(`cloud:${options.uid}:`)) &&
    hasMissingRecoveredDrawing(candidate, options.current.musicVideoScenes ?? [])),
  [records, options.current, options.uid]);
  const candidates = manual ? visible : visible.filter((candidate) => shouldOfferLostDrawingAutomatically(candidate, options.current));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; scanGeneration.current += 1; };
  }, []);

  useEffect(() => {
    if (!options.enabled || !options.allowAutomatic || open || manual || promptShown.current) return;
    if (wasLostDrawingPromptShown()) { promptShown.current = true; return; }
    if (!visible.some((candidate) => shouldOfferLostDrawingAutomatically(candidate, options.current))) return;
    promptShown.current = true;
    rememberLostDrawingPromptShown();
    setManual(false);
    setOpen(true);
  }, [visible, options.current, options.enabled, options.allowAutomatic, open, manual]);

  useEffect(() => {
    if (!open || !options.enabled || promptShown.current) return;
    promptShown.current = true;
    rememberLostDrawingPromptShown();
  }, [open, options.enabled]);

  useEffect(() => {
    if (!options.enabled || working) return;
    const present = records.filter((candidate) => !represented.current.has(candidate.id) &&
      (candidate.sourceKind !== "cloud" || options.uid && candidate.source.startsWith(`cloud:${options.uid}:`)) &&
      !hasMissingRecoveredDrawing(candidate, options.current.musicVideoScenes ?? []));
    if (!present.length) return;
    present.forEach((candidate) => represented.current.add(candidate.id));
    void Promise.all(present.map(async (candidate) => {
      const saved = await resolveLostDrawingRecovery(candidate.id, "represented");
      if (!saved) represented.current.delete(candidate.id);
      return saved ? candidate.id : null;
    })).then((ids) => {
      if (mounted.current && !manual) setRecords((items) => items.filter((item) => !ids.includes(item.id)));
    }).catch(() => present.forEach((candidate) => represented.current.delete(candidate.id)));
  }, [records, options.current, options.enabled, options.uid, manual, working]);

  useEffect(() => {
    if (!options.enabled || !options.uid || !options.scores.length ||
      options.scoresUid !== undefined && options.scoresUid !== options.uid) return;
    const uid = options.uid;
    let active = true;
    const found = options.scores.flatMap((score) => {
      if (score.draft?.cloudOwnerId && score.draft.cloudOwnerId !== uid) return [];
      const value = score.draft ?? (score.recoveryScenes ? { title: score.title, updatedAt: score.updatedAt,
        projectId: score.recoveryProjectId, musicVideoScenes: score.recoveryScenes } : null);
      return value ? extractLostDrawingCandidates(value, `cloud:${uid}:${score.id}`, "cloud") : [];
    });
    if (!found.length) return;
    void addLostDrawingRecoveryCandidates(found).then((items) => {
      if (active && mounted.current && latest.current.uid === uid) setRecords(items);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [options.enabled, options.uid, options.scores, options.scoresUid]);

  const close = useCallback(() => {
    setOpen(false);
    setError("");
  }, []);

  const scan = useCallback(async () => {
    if (operation.current) return;
    const generation = ++scanGeneration.current;
    scanningNow.current = true;
    setScanning(true);
    setManual(true);
    setOpen(true);
    setError("");
    try {
      const result = await scanLostDrawingRecoveryRecords();
      if (result.preserved && mounted.current) latest.current.onPreserved?.();
      const items = await listLostDrawingRecovery(true);
      if (mounted.current && generation === scanGeneration.current) setRecords(items);
    } catch {
      if (mounted.current) setError("기록을 읽지 못했어요. 저장 공간을 확인한 뒤 다시 찾아 주세요.");
    } finally {
      if (mounted.current && generation === scanGeneration.current) {
        scanningNow.current = false;
        setScanning(false);
      }
    }
  }, []);

  async function restore(candidate: LostDrawingRecoveryCandidate) {
    if (operation.current || scanningNow.current) return;
    if (candidate.sourceKind === "cloud" && (!latest.current.uid || !candidate.source.startsWith(`cloud:${latest.current.uid}:`))) {
      setError("이 그림을 보관한 계정으로 다시 로그인해 주세요.");
      return;
    }
    operation.current = true;
    setWorking(true);
    setError("");
    try {
      if (!restored.current.has(candidate.id)) {
        await latest.current.onRestore(candidate);
        restored.current.add(candidate.id);
      }
      if (!await resolveLostDrawingRecovery(candidate.id, "restored")) {
        setError("그림은 사본으로 복구했지만 확인 기록을 저장하지 못했어요. 다시 누르면 확인 기록만 저장합니다.");
        return;
      }
      setRecords((items) => items.filter((item) => item.id !== candidate.id));
      setOpen(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "그림을 복구하지 못했어요. 원본 기록은 보관하고 있어요.");
    } finally { operation.current = false; if (mounted.current) setWorking(false); }
  }

  async function dismiss() {
    if (operation.current || scanningNow.current) return;
    operation.current = true;
    setWorking(true);
    try {
      const saved = await Promise.all(candidates.map((candidate) => resolveLostDrawingRecovery(candidate.id, "dismissed")));
      if (saved.some((value) => !value)) throw new Error("recovery-choice-not-saved");
      const dismissed = new Set(candidates.map((candidate) => candidate.id));
      setRecords((items) => items.filter((item) => !dismissed.has(item.id)));
      close();
    } catch { setError("선택을 저장하지 못했어요. 원본 그림 기록은 그대로 남아 있어요."); }
    finally { operation.current = false; if (mounted.current) setWorking(false); }
  }

  return { open: open && options.enabled, candidates, working, scanning, error, close, scan, restore, dismiss };
}
