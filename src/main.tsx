import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { preloadVexFlow } from "./music/vexflow";
import { readBrowserProjectDraft } from "./music/projectStorage";
import { DRAFT_STORAGE_KEY, readDraft, type SavedDraft } from "./music/draft";
import { scanLostDrawingRecoveryRecords } from "./music/lostDrawingRecovery";
import type { LostDrawingRecoveryCandidate } from "./music/lostDrawingRecoveryModel";
import "./styles.css";
import "./styles/song-structure.css";
import "./styles/candidate-feeling-tabs.css";
import "./desktop-polish.css";
import "./mobile-polish.css";
import "./styles/composition-flow.css";
import "./styles/save-share-polish.css";
import "./styles/card-consistency.css";
import "./styles/semantic-colors.css";
import "./styles/music-lab-foundation.css";
import "./styles/music-lab-studio.css";
import "./styles/music-lab-rhythm.css";
import "./styles/music-lab-production.css";
import "./styles/music-lab-dialogs.css";
import "./styles/opening-screen.css";
import "./practice/PracticeMusicLab.css";
import "./practice/PracticeUsability.css";
import "./components/ComposerSideLayout.css";
import "./components/ComposerSettingsSideArtwork.css";
import "./components/ComposerSettingsLayout.css";
import "./styles/studio-refresh-foundation.css";
import "./styles/studio-refresh-opening.css";
import "./styles/studio-refresh-composer.css";
import "./styles/studio-refresh-workspaces.css";

preloadVexFlow();

// Finish recovery before App can auto-save an empty initial composition.
async function start() {
  let initialDraft: SavedDraft | null = null;
  let initialRecoveryCandidates: readonly LostDrawingRecoveryCandidate[] = [];
  let allowAutomaticRecovery = true;
  let preserved = true;
  try { allowAutomaticRecovery = window.localStorage.getItem(`${DRAFT_STORAGE_KEY}:cleared`) !== "1"; }
  catch { /* IndexedDB recovery remains available when localStorage is blocked. */ }
  try {
    // Capture historical backups before normal migration rotates the old backup key.
    const recovery = await scanLostDrawingRecoveryRecords();
    initialRecoveryCandidates = recovery.candidates;
    preserved = recovery.preserved;
  } catch { preserved = false; }
  try {
    initialDraft = preserved ? await readBrowserProjectDraft() : readDraft(window.localStorage);
  } catch { /* App also reads the synchronous checkpoint. */ }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App initialDraft={initialDraft} initialRecoveryCandidates={initialRecoveryCandidates}
        allowAutomaticRecovery={allowAutomaticRecovery} recoveryPreserved={preserved} />
    </StrictMode>
  );
}
void start();
