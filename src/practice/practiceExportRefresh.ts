import { writePracticeDraft, type PracticeDraft } from "./practiceStorage";
import { isModuleLoadError } from "../utils/moduleLoadError";

export const PRACTICE_EXPORT_REFRESH_MESSAGE =
  "영상 만들기 기능을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 작업을 저장하고 최신 화면을 열어 MP4를 다시 만들어 주세요.";

export function isPracticeExportModuleLoadError(error: unknown): boolean {
  return isModuleLoadError(error);
}

export function savePracticeAndRefresh(
  draft: PracticeDraft,
  onBeforeRefresh?: () => void,
  reload = () => window.location.reload()
): boolean {
  if (!writePracticeDraft(draft)) return false;
  onBeforeRefresh?.();
  reload();
  return true;
}
