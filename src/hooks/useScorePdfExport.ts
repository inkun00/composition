import { useEffect, useRef, useState } from "react";
import { buildEmbeddedQrPlaybackUrl, buildQrPlaybackUrl, type SharedComposition } from "../music/share";
import { loadScorePdfLibraries, saveScorePdf, waitForScorePdfPages } from "../music/scorePdf";
import { loadVexFlow } from "../music/vexflow";
import { isModuleLoadError } from "../utils/moduleLoadError";

type Options = Readonly<{
  title: string;
  creator: string;
  ready: boolean;
  composition: () => SharedComposition | null;
  onStatus: (message: string) => void;
}>;

const REFRESH_MESSAGE = "악보 만들기 파일을 불러오지 못했어요. 작업을 저장하고 최신 화면을 열어 주세요.";

export function useScorePdfExport({ title, creator, ready, composition, onStatus }: Options) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfIncludeAccompaniment, setPdfIncludeAccompaniment] = useState(false);
  const [pdfPlaybackUrl, setPdfPlaybackUrl] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  const preloadFailed = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const onPreloadError = () => {
      // Keep Vite's original rejection; preventing it returns undefined to import callers.
      if (running.current) preloadFailed.current = true;
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => { mounted.current = false; window.removeEventListener("vite:preloadError", onPreloadError); };
  }, []);

  useEffect(() => {
    if (ready) void loadScorePdfLibraries().catch(() => undefined);
  }, [ready]);

  async function exportPdf(includeAccompaniment = false) {
    if (running.current) return;
    if (!title.trim() || !creator.trim()) {
      onStatus("PDF에 넣을 곡 제목과 작곡가 이름을 먼저 적어 주세요.");
      return;
    }
    const song = composition();
    if (!song) {
      onStatus("QR 재생 링크를 만들려면 모든 마디를 먼저 완성해 주세요.");
      return;
    }
    running.current = true;
    preloadFailed.current = false;
    setRecoveryOpen(false);
    setExportingPdf(true);
    setPdfIncludeAccompaniment(includeAccompaniment);
    setPdfPlaybackUrl("");
    onStatus("악보 만들기 기능을 준비하고 있어요...");
    try {
      const modules = await loadScorePdfLibraries();
      const location = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
        ? { origin: "https://maeum-melody.vercel.app", pathname: "/" } : window.location;
      let playbackUrl = buildEmbeddedQrPlaybackUrl(song, location);
      try {
        const { saveQrSong } = await import("../firebase/qrSongs");
        playbackUrl = buildQrPlaybackUrl(await saveQrSong(song), location);
      } catch (error) {
        if (isModuleLoadError(error) || preloadFailed.current) throw error;
        console.warn("짧은 QR 링크를 만들지 못해 악보 데이터가 포함된 링크를 사용합니다.", error);
      }
      if (playbackUrl.length > 2400) throw new Error("qr-link-too-long");
      if (!mounted.current) return;
      setPdfPlaybackUrl(playbackUrl);
      onStatus(includeAccompaniment ? "반주가 포함된 A4 악보를 만들고 있어요..." : "A4 악보를 만들고 있어요...");
      await loadVexFlow();
      const pages = await waitForScorePdfPages();
      if (!mounted.current) return;
      await saveScorePdf(modules, pages, title, includeAccompaniment);
      onStatus(includeAccompaniment ? "반주 포함 A4 PDF 악보를 저장했어요!" : "A4 PDF 악보를 저장했어요!");
    } catch (error) {
      if (!mounted.current) return;
      console.error(error);
      if (isModuleLoadError(error) || preloadFailed.current) {
        setRecoveryOpen(true);
        onStatus(REFRESH_MESSAGE);
      } else if (error instanceof Error && error.message === "qr-link-too-long") {
        onStatus("노래 정보를 QR에 담기에는 너무 길어요. 인터넷 연결을 확인하고 PDF를 다시 만들어 주세요.");
      } else if (error instanceof Error && ["pdf-pages-missing", "pdf-score-not-ready"].includes(error.message)) {
        onStatus("악보 화면을 준비하지 못했어요. 모든 마디가 완성되었는지 확인하고 다시 만들어 주세요.");
      } else {
        onStatus("PDF를 만드는 중 문제가 생겼어요. 다시 시도해 주세요.");
      }
    } finally {
      running.current = false;
      if (mounted.current) setExportingPdf(false);
    }
  }

  return { exportingPdf, pdfIncludeAccompaniment, pdfPlaybackUrl, exportPdf, recoveryOpen,
    closeRecovery: () => setRecoveryOpen(false) };
}
