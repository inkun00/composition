import { useEffect, useRef, useState } from "react";
import type { PlaybackMeasure } from "../audio/accompanimentScore";

type Format = "png" | "mp4";

export function useTextbookExport() {
  const request = useRef<AbortController | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => () => request.current?.abort(), []);

  async function save(next: Format, measures: readonly PlaybackMeasure[], creator: string, bpm: number) {
    if (request.current || !creator.trim()) return;
    const current = new AbortController();
    request.current = current;
    setFormat(next);
    setProgress(0);
    setStatus("");
    setError("");
    try {
      const { downloadTextbookScore, createTextbookVideo, textbookFileName, downloadTextbookBlob } = await import("./textbookExport");
      if (current.signal.aborted) return;
      if (next === "png") {
        if (!sheet.current) throw Error("완성 악보를 준비하지 못했어요. 다시 저장해 주세요.");
        await downloadTextbookScore(sheet.current, creator, current.signal);
      } else {
        const blob = await createTextbookVideo(measures, creator, bpm, (value) => {
          if (!current.signal.aborted) setProgress(value);
        }, current.signal);
        if (current.signal.aborted) return;
        downloadTextbookBlob(blob, textbookFileName(creator, "mp4"));
      }
      if (!current.signal.aborted) setStatus(next === "png" ? "악보 이미지를 저장했어요." : "연주 영상을 저장했어요.");
    } catch (failure) {
      if (!current.signal.aborted) setError(failure instanceof Error ? failure.message : "파일을 저장하지 못했어요.");
    } finally {
      if (request.current === current) {
        request.current = null;
        if (!current.signal.aborted) setFormat(null);
      }
    }
  }

  function cancel() {
    const current = request.current;
    request.current = null;
    current?.abort();
    setFormat(null);
    setStatus("파일 만들기를 취소했어요.");
  }

  return { sheet, format, progress, status, error, save, cancel };
}
