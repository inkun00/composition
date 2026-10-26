import { useEffect, useRef, useState } from "react";
import { exportMusicVideoMp4 } from "../video/exportMusicVideoMp4";

type ExportOptions = Parameters<typeof exportMusicVideoMp4>[0];

export function useMusicVideoExport(onBusyChange: (busy: boolean) => void) {
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<Readonly<{ url: string; name: string }> | null>(null);
  const job = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; job.current?.abort(); busyCallback.current(false); };
  }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  async function make(options: ExportOptions) {
    if (job.current) return;
    const abort = new AbortController();
    job.current = abort;
    setWorking(true);
    setProgress(0);
    setResult(null);
    setStatus("음악과 그림, 가사를 모아 뮤직비디오를 만들고 있어요.");
    busyCallback.current(true);
    try {
      const blob = await exportMusicVideoMp4(options, (value) => {
        if (mounted.current) setProgress(value);
      }, abort.signal);
      if (!mounted.current || abort.signal.aborted) return;
      if (!blob) throw new Error("다른 연주나 녹음이 끝난 뒤 다시 시도해 주세요.");
      const name = `${options.title.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "나의노래"}-뮤직비디오.mp4`;
      const url = URL.createObjectURL(blob);
      setResult({ url, name });
      setProgress(100);
      setStatus("뮤직비디오를 완성했어요. 재생해서 확인하거나 MP4로 저장하세요.");
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
    } catch (error) {
      if (!mounted.current) return;
      setStatus(abort.signal.aborted || error instanceof DOMException && error.name === "AbortError"
        ? "뮤직비디오 만들기를 취소했어요. 그림은 그대로 남아 있어요."
        : error instanceof Error ? error.message : "뮤직비디오를 만들지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (job.current === abort) job.current = null;
      if (mounted.current) { setWorking(false); busyCallback.current(false); }
    }
  }

  return { working, progress, status, result, make, cancel: () => job.current?.abort() };
}
