import { FileDown, FileMusic, FileVideo, Music2 } from "lucide-react";
import type { CompositionMediaExportController } from "../hooks/useCompositionMediaExport";
import "./CompositionFileExports.css";

type Props = Readonly<{
  media: CompositionMediaExportController;
  complete: boolean;
  busy: boolean;
  exportingPdf: boolean;
  onPdf: (includeAccompaniment: boolean) => void;
}>;

export default function CompositionFileExports({ media, complete, busy, exportingPdf, onPdf }: Props) {
  const locked = busy || media.exporting || exportingPdf;
  return <>
    <div className="publish-action-group-buttons composition-file-export-buttons">
      <button type="button" className="pdf-button action-button" data-testid="export-pdf"
        disabled={locked} onClick={() => onPdf(false)}>
        <FileDown size={18} /> {exportingPdf ? "악보 만드는 중..." : "악보 PDF"}
      </button>
      <button type="button" className="pdf-button action-button" data-testid="export-pdf-with-accompaniment"
        disabled={locked} onClick={() => onPdf(true)}>
        <FileMusic size={18} /> {exportingPdf ? "악보 만드는 중..." : "반주 포함 악보 PDF"}
      </button>
      <button type="button" className="backing-mp3-button action-button" data-testid="export-backing-mp3"
        disabled={locked || !complete} onClick={() => void media.saveMp3()}>
        <Music2 size={18} /> {media.exporting && media.format === "mp3" ? "반주 만드는 중..." : "반주 음악 MP3"}
      </button>
      <button type="button" className="lyrics-mp4-button action-button" data-testid="export-lyrics-mp4"
        disabled={locked || !complete || !media.hasLyrics} aria-describedby="composition-lyrics-video-help"
        onClick={() => void media.saveMp4()}>
        <FileVideo size={18} /> {media.exporting && media.format === "mp4" ? `가사 영상 만드는 중... ${media.progress}%` : "가사 포함 MP4"}
      </button>
    </div>
    <p id="composition-lyrics-video-help" className="composition-lyrics-video-help">
      {media.hasLyrics ? "검은 배경에 가사가 나오고 반주에 맞춰 현재 가사가 강조돼요."
        : "가사를 한 글자 이상 입력하면 가사 포함 MP4를 저장할 수 있어요."}
    </p>
  </>;
}
