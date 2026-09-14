import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudScore, CloudScoreListItem } from "../firebase/scores";

export type CloudListStatus = "loading" | "ready" | "stale" | "error";

export function useCloudScoreList(uid: string | null) {
  const [scores, setScores] = useState<CloudScoreListItem[]>([]);
  const [status, setStatus] = useState<CloudListStatus>("loading");
  const [revision, setRevision] = useState(0);
  const previousUid = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      previousUid.current = null;
      setScores([]);
      setStatus("loading");
      return;
    }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    if (previousUid.current !== uid) setScores([]);
    previousUid.current = uid;
    setStatus("loading");
    void import("../firebase/scores").then(({ subscribeCloudScores }) => {
      if (!active) return;
      unsubscribe = subscribeCloudScores(uid, (items, fromCache) => {
        if (!active) return;
        setScores(items);
        setStatus(fromCache ? "stale" : "ready");
      }, (error) => {
        console.error(error);
        if (active) setStatus("error");
      });
    }).catch((error) => {
      console.error(error);
      if (active) setStatus("error");
    });
    return () => { active = false; unsubscribe?.(); };
  }, [uid, revision]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!uid) return;
    const retryOnReconnect = () => { if (status === "error" || status === "stale") retry(); };
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible" && (status === "error" || status === "stale")) retry();
    };
    window.addEventListener("online", retryOnReconnect);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retryOnReconnect);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [uid, status, retry]);
  const upsert = useCallback((score: CloudScore) => {
    setScores((items) => [score, ...items.filter((item) => item.id !== score.id)]);
  }, []);
  return { scores, status, retry, upsert };
}
