import type { CompositionMediaExportController } from "../hooks/useCompositionMediaExport";
import CompositionFileExports from "./CompositionFileExports";

type Props = Readonly<{
  media: CompositionMediaExportController;
  complete: boolean;
  busy: boolean;
  exportingPdf: boolean;
  onPdf: (includeAccompaniment: boolean) => void;
}>;

export default function CompositionSaveFiles({ media, complete, busy: disabled, exportingPdf, onPdf }: Props) {
  const busy = disabled || media.exporting || exportingPdf;
  return <div className="publish-action-group publish-action-group-files">
    <h3>악보·음악 저장</h3>
    <CompositionFileExports media={media} complete={complete}
      busy={busy} exportingPdf={exportingPdf} onPdf={onPdf} />
  </div>;
}
