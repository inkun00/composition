import { useState } from "react";
import type { LyricVideoPlan } from "../video/lyricVideoPlan";
import { exportLyricMp4 } from "../video/exportLyricMp4";

export function useLyricVideoExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  function reset() {
    setProgress(0);
    setStatus("");
  }

  async function save(audioUrl: string, plan: LyricVideoPlan | null, fileName: string) {
    if (!audioUrl || !plan || exporting) return;
    setExporting(true);
    setProgress(0);
    setStatus("가사 영상을 만들고 있어요.");
    try {
      const blob = await exportLyricMp4(audioUrl, plan, setProgress);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus("가사 영상 MP4를 저장했어요.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "가사 영상을 만들지 못했어요.");
    } finally {
      setExporting(false);
    }
  }

  return { exporting, progress, status, reset, save };
}
