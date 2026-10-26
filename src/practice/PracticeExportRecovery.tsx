import { useState } from "react";
import { RefreshCw } from "../components/AppArtworkIcons";
import { savePracticeAndRefresh } from "./practiceExportRefresh";
import type { PracticeDraft } from "./practiceStorage";

type PracticeExportRecoveryProps = {
  draft: PracticeDraft;
  onBeforeRefresh?: () => void;
};

export default function PracticeExportRecovery({ draft, onBeforeRefresh }: PracticeExportRecoveryProps) {
  const [storageFailed, setStorageFailed] = useState(false);

  function refresh() {
    setStorageFailed(!savePracticeAndRefresh(draft, onBeforeRefresh));
  }

  return (
    <div className="practice-export-recovery">
      <button type="button" onClick={refresh}>
        <RefreshCw size={16} aria-hidden="true" /> 작업 저장하고 새로고침
      </button>
      {storageFailed && <p role="alert">
        작업을 저장하지 못해 새로고침하지 않았어요. 저장 공간을 확인하고 다시 시도해 주세요.
      </p>}
    </div>
  );
}
