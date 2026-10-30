import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, FileDown, Headphones, Library, Menu, Mic2, Music2, Plus, QrCode, Redo2, Smartphone, Square, Trash2, Undo2, UserRound, Users, Volume2, VolumeX, WandSparkles, X } from "./components/AppArtworkIcons";
import { QRCodeSVG } from "qrcode.react";
import { pausePlayback, playComposition, playMeasure, practiceKaraokeComposition, recordKaraokeComposition, renderKaraokePreviewMix, renderProcessedKaraokeMp3, resumePlayback, stopPlayback,
  type AccompanimentOptions, type KaraokePostProcessPreset } from "./audio/player";
import { preloadInstrument } from "./audio/samplePlayer";
import { reviewRecordedPitch, type RecordingPitchReview } from "./audio/pitchReview";
import PlayIcon from "./components/PlayIcon";
import PdfScoreSheet from "./components/PdfScoreSheet";
import RecordingGuideDialog from "./components/RecordingGuideDialog";
import RecordingSaveDialog from "./components/RecordingSaveDialog";
import ScoreMeasure from "./components/ScoreMeasure";
import OpeningScreen from "./components/OpeningScreen";
import PracticeMode from "./practice/PracticeMode";
import type { KaraokeGuideMode } from "./audio/karaokeGuide";
import type { RecordingCaptureMode } from "./audio/vocalCapture";
import NoteLyrics from "./components/NoteLyrics";
import MeasureSoundEffectDialog from "./components/MeasureSoundEffectDialog";
import AccountLibrary from "./components/AccountLibrary";
import CommunityAlbum from "./components/CommunityAlbum";
import HarmonyPresetChooser from "./components/HarmonyPresetChooser";
import SongMoodSetup from "./components/SongMoodSetup";
import PublishScoreDialog from "./components/PublishScoreDialog";
import SaveFailureDialog from "./components/SaveFailureDialog";
import QrSongPlayback from "./components/QrSongPlayback";
import BeatInstrumentChooser from "./components/BeatInstrumentChooser";
import AccompanimentEditor from "./components/AccompanimentEditor";
import AccompanimentMixer from "./components/AccompanimentMixer";
import CompositionSaveFiles from "./components/CompositionSaveFiles";
import MusicVideoFeature from "./musicVideo/MusicVideoFeature";
import CompositionMediaExportDialog from "./components/CompositionMediaExportDialog";
import SongStoryMap from "./components/SongStoryMap";
import SongStructureChooser from "./components/SongStructureChooser";
import SongLengthChooser from "./components/SongLengthChooser";
import CandidateFeelingTabs from "./components/CandidateFeelingTabs";
import ComposerCandidateHeading from "./components/ComposerCandidateHeading";
import ComposerChildArtwork from "./components/ComposerChildArtwork";
import CompositionPerformActions from "./components/CompositionPerformActions";
import ComposerInstrumentPicker from "./components/ComposerInstrumentPicker";
import ComposerWorkspaceTabs from "./components/ComposerWorkspaceTabs";
import ComposerWorkspacePanel from "./components/ComposerWorkspacePanel";
import ComposerWorkspaceEmpty from "./components/ComposerWorkspaceEmpty";
import ComposerMeasureNavigator from "./components/ComposerMeasureNavigator";
import ComposerInstrumentLibrary from "./components/ComposerInstrumentLibrary";
import { useComposerWorkspace } from "./hooks/useComposerWorkspace";
import MobileMeasureRange from "./components/MobileMeasureRange";
import { useBeatPatternState } from "./hooks/useBeatPatternState";
import { useAccompanimentMixer } from "./hooks/useAccompanimentMixer";
import { useCompositionMediaExport } from "./hooks/useCompositionMediaExport";
import { useMelodyCandidatePriority } from "./hooks/useMelodyCandidatePriority";
import { UNSAVED_WORK_WARNING, useUnsavedWorkWarning } from "./hooks/useUnsavedWorkWarning";
import { backingDisplayNotes, repeatFourMeasures, rationalFromBeats } from "./components/backingDisplayNotes";
import { firebaseConfigured } from "./firebase/config";
import type { User } from "./firebase/client";
import type { PublishedSong } from "./firebase/communityAlbums";
import type { CloudScore, CloudScoreListItem } from "./firebase/scores";
import { useCloudScoreList } from "./hooks/useCloudScoreList";
import { useCloudProjectAutosave } from "./hooks/useCloudProjectAutosave";
import { useBrowserProjectAutosave } from "./hooks/useBrowserProjectAutosave";
import { useDraftRevision } from "./hooks/useDraftRevision";
import { useLostDrawingRecovery } from "./hooks/useLostDrawingRecovery";
import { usePublishedSongPlayback } from "./hooks/usePublishedSongPlayback";
import { useScorePdfExport } from "./hooks/useScorePdfExport";
import ScoreExportRecoveryDialog from "./components/ScoreExportRecoveryDialog";
import LostDrawingRecoveryDialog from "./components/LostDrawingRecoveryDialog";
import { makeRecoveredDrawingProject } from "./music/lostDrawingRecoveryChoice";
import type { LostDrawingRecoveryCandidate } from "./music/lostDrawingRecoveryModel";
import { scanLostDrawingRecoveryRecords } from "./music/lostDrawingRecovery";
import { checkpointBrowserProject, clearBrowserCurrentProject, readBrowserProject, saveBrowserProjectDraft } from "./music/projectStorage";
import { recoverCloudProjectDraft } from "./music/projectRecovery";
import { MAX_ACCOMPANIMENT_INSTRUMENTS, createAccompanimentPattern, findAccompanimentStyle,
  type AccompanimentStyleId } from "./music/accompaniment";
import { uniqueAccompanimentInstrumentIds } from "./music/accompanimentSelection";
import { getCandidates } from "./music/candidates";
import { makeEndingCandidates } from "./music/endingCandidates";
import { MELODY_FEELING_GROUPS, type MelodyFeelingId } from "./music/melodyFeelings";
import { chordMidiPitches } from "./music/chord";
import { draftFingerprint, readDraft, type SavedDraft } from "./music/draft";
import { cloudSaveIssue, findDraftSaveIssues, type SaveIssue } from "./music/draftValidation";
import { findHarmonyPreset, HARMONY_PRESETS } from "./music/harmonyPresets";
import { normalizeBeatPattern, type BeatPatternEvent } from "./music/beatPattern";
import { findInstrument, type InstrumentId } from "./music/instruments";
import { measureCapacity, meterKey, validateMeasure, type Meter } from "./music/meter";
import { rational, toNumber } from "./music/rational";
import { fillStructuredRepeats, songStructurePlan, type SongStructureId } from "./music/songStructure";
import type { SongLength } from "./music/songLength";
import { changeCompositionHarmony, compositionFromDraft, compositionFromShare, emptyComposition, lyricText,
  resizeComposition, shortenedMeasuresContainWork, type MeasureDraft } from "./music/composerDraft";
import MeasureHarmonyGuide from "./components/MeasureHarmonyGuide";
import PublishPlaybackNotice from "./components/PublishPlaybackNotice";
import ComposerMeterChooser from "./components/ComposerMeterChooser";
import ComposerPlaybackControls from "./components/ComposerPlaybackControls";
import ComposerSettings from "./components/ComposerSettings";
import ComposerLyrics from "./components/ComposerLyrics";
import { pitchName, positionNotes, withEditedPitch } from "./music/score";
import { findSoundEffect, type SoundEffectId } from "./music/soundEffects";
import { buildShareUrl, readCompositionFromHash, type SharedComposition } from "./music/share";
import type { HarmonyStory, MelodyCandidate, NoteEvent } from "./music/types";
import { useKaraokeAutoFocus } from "./hooks/useKaraokeAutoFocus";
import { useRecordingFileExport } from "./hooks/useRecordingFileExport";
import type { LyricVideoPlan } from "./video/lyricVideoPlan";
import { buildRecordedMusicVideoPlan, matchingMusicVideoRecording } from "./video/musicVideoRecording";
import type { MusicVideoScene } from "./video/musicVideoModel";

// backingDisplayNotes & repeatFourMeasures moved to ./components/backingDisplayNotes

type SongPlaybackState = "idle" | "playing" | "paused";
type KaraokePhase = "idle" | "intro" | "song" | "outro" | "encoding" | "done" | "error";
type KaraokeMode = "recording" | "practice";
type KaraokeHighlight = Readonly<{
  section: "intro" | "song" | "outro";
  measureIndex: number | null;
  noteId: string | null;
}>;
type PlaybackSegment = Readonly<{ measureIndex: number; start: number; end: number }>;
type PlaybackNoteSegment = Readonly<{ measureIndex: number; noteId: string; start: number; end: number }>;

const QR_RENDER_LIMIT = 2400;

const storyInfo: Record<HarmonyStory, { label: string; description: string; icon: string }> = {
  home: { label: "우리 집 화음", description: "편안하고 제자리인 느낌", icon: "⌂" },
  journey: { label: "길을 떠나는 화음", description: "이야기를 움직이는 느낌", icon: "↗" },
  wonder: { label: "돌아가고 싶은 화음", description: "살짝 긴장되고 궁금한 느낌", icon: "?" },
  bounce: { label: "통통 뛰는 화음", description: "가볍고 신나는 느낌", icon: "●" },
  tender: { label: "포근한 화음", description: "따뜻하고 부드러운 느낌", icon: "♥" },
  brave: { label: "용감한 화음", description: "힘차게 앞으로 가는 느낌", icon: "★" },
  shadow: { label: "비밀 그림자 화음", description: "조심스럽고 신비로운 느낌", icon: "◐" },
  sparkle: { label: "반짝별 화음", description: "높고 빛나는 느낌", icon: "✦" },
  swing: { label: "들썩 화음", description: "리듬을 타고 춤추는 느낌", icon: "♫" },
  floating: { label: "둥실구름 화음", description: "하늘에 떠 있는 느낌", icon: "☁" },
  march: { label: "행진 화음", description: "발맞춰 나아가는 느낌", icon: "▸" },
  folk: { label: "이야기 화음", description: "노래하듯 친근한 느낌", icon: "♪" }
};

function firebaseAuthMessage(error: unknown, action: "signin" | "signup" | "reset"): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (code === "auth/email-already-in-use") return "이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.";
  if (code === "auth/invalid-email") return "이메일 주소 형식을 확인해 주세요.";
  if (code === "auth/weak-password") return "비밀번호는 6자 이상으로 만들어 주세요.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "이메일 또는 비밀번호가 맞지 않아요.";
  }
  if (code === "auth/too-many-requests") return "로그인 시도가 너무 많아요. 잠시 뒤 다시 시도해 주세요.";
  if (code === "auth/network-request-failed") return "네트워크 연결을 확인하고 다시 시도해 주세요.";
  if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation") {
    return "이메일 계정 기능이 아직 열리지 않았어요. 관리자에게 문의해 주세요.";
  }
  if (action === "signup") return "회원가입에 실패했어요. 입력 내용을 확인해 주세요.";
  if (action === "reset") return "비밀번호 재설정 메일을 보내지 못했어요. 다시 시도해 주세요.";
  return "이메일 로그인에 실패했어요. 다시 시도해 주세요.";
}

type CompositionSnapshot = Readonly<{
  presetId: string;
  meter: Meter;
  songLength: SongLength;
  structureTemplateId: SongStructureId | null;
  measures: readonly MeasureDraft[];
  beatPattern: readonly BeatPatternEvent[];
}>;


function isRecordingLink(search: string, hash: string): boolean {
  return new URLSearchParams(search).get("record") === "1" || /(?:^#|&)record=1(?:&|$)/.test(hash);
}

function buildMobileRecordingUrl(shareUrl: string): string {
  const [base, hash] = shareUrl.split("#");
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}record=1${hash ? `#${hash}` : ""}`;
}

function isLocalHost(location: Pick<Location, "hostname">): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function replaceNote(
  notes: readonly NoteEvent[],
  id: string,
  update: (note: NoteEvent) => NoteEvent
): NoteEvent[] {
  return notes.map((note) => (note.id === id ? update(note) : note));
}

function sanitizeNoteLinks(notes: readonly NoteEvent[]): NoteEvent[] {
  return notes.map((note, index) => {
    if (!note.linkToNext) return note;
    const next = notes[index + 1];
    if (!next || note.pitch === null || next.pitch === null) {
      const { linkToNext, ...rest } = note;
      return rest;
    }
    return note;
  });
}

export default function App({ initialDraft, initialRecoveryCandidates = [], allowAutomaticRecovery = true,
  recoveryPreserved = true }: Readonly<{ initialDraft?: SavedDraft | null;
    initialRecoveryCandidates?: readonly LostDrawingRecoveryCandidate[]; allowAutomaticRecovery?: boolean;
    recoveryPreserved?: boolean }> = {}) {
  const mobileRecordMode = isRecordingLink(window.location.search, window.location.hash);
  const qrPlaybackMode = new URLSearchParams(window.location.search).get("play") === "qr";
  const qrSongId = new URLSearchParams(window.location.search).get("song") ?? "";
  const [incomingShare] = useState(() => readCompositionFromHash(window.location.hash));
  const [savedDraft] = useState(() => {
    try { return initialDraft ?? readDraft(window.localStorage); } catch { return null; }
  });
  const [showOpening, setShowOpening] = useState(() =>
    !mobileRecordMode && !qrPlaybackMode && new URLSearchParams(window.location.search).get("start") !== "new");
  const [showAppMenu, setShowAppMenu] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [accountLibraryOpen, setAccountLibraryOpen] = useState(false);
  const [communityAlbumOpen, setCommunityAlbumOpen] = useState(false);
  const publishedSongPlayback = usePublishedSongPlayback();
  const [publishingScore, setPublishingScore] = useState<CloudScore | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const activeAuthUid = useRef<string | null>(null);
  activeAuthUid.current = authUser?.uid ?? null;
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const { scores: cloudScores, scoresUid: cloudScoresUid, status: cloudListStatus, retry: retryCloudScores,
    upsert: upsertCloudScore } = useCloudScoreList(authUser?.uid ?? null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudSaveNotice, setCloudSaveNotice] = useState("");
  const [saveIssues, setSaveIssues] = useState<SaveIssue[]>([]);
  const [saveFailureOpen, setSaveFailureOpen] = useState(false);
  const [cloudSavedFingerprint, setCloudSavedFingerprint] = useState<string | null>(null);
  const resumableDraft = savedDraft && (!incomingShare || savedDraft.sourceHash === window.location.hash)
    ? savedDraft : null;
  const [projectIdentity, setProjectIdentity] = useState(() => ({
    projectId: resumableDraft?.projectId ?? crypto.randomUUID(),
    cloudScoreId: resumableDraft?.cloudScoreId,
    cloudOwnerId: resumableDraft?.cloudOwnerId
  }));
  const [leavingProject, setLeavingProject] = useState(false);
  const [recoverySafe, setRecoverySafe] = useState(recoveryPreserved);
  const recoverySafety = useRef(recoveryPreserved);
  const [recoveredStudioRequest, setRecoveredStudioRequest] = useState(0);
  const workspace = useComposerWorkspace();
  const projectLoadRequest = useRef(0);
  const activeCloudScoreId = projectIdentity.cloudOwnerId === authUser?.uid ? projectIdentity.cloudScoreId ?? null : null;
  const initialPreset = findHarmonyPreset(resumableDraft?.presetId ?? incomingShare?.presetId ?? HARMONY_PRESETS[0].id);
  const initialLength = resumableDraft?.songLength ?? incomingShare?.songLength ?? 8;
  const initialAccompanimentStyleId = resumableDraft?.accompanimentStyleId ?? incomingShare?.accompanimentStyleId ?? "children_song";
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset.id);
  const [songLength, setSongLength] = useState<SongLength>(initialLength);
  const [structureTemplateId, setStructureTemplateId] = useState<SongStructureId | null>(
    resumableDraft?.structureTemplateId ?? incomingShare?.structureTemplateId ?? null);
  const [meter, setMeter] = useState<Meter>(resumableDraft?.meter ?? incomingShare?.meter ?? { beats: 4, beatUnit: 4 });
  const [measures, setMeasures] = useState<MeasureDraft[]>(() =>
    resumableDraft ? compositionFromDraft(resumableDraft, initialPreset) :
      incomingShare ? compositionFromShare(incomingShare, initialPreset) : emptyComposition(initialPreset, initialLength)
  );
  const [musicVideoScenes, setMusicVideoScenes] = useState<readonly MusicVideoScene[]>(resumableDraft?.musicVideoScenes ?? []);
  const [musicVideoBusy, setMusicVideoBusy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [selectMultipleNotes, setSelectMultipleNotes] = useState(false);
  const [activeMelodyFeeling, setActiveMelodyFeeling] = useState<MelodyFeelingId>("flowing");
  const [soundEffectDialogOpen, setSoundEffectDialogOpen] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [undoStack, setUndoStack] = useState<readonly CompositionSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<readonly CompositionSnapshot[]>([]);
  const historyCurrent = useRef<CompositionSnapshot | null>(null);
  const restoringHistory = useRef(false);
  const splitCounter = useRef(0);
  const completionAnimationTimer = useRef<number | null>(null);
  const [recentCompletedIndex, setRecentCompletedIndex] = useState<number | null>(null);
  const [rhythmChecks, setRhythmChecks] = useState<Record<number, "valid" | "invalid">>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [presetPreviewing, setPresetPreviewing] = useState(false);
  const [songPlaybackState, setSongPlaybackState] = useState<SongPlaybackState>("idle");
  const [songPlaybackLoading, setSongPlaybackLoading] = useState(false);
  const songPlaybackRequest = useRef(0);
  const [playingMeasureIndex, setPlayingMeasureIndex] = useState<number | null>(null);
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);
  const [playingMeasure, setPlayingMeasure] = useState(false);
  const [lyricNotePositions, setLyricNotePositions] = useState<Record<number, Record<string, { x: number; y: number }>>>({});
  const [editorLyricNotePositions, setEditorLyricNotePositions] = useState<Record<number, Record<string, { x: number; y: number }>>>({});
  const [timelineLyricNotePositions, setTimelineLyricNotePositions] = useState<Record<number, Record<string, { x: number; y: number }>>>({});
  const [karaokeLyricNotePositions, setKaraokeLyricNotePositions] = useState<Record<number, Record<string, { x: number; y: number }>>>({});
  const playbackTicker = useRef<number | null>(null);
  const playbackElapsed = useRef(0);
  const playbackStartedAt = useRef(0);
  const playbackDuration = useRef(0);
  const playbackSegments = useRef<readonly PlaybackSegment[]>([]);
  const playbackNoteSegments = useRef<readonly PlaybackNoteSegment[]>([]);
  const noteAnimationTimers = useRef<number[]>([]);
  const recordingPreviewRef = useRef<HTMLAudioElement | null>(null);
  const mobileRecordingQrRef = useRef<SVGSVGElement | null>(null);
  const backingMixRequest = useRef(0);
  const karaokeAbortController = useRef<AbortController | null>(null);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<InstrumentId>(
    findInstrument(resumableDraft?.instrumentId ?? incomingShare?.instrumentId ?? "piano").id
  );
  const [accompanimentStyleId, setAccompanimentStyleId] = useState<AccompanimentStyleId>(
    initialAccompanimentStyleId
  );
  const [accompanimentInstrumentIds, setAccompanimentInstrumentIds] = useState<InstrumentId[]>(() =>
    uniqueAccompanimentInstrumentIds(resumableDraft?.accompanimentInstrumentIds ?? incomingShare?.accompanimentInstrumentIds ?? ["acoustic_grand_piano"])
  );
  const accompanimentMixer = useAccompanimentMixer(accompanimentInstrumentIds,
    resumableDraft?.accompanimentTrackMix ?? incomingShare?.accompanimentTrackMix);
  const { trackMix: accompanimentTrackMix, onTrackState } = accompanimentMixer;
  const {
    beatPattern, setBeatPattern, beatVolume, setBeatVolume,
    beatPreviewing, setBeatPreviewing, loadBeatPattern
  } = useBeatPatternState({
    initialPattern: resumableDraft?.beatPattern ?? incomingShare?.beatPattern,
    initialVolume: resumableDraft?.beatVolume ?? incomingShare?.beatVolume,
    meter
  });
  const [bpm, setBpm] = useState(resumableDraft?.bpm ?? incomingShare?.bpm ?? 96);
  const [showArrangement, setShowArrangement] = useState(resumableDraft?.showArrangement === true || incomingShare !== null);
  const [completionCelebration, setCompletionCelebration] = useState(false);
  const [songTitle, setSongTitle] = useState(
    resumableDraft?.title ?? (incomingShare ? `${incomingShare.title} 리메이크` : "나의 첫 노래")
  );
  const [creatorName, setCreatorName] = useState(resumableDraft?.creator ?? "");
  const [songDescription, setSongDescription] = useState(
    resumableDraft?.description ?? incomingShare?.description ?? ""
  );
  const [shareStatus, setShareStatus] = useState("");
  const [generatedShareUrl, setGeneratedShareUrl] = useState("");
  const [mobileRecordingUrl, setMobileRecordingUrl] = useState("");
  const [recordingSong, setRecordingSong] = useState(false);
  const [practicingSong, setPracticingSong] = useState(false);
  const [karaokeMode, setKaraokeMode] = useState<KaraokeMode>("recording");
  const [recordingCaptureMode, setRecordingCaptureMode] = useState<RecordingCaptureMode>("personal");
  const [recordingGuideMode, setRecordingGuideMode] = useState<KaraokeGuideMode>("first-note");
  const [recordingGuidePromptOpen, setRecordingGuidePromptOpen] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [recordingDownloadUrl, setRecordingDownloadUrl] = useState("");
  const [recordingVideoPlan, setRecordingVideoPlan] = useState<LyricVideoPlan | null>(null);
  const [recordedAudioBuffer, setRecordedAudioBuffer] = useState<AudioBuffer | null>(null);
  const [recordedVocalBuffer, setRecordedVocalBuffer] = useState<AudioBuffer | null>(null);
  const [recordedBackingBuffer, setRecordedBackingBuffer] = useState<AudioBuffer | null>(null);
  const [previewBackingVolume, setPreviewBackingVolume] = useState(1);
  const [mixingPreview, setMixingPreview] = useState(false);
  const [pitchReviews, setPitchReviews] = useState<readonly RecordingPitchReview[]>([]);
  const [reviewPlaybackNoteId, setReviewPlaybackNoteId] = useState<string | null>(null);
  const [analyzingPitch, setAnalyzingPitch] = useState(false);
  const [postProcessPreset, setPostProcessPreset] = useState<KaraokePostProcessPreset>("natural");
  const [processingRecording, setProcessingRecording] = useState(false);
  const [karaokeOpen, setKaraokeOpen] = useState(false);
  const [karaokePhase, setKaraokePhase] = useState<KaraokePhase>("idle");
  const [karaokeCount, setKaraokeCount] = useState<number | null>(null);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [karaokeHighlight, setKaraokeHighlight] = useState<KaraokeHighlight>({
    section: "intro",
    measureIndex: null,
    noteId: null
  });
  const [originalCreator, setOriginalCreator] = useState(resumableDraft?.originalCreator ??
    (incomingShare ? incomingShare.originalCreator || incomingShare.creator : ""));
  const [sourceHash, setSourceHash] = useState(incomingShare ? window.location.hash : resumableDraft?.sourceHash ?? "");
  const selectedPreset = findHarmonyPreset(selectedPresetId);
  const structurePlan = songStructurePlan(structureTemplateId, songLength);
  const selectedInstrument = findInstrument(selectedInstrumentId);
  const canRenderMobileRecordingQr = mobileRecordingUrl.length > 0 && mobileRecordingUrl.length <= QR_RENDER_LIMIT;

  const activeMeasure = measures[activeIndex];
  const lyrics = useMemo(() => measures.map((measure) => lyricText(measure.notes)), [measures]);
  const draftState = useMemo<SavedDraft>(() => ({
    version: 1, updatedAt: 0, ...projectIdentity, sourceHash, title: songTitle, description: songDescription,
    creator: creatorName, originalCreator, presetId: selectedPresetId, meter, songLength,
    structureTemplateId: structureTemplateId ?? undefined,
    instrumentId: selectedInstrumentId, accompanimentStyleId, accompanimentInstrumentIds, accompanimentTrackMix,
    beatPattern, beatVolume, bpm, lyrics, musicVideoScenes,
    measures: measures.map(({ candidateId, candidateName, notes, chords, keyFifths, effects }) => ({ candidateId, candidateName, notes, chords, keyFifths, effects })),
    showArrangement
  }), [accompanimentInstrumentIds, accompanimentStyleId, accompanimentTrackMix, beatPattern, beatVolume, bpm, creatorName, lyrics, measures, meter,
    originalCreator, selectedInstrumentId, selectedPresetId, songDescription, sourceHash, showArrangement, songLength,
    songTitle, structureTemplateId, musicVideoScenes, projectIdentity]);
  const { currentDraft, fingerprint: currentDraftFingerprint, adopt: adoptDraftRevision } = useDraftRevision(draftState, resumableDraft?.updatedAt);
  const persistenceEnabled = !mobileRecordMode && !qrPlaybackMode && !leavingProject;
  const browserSave = useBrowserProjectAutosave(currentDraft, persistenceEnabled && recoverySafe);
  const saveStatus = recoverySafe ? browserSave.status : "이전 그림 기록 보관 실패 · 복구 확인 필요";
  const cloudAutosave = useCloudProjectAutosave({ draft: currentDraft, fingerprint: currentDraftFingerprint, uid: authUser?.uid ?? null,
    enabled: persistenceEnabled && recoverySafe && authReady && !cloudBusy, scores: cloudScores, listStatus: cloudListStatus,
    onSaved: (score, fingerprint, projectId, uid) => {
      const savedProjectId = score.draft.projectId ?? projectId;
      setProjectIdentity((identity) => identity.projectId !== projectId || identity.projectId === savedProjectId &&
        identity.cloudScoreId === score.id && identity.cloudOwnerId === uid ? identity :
        { projectId: savedProjectId, cloudScoreId: score.id, cloudOwnerId: uid });
      setCloudSavedFingerprint(fingerprint);
      upsertCloudScore(score);
    } });
  const lostDrawingRecovery = useLostDrawingRecovery({ current: currentDraft, initialCandidates: initialRecoveryCandidates,
    allowAutomatic: allowAutomaticRecovery, enabled: persistenceEnabled, uid: authUser?.uid ?? null,
    scores: cloudScores, scoresUid: cloudScoresUid, onRestore: restoreLostDrawing, onPreserved: confirmRecoveryPreserved });
  const initialDraftFingerprint = useRef(currentDraftFingerprint);
  const currentAccompanimentOptions = useMemo<AccompanimentOptions>(() => ({
    styleId: accompanimentStyleId,
    instrumentIds: accompanimentInstrumentIds,
    trackMix: accompanimentTrackMix,
    onTrackState,
    beatPattern,
    beatVolume,
    meter
  }), [accompanimentInstrumentIds, accompanimentStyleId, accompanimentTrackMix, beatPattern, beatVolume, meter, onTrackState]);
  const candidates = useMemo(
    () => {
      const choices = getCandidates(activeMeasure.story, meter, activeMeasure.chords);
      return activeIndex === measures.length - 1
        ? makeEndingCandidates(choices, activeMeasure.chords, meter) : choices;
    },
    [activeIndex, activeMeasure.story, activeMeasure.chords, measures.length, meter]
  );
  const candidatePriority = useMelodyCandidatePriority(candidates, measures, activeIndex, accompanimentStyleId);
  const pitchReviewByMeasure = useMemo(() => {
    const worstByMeasure = new Map<number, RecordingPitchReview>();
    pitchReviews.filter((review) => review.status === "off").forEach((review) => {
      const current = worstByMeasure.get(review.measureIndex);
      if (!current || Math.abs(review.cents ?? 0) > Math.abs(current.cents ?? 0)) {
        worstByMeasure.set(review.measureIndex, review);
      }
    });
    return [...worstByMeasure.values()].sort((first, second) => first.measureIndex - second.measureIndex);
  }, [pitchReviews]);
  const candidateFeelingGroups = useMemo(() => MELODY_FEELING_GROUPS.map((group) => ({
    ...group,
    candidates: candidatePriority.filter((candidate) => candidate.feelingId === group.id)
  })).filter((group) => group.candidates.length > 0), [candidatePriority]);
  const selectedFeelingGroup = candidateFeelingGroups.find((group) => group.id === activeMelodyFeeling)
    ?? candidateFeelingGroups[0];
  const activeNotes = activeMeasure.notes ?? [];
  const validation = activeMeasure.notes
    ? validateMeasure(activeMeasure.notes, meter)
    : null;
  const usedBeats = activeNotes.reduce((total, note) => total + toNumber(note.duration), 0);
  const capacity = toNumber(measureCapacity(meter));
  const selectedNote = activeNotes.find((note) => note.id === selectedNoteId);
  const selectedNotes = activeNotes.filter((note) => selectedNoteIds.includes(note.id));
  const completedCount = measures.filter((measure) => measure.notes !== null).length;
  const hasUnsavedWork = (completedCount > 0 || currentDraftFingerprint !== initialDraftFingerprint.current) &&
    currentDraftFingerprint !== cloudSavedFingerprint;
  const localSaveFailed = saveStatus.includes("못했") || saveStatus.includes("실패");
  const cloudSaveIsCurrent = Boolean(authUser) && currentDraftFingerprint === cloudSavedFingerprint;
  const cloudSaveFailed = (saveIssues.length > 0 || Boolean(cloudAutosave.error)) && !cloudSaveIsCurrent;
  const cloudSaveLabel = !firebaseConfigured ? "이 기기에만 저장" : !authReady ? "계정 확인 중" :
    !authUser ? "계정 저장: 로그인 필요" : cloudAutosave.busy ? "프로젝트 저장 중" :
      cloudSaveIsCurrent ? "계정 저장 완료 ✓" : cloudSaveFailed ? "프로젝트 저장 대기 · 복구본 보관 중" : cloudAutosave.status || "계정 저장 확인";
  const skipNextUnloadWarning = useUnsavedWorkWarning(
    !showOpening && !mobileRecordMode && !qrPlaybackMode && hasUnsavedWork
  );
  const allValid = measures.every(
    (measure) => measure.notes && validateMeasure(measure.notes, meter).state === "exact"
  );
  // Completing every measure only unlocks the finish button.  Accompaniment is
  // deliberately held back until that button opens the arrangement stage.
  const accompanimentReady = showArrangement && allValid;
  const scorePdf = useScorePdfExport({ title: songTitle, creator: creatorName, ready: accompanimentReady,
    composition: makeSharedComposition, onStatus: setShareStatus });
  const { exportingPdf, pdfIncludeAccompaniment, pdfPlaybackUrl, exportPdf } = scorePdf;
  const playingSong = songPlaybackState !== "idle" || songPlaybackLoading;
  const karaokeRunning = recordingSong || practicingSong;
  const songAudioBusy = playingId !== null || playingSong || playingMeasure || karaokeRunning || presetPreviewing || beatPreviewing || musicVideoBusy;
  useKaraokeAutoFocus(karaokeOpen, karaokeRunning, karaokeHighlight);
  const updateLyricNotePositions = useCallback((index: number, positions: Record<string, { x: number; y: number }>) => {
    setLyricNotePositions((current) => {
      const previous = current[index] ?? {};
      const changed = Object.keys(previous).length !== Object.keys(positions).length ||
        Object.entries(positions).some(([id, position]) =>
          Math.abs((previous[id]?.x ?? -9999) - position.x) > 0.5 ||
          Math.abs((previous[id]?.y ?? -9999) - position.y) > 0.5);
      return changed ? { ...current, [index]: positions } : current;
    });
  }, []);
  const updateEditorLyricNotePositions = useCallback((index: number, positions: Record<string, { x: number; y: number }>) => {
    setEditorLyricNotePositions((current) => {
      const previous = current[index] ?? {};
      const changed = Object.keys(previous).length !== Object.keys(positions).length ||
        Object.entries(positions).some(([id, position]) =>
          Math.abs((previous[id]?.x ?? -9999) - position.x) > 0.5 ||
          Math.abs((previous[id]?.y ?? -9999) - position.y) > 0.5);
      return changed ? { ...current, [index]: positions } : current;
    });
  }, []);
  const updateTimelineLyricNotePositions = useCallback((index: number, positions: Record<string, { x: number; y: number }>) => {
    setTimelineLyricNotePositions((current) => {
      const previous = current[index] ?? {};
      const changed = Object.keys(previous).length !== Object.keys(positions).length ||
        Object.entries(positions).some(([id, position]) =>
          Math.abs((previous[id]?.x ?? -9999) - position.x) > 0.5 ||
          Math.abs((previous[id]?.y ?? -9999) - position.y) > 0.5);
      return changed ? { ...current, [index]: positions } : current;
    });
  }, []);
  const updateKaraokeLyricNotePositions = useCallback((index: number, positions: Record<string, { x: number; y: number }>) => {
    setKaraokeLyricNotePositions((current) => {
      const previous = current[index] ?? {};
      const changed = Object.keys(previous).length !== Object.keys(positions).length ||
        Object.entries(positions).some(([id, position]) =>
          Math.abs((previous[id]?.x ?? -9999) - position.x) > 0.5 ||
          Math.abs((previous[id]?.y ?? -9999) - position.y) > 0.5);
      return changed ? { ...current, [index]: positions } : current;
    });
  }, []);
  const printableMeasures = measures.flatMap((measure) => measure.notes ? [{
    candidateName: measure.candidateName ?? "나만의 가락",
    notes: measure.notes,
    chords: measure.chords,
    keyFifths: measure.keyFifths,
    effects: measure.effects
  }] : []);
  const exportMeasures = useMemo(() => measures.flatMap((measure, measureIndex) => measure.notes ? [{
    notes: measure.notes, harmony: measure.story, chords: measure.chords, effects: measure.effects,
    measureIndex, isSongEnding: measureIndex === measures.length - 1
  }] : []), [measures]);
  const recordingFileExport = useRecordingFileExport({
    audioUrl: recordingDownloadUrl, plan: recordingVideoPlan, scenes: musicVideoScenes,
    measures: exportMeasures, title: songTitle, composer: creatorName, instrumentId: selectedInstrumentId,
    bpm, accompaniment: currentAccompanimentOptions, complete: allValid && exportMeasures.length === songLength,
    disabled: songAudioBusy || exportingPdf || processingRecording || mixingPreview,
    fileName: safeSongFileName("mp3"), onStatus: setRecordingStatus
  });
  const isAnyPlaying = songAudioBusy || recordingFileExport.busy;
  const mediaExportBusy = isAnyPlaying || exportingPdf || processingRecording || mixingPreview;
  const compositionMediaExport = useCompositionMediaExport({
    measures: exportMeasures, complete: allValid && exportMeasures.length === songLength,
    title: songTitle, instrumentId: selectedInstrumentId, bpm, accompaniment: currentAccompanimentOptions,
    disabled: mediaExportBusy, onStatus: setShareStatus
  });
  const exportingBacking = compositionMediaExport.exporting;
  const karaokeIntroMeasures = repeatFourMeasures(measures, false);
  const karaokeOutroMeasures = repeatFourMeasures(measures, true);

  function clearPlaybackTicker() {
    if (playbackTicker.current !== null) window.clearInterval(playbackTicker.current);
    playbackTicker.current = null;
  }

  function clearNoteAnimationTimers() {
    noteAnimationTimers.current.forEach((timer) => window.clearTimeout(timer));
    noteAnimationTimers.current = [];
    setPlayingNoteId(null);
  }

  function animateSingleMeasureNotes(notes: readonly NoteEvent[], tempo: number) {
    clearNoteAnimationTimers();
    const secondsPerBeat = 60 / tempo;
    let cursor = 0.06;
    notes.forEach((note) => {
      const startTimer = window.setTimeout(() => setPlayingNoteId(note.id), cursor * 1000);
      cursor += toNumber(note.duration) * secondsPerBeat;
      const endTimer = window.setTimeout(() => setPlayingNoteId(null), cursor * 1000);
      noteAnimationTimers.current.push(startTimer, endTimer);
    });
  }

  function updatePlaybackPosition() {
    const elapsed = playbackElapsed.current + Math.max(0, performance.now() - playbackStartedAt.current) / 1000;
    const segment = playbackSegments.current.find((item) => elapsed >= item.start && elapsed < item.end);
    const noteSegment = playbackNoteSegments.current.find((item) => elapsed >= item.start && elapsed < item.end);
    setPlayingMeasureIndex(segment?.measureIndex ?? null);
    setPlayingNoteId(noteSegment?.noteId ?? null);
    if (elapsed >= playbackDuration.current) {
      clearPlaybackTicker();
      setSongPlaybackState("idle");
      accompanimentMixer.setSoloInstrumentId(null);
      setPlayingMeasureIndex(null);
      setPlayingNoteId(null);
    }
  }

  function startPlaybackTicker() {
    clearPlaybackTicker();
    updatePlaybackPosition();
    playbackTicker.current = window.setInterval(updatePlaybackPosition, 60);
  }

  function resetPlaybackUi(invalidateRequest = true) {
    if (invalidateRequest) songPlaybackRequest.current += 1;
    clearPlaybackTicker();
    playbackElapsed.current = 0;
    playbackDuration.current = 0;
    playbackSegments.current = [];
    playbackNoteSegments.current = [];
    setSongPlaybackState("idle");
    setSongPlaybackLoading(false);
    accompanimentMixer.setSoloInstrumentId(null);
    accompanimentMixer.resetTrackLevels();
    setPlayingMeasureIndex(null);
    setPlayingNoteId(null);
  }

  useEffect(() => () => {
    karaokeAbortController.current?.abort();
    clearPlaybackTicker();
    clearNoteAnimationTimers();
    if (completionAnimationTimer.current !== null) window.clearTimeout(completionAnimationTimer.current);
    void stopPlayback();
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import("./firebase/client").then(({ observeAuth }) => {
      if (!active) return;
      unsubscribe = observeAuth((user) => {
        setAuthUser(user);
        setAuthReady(true);
        setCloudSavedFingerprint(null);
        setCloudError("");
        setCloudSaveNotice("");
      });
    }).catch((error) => {
      console.error(error);
      if (active) {
        setAuthReady(true);
        setCloudError("Firebase 인증을 시작하지 못했어요.");
      }
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => () => {
    if (recordingDownloadUrl) URL.revokeObjectURL(recordingDownloadUrl);
  }, [recordingDownloadUrl]);

  useEffect(() => {
    // 선택된 멜로디 악기 프리로드
    void preloadInstrument(selectedInstrumentId);
  }, [selectedInstrumentId]);

  useEffect(() => {
    // 선택된 반주 악기들 프리로드
    accompanimentInstrumentIds.forEach((id) => {
      void preloadInstrument(id);
    });
  }, [accompanimentInstrumentIds]);

  useEffect(() => {
    const next: CompositionSnapshot = { presetId: selectedPresetId, meter, songLength, structureTemplateId, measures, beatPattern };
    const previous = historyCurrent.current;
    if (!previous) {
      historyCurrent.current = next;
      return;
    }
    if (restoringHistory.current) {
      restoringHistory.current = false;
      historyCurrent.current = next;
      return;
    }
    if (previous.presetId === next.presetId && previous.meter === next.meter &&
      previous.songLength === next.songLength && previous.structureTemplateId === next.structureTemplateId &&
      previous.measures === next.measures && previous.beatPattern === next.beatPattern) return;
    setUndoStack((stack) => [...stack, previous].slice(-40));
    setRedoStack([]);
    historyCurrent.current = next;
  }, [measures, meter, selectedPresetId, songLength, structureTemplateId, beatPattern]);

  function restoreComposition(snapshot: CompositionSnapshot) {
    restoringHistory.current = true;
    setSelectedPresetId(snapshot.presetId);
    setMeter(snapshot.meter);
    setSongLength(snapshot.songLength);
    setStructureTemplateId(snapshot.structureTemplateId);
    setMeasures(snapshot.measures as MeasureDraft[]);
    setBeatPattern([...snapshot.beatPattern]);
    setRhythmChecks({});
    setActiveIndex((index) => Math.min(index, snapshot.measures.length - 1));
    setSelectedNoteId("");
    setSelectedNoteIds([]);
    setSelectMultipleNotes(false);
    setShowArrangement(false);
  }

  function undoCompositionChange() {
    const previous = undoStack.at(-1);
    const current = historyCurrent.current;
    if (!previous || !current) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, current].slice(-40));
    restoreComposition(previous);
  }

  function redoCompositionChange() {
    const next = redoStack.at(-1);
    const current = historyCurrent.current;
    if (!next || !current) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, current].slice(-40));
    restoreComposition(next);
  }

  function chooseMeter(next: Meter) {
    if (meterKey(next) === meterKey(meter)) return;
    const nextBeatPattern = normalizeBeatPattern(beatPattern, next);
    if (nextBeatPattern.length < beatPattern.length &&
      !window.confirm("새 박자를 벗어나는 리듬 악기 소리만 줄어들어요. 박자를 바꿀까요? 되돌리기로 복구할 수 있어요.")) return;
    setMeter(next);
    setBeatPattern(nextBeatPattern);
    setRhythmChecks(Object.fromEntries(measures.flatMap((measure, index) => measure.notes
      ? [[index, validateMeasure(measure.notes, next).state === "exact" ? "valid" : "invalid"]] : [])));
    setEditStatus("음표와 가사는 그대로예요. 새 박자에 맞게 마디 길이를 확인해 주세요.");
    setShowArrangement(false);
  }

  function choosePreset(id: string) {
    const preset = findHarmonyPreset(id);
    if (preset.id === selectedPresetId) return;
    setSelectedPresetId(preset.id);
    setMeasures((current) => changeCompositionHarmony(current, preset));
    setEditStatus("가락과 가사는 그대로 두고 화음만 바꿨어요. 함께 들어 보세요.");
    setShowArrangement(false);
  }

  function chooseLength(length: SongLength) {
    if (length === songLength) return;
    if (shortenedMeasuresContainWork(measures, length) &&
      !window.confirm(`${length + 1}~${songLength}마디를 지울까요? 앞의 ${length}마디는 그대로예요.\n되돌리기로 복구할 수 있어요.`)) return;
    setSongLength(length);
    setStructureTemplateId(null);
    setMeasures((current) => resizeComposition(current, selectedPreset, length));
    setRhythmChecks((current) => Object.fromEntries(Object.entries(current).filter(([index]) => Number(index) < length)));
    if (activeIndex >= length) selectMeasure(length - 1);
    setEditStatus(length > songLength ? "만든 마디 뒤에 빈 마디를 더했어요." : "마디 수를 줄였어요. 되돌리기로 복구할 수 있어요.");
    setShowArrangement(false);
  }

  function chooseStructure(id: SongStructureId | null) {
    if (id === structureTemplateId) return;
    setStructureTemplateId(id);
    setEditStatus("만든 마디는 그대로예요. 다음에 넣는 가락부터 노래 구조를 적용해요.");
    setShowArrangement(false);
  }

  function updateActiveMeasure(update: (measure: MeasureDraft) => MeasureDraft) {
    setRhythmChecks((current) => {
      if (!(activeIndex in current)) return current;
      const next = { ...current };
      delete next[activeIndex];
      return next;
    });
    setMeasures((current) => fillStructuredRepeats(
      current.map((measure, index) => (index === activeIndex ? update(measure) : measure)),
      structureTemplateId, activeIndex));
  }

  function selectMeasure(index: number) {
    setSelectMultipleNotes(false);
    setActiveIndex(index);
    setSelectedNoteId(measures[index].notes?.[0]?.id ?? "");
    setSelectedNoteIds(measures[index].notes?.[0] ? [measures[index].notes[0].id] : []);
    setEditStatus("");
  }

  function chooseCandidate(candidate: MelodyCandidate) {
    const firstCompletion = activeMeasure.notes === null;
    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: candidate.id,
      candidateName: candidate.name,
      notes: candidate.notes
    }));
    setSelectedNoteId(candidate.notes[0]?.id ?? "");
    setSelectedNoteIds(candidate.notes[0] ? [candidate.notes[0].id] : []);
    setEditStatus("");
    if (firstCompletion) {
      if (completionAnimationTimer.current !== null) window.clearTimeout(completionAnimationTimer.current);
      setRecentCompletedIndex(activeIndex);
      completionAnimationTimer.current = window.setTimeout(() => {
        setRecentCompletedIndex(null);
        completionAnimationTimer.current = null;
      }, 900);
    }
  }

  async function preview(candidate: MelodyCandidate, event?: React.MouseEvent) {
    event?.stopPropagation();
    // The candidate gallery is for choosing a melody.  It must stay melody-only
    // even when an older completed draft is open in the background.
    const duration = await playMeasure(candidate.notes, candidate.harmony, activeMeasure.chords,
      selectedInstrumentId, bpm, [], false);
    if (duration === null) return;
    setPlayingId(candidate.id);
    animateSingleMeasureNotes(candidate.notes, bpm);
    window.setTimeout(() => setPlayingId(null), duration * 1000);
  }

  function renderCandidateCard(candidate: MelodyCandidate) {
    return (
      <article key={candidate.id}
        className={`candidate-card${activeMeasure.candidateId === candidate.id ? " selected" : ""}${playingId === candidate.id ? " previewing" : ""}`}
        data-playing={playingId === candidate.id ? "true" : undefined}
        onClick={() => chooseCandidate(candidate)}>
        <div className="card-top">
          <div><strong>{candidate.name}</strong></div>
          <button className="play-button" type="button" disabled={isAnyPlaying}
            aria-label={`${candidate.name} 들어보기`}
            aria-pressed={playingId === candidate.id}
            onClick={(event) => void preview(candidate, event)}>
            <PlayIcon playing={playingId === candidate.id} />
          </button>
        </div>
        <ScoreMeasure notes={candidate.notes} meter={meter} compact
          playingNoteId={playingId === candidate.id ? playingNoteId : null} />
        <button className="select-row" type="button" data-testid={`candidate-${candidate.id}`}
          onClick={(event) => {
            event.stopPropagation();
            chooseCandidate(candidate);
          }}>
          <span>{activeMeasure.candidateId === candidate.id ? "이 마디에 고른 가락" : "이 가락 고르기"}</span>
          <i>{activeMeasure.candidateId === candidate.id
            ? <CheckCircle2 size={17} aria-hidden="true" />
            : <ArrowRight size={17} aria-hidden="true" />}</i>
        </button>
      </article>
    );
  }

  async function playWholeSong(startMeasureIndex = 0, soloInstrumentId?: InstrumentId, reservedRequest?: number) {
    const request = reservedRequest ?? ++songPlaybackRequest.current;
    const playable = measures.slice(startMeasureIndex).flatMap((measure, relativeIndex) => measure.notes ? [{
      notes: measure.notes, harmony: measure.story, chords: measure.chords, effects: measure.effects,
      measureIndex: startMeasureIndex + relativeIndex,
      isSongEnding: startMeasureIndex + relativeIndex === measures.length - 1
    }] : []);
    if (playable.length === 0) return;
    setSongPlaybackLoading(true);
    accompanimentMixer.setSoloInstrumentId(soloInstrumentId ?? null);
    let duration: number | null;
    try {
      duration = await playComposition(playable, selectedInstrumentId, bpm,
        accompanimentReady ? { ...currentAccompanimentOptions, soloInstrumentId,
          onTrackState: (state) => { if (request === songPlaybackRequest.current) onTrackState(state); }
        } : undefined, false, workspace.view === "melody" && !soloInstrumentId ? { melodyOnly: true } : undefined);
    } catch (error) {
      console.error(error);
      if (request === songPlaybackRequest.current) resetPlaybackUi();
      return;
    }
    if (request !== songPlaybackRequest.current) return;
    setSongPlaybackLoading(false);
    if (duration === null) {
      accompanimentMixer.setSoloInstrumentId(null);
      return;
    }
    const secondsPerBeat = 60 / bpm;
    let offsetSeconds = 0.08;
    const noteSegments: PlaybackNoteSegment[] = [];
    playbackSegments.current = playable.map((measure) => {
      const start = offsetSeconds;
      let noteOffset = start;
      measure.notes.forEach((note) => {
        const noteEnd = noteOffset + toNumber(note.duration) * secondsPerBeat;
        noteSegments.push({ measureIndex: measure.measureIndex, noteId: note.id, start: noteOffset, end: noteEnd });
        noteOffset = noteEnd;
      });
      offsetSeconds += measure.notes.reduce((total, note) => total + toNumber(note.duration), 0) * secondsPerBeat;
      return { measureIndex: measure.measureIndex, start, end: offsetSeconds };
    });
    playbackNoteSegments.current = noteSegments;
    playbackElapsed.current = 0;
    playbackStartedAt.current = performance.now();
    playbackDuration.current = duration;
    setSongPlaybackState("playing");
    setPlayingMeasureIndex(null);
    startPlaybackTicker();
  }

  async function pauseWholeSong() {
    if (songPlaybackState !== "playing") return;
    playbackElapsed.current += Math.max(0, performance.now() - playbackStartedAt.current) / 1000;
    clearPlaybackTicker();
    setSongPlaybackState("paused");
    await pausePlayback();
  }

  function resumeWholeSong() {
    if (songPlaybackState !== "paused") return;
    playbackStartedAt.current = performance.now();
    setSongPlaybackState("playing");
    startPlaybackTicker();
    void resumePlayback().then((resumed) => {
      if (!resumed) resetPlaybackUi();
    });
  }

  async function stopWholeSong() {
    resetPlaybackUi();
    await stopPlayback();
  }

  function toggleWholeSong(startMeasureIndex = activeIndex) {
    if (songPlaybackLoading) void stopWholeSong();
    else if (accompanimentMixer.soloInstrumentId) void stopWholeSong().then(() => playWholeSong(startMeasureIndex));
    else if (songPlaybackState === "idle") void playWholeSong(startMeasureIndex);
    else if (songPlaybackState === "playing") void pauseWholeSong();
    else resumeWholeSong();
  }

  async function toggleAccompanimentSolo(instrumentId: InstrumentId) {
    const stopSolo = accompanimentMixer.soloInstrumentId === instrumentId;
    const request = ++songPlaybackRequest.current;
    setSongPlaybackLoading(true);
    await stopPlayback();
    if (request !== songPlaybackRequest.current) return;
    resetPlaybackUi(false);
    if (!stopSolo) await playWholeSong(0, instrumentId, request);
  }

  async function playActiveMeasure() {
    if (!activeMeasure.notes) return;
    // Use the exact same playback path as a completed song. This prevents an
    // edited measure from being auditioned by the older candidate-preview
    // player instead of the notes currently shown in the editor.
    const notes = activeMeasure.notes.map((note) => ({ ...note }));
    const duration = await playComposition([{
      notes,
      harmony: activeMeasure.story,
      chords: activeMeasure.chords,
      effects: activeMeasure.effects,
      measureIndex: activeIndex,
      isSongEnding: activeIndex === measures.length - 1
    }], selectedInstrumentId, bpm, accompanimentReady ? currentAccompanimentOptions : undefined, false, workspace.view === "melody" ? { melodyOnly: true } : undefined);
    if (duration === null) return;
    setPlayingMeasure(true);
    animateSingleMeasureNotes(notes, bpm);
    window.setTimeout(() => setPlayingMeasure(false), duration * 1000);
  }

  function changePitch(amount: number) {
    if (selectedNoteIds.length === 0 || !activeMeasure.notes) return;
    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: "custom",
      candidateName: measure.candidateName ? measure.candidateName + " · 나만의 변화" : "나만의 가락",
      notes: (measure.notes ?? []).map((note) => selectedNoteIds.includes(note.id) && note.pitch !== null
        ? withEditedPitch(note, Math.max(48, Math.min(84, note.pitch + amount)), measure.keyFifths)
        : note)
    }));
  }

  function moveNotePitch(id: string, value: number) {
    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: "custom",
      candidateName: "직접 다듬은 가락",
      notes: replaceNote(measure.notes ?? [], id, (note) => withEditedPitch(note, value, measure.keyFifths))
    }));
  }

  function moveNotePosition(id: string, targetBeat: number) {
    updateActiveMeasure((measure) => {
      const notes = measure.notes ?? [];
      const movingIndex = notes.findIndex((note) => note.id === id);
      if (movingIndex < 0) return measure;
      const moving = notes[movingIndex];
      const others = notes.filter((note) => note.id !== id);
      const positionedOthers = positionNotes(others);
      let insertAt = positionedOthers.findIndex((note) => targetBeat < note.onset + toNumber(note.duration) / 2);
      if (insertAt < 0) insertAt = others.length;
      const next = sanitizeNoteLinks([...others.slice(0, insertAt), moving, ...others.slice(insertAt)]);
      return {
        ...measure,
        candidateId: "custom",
        candidateName: "직접 다듬은 가락",
        notes: next
      };
    });
  }

  function selectNote(id: string, extendRange = false) {
    if (selectMultipleNotes && !extendRange) {
      const next = selectedNoteIds.includes(id)
        ? selectedNoteIds.filter((selected) => selected !== id) : [...selectedNoteIds, id];
      setSelectedNoteIds(next);
      setSelectedNoteId(next.includes(id) ? id : next.at(-1) ?? "");
      setEditStatus(`${next.length}개의 음표를 선택했어요.`);
      return;
    }
    if (extendRange && selectedNoteId) {
      const anchor = activeNotes.findIndex((note) => note.id === selectedNoteId);
      const target = activeNotes.findIndex((note) => note.id === id);
      if (anchor >= 0 && target >= 0) {
        const [start, end] = anchor < target ? [anchor, target] : [target, anchor];
        setSelectedNoteIds(activeNotes.slice(start, end + 1).map((note) => note.id));
        setSelectedNoteId(id);
        setEditStatus(`${end - start + 1}개의 음표를 선택했어요.`);
        return;
      }
    }
    setSelectedNoteId(id);
    setSelectedNoteIds([id]);
    setEditStatus("");
  }

  function splitSelectedNote() {
    if (!selectedNoteId || !activeMeasure.notes) return;
    const note = activeMeasure.notes.find((item) => item.id === selectedNoteId);
    if (!note || selectedNoteIds.length !== 1) return;
    const token = ++splitCounter.current;
    const halfDuration = rational(note.duration.numerator, note.duration.denominator * 2);
    const first = { ...note, id: `${note.id}-split-${token}-a`, duration: halfDuration, beamGroup: undefined, beamBreak: undefined };
    const second = { ...note, id: `${note.id}-split-${token}-b`, duration: halfDuration, beamGroup: undefined, beamBreak: undefined, lyric: "" };
    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: "custom",
      candidateName: "직접 다듬은 가락",
      notes: (measure.notes ?? []).flatMap((item) => item.id === selectedNoteId ? [first, second] : [item])
    }));
    setSelectedNoteId(first.id);
    setSelectedNoteIds([first.id, second.id]);
    setEditStatus(note.pitch === null ? "같은 길이의 쉼표 두 개로 쪼갰어요." : "같은 높이의 음표 두 개로 쪼갰어요.");
  }

  function lengthenSelectedNote() {
    if (!selectedNoteId || !activeMeasure.notes || selectedNoteIds.length !== 1) return;
    updateActiveMeasure((measure) => ({
      ...measure, candidateId: "custom", candidateName: "직접 다듬은 가락",
      notes: replaceNote(measure.notes ?? [], selectedNoteId, (note) => ({
        ...note, duration: rational(note.duration.numerator * 2, note.duration.denominator)
      }))
    }));
  }

  function dotSelectedNote() {
    if (!selectedNoteId || !activeMeasure.notes || selectedNoteIds.length !== 1 || selectedNote?.dotted) return;
    updateActiveMeasure((measure) => ({
      ...measure, candidateId: "custom", candidateName: "직접 다듬은 가락",
      notes: replaceNote(measure.notes ?? [], selectedNoteId, (note) => ({
        ...note, duration: rational(note.duration.numerator * 3, note.duration.denominator * 2), dotted: true
      }))
    }));
    setEditStatus("음표 길이의 절반만큼 점을 붙였어요.");
  }

  function beamSelectedNotes() {
    if (!activeMeasure.notes || selectedNoteIds.length < 2) {
      setEditStatus("여러 음 선택을 켜고 묶을 음표를 골라 주세요.");
      return;
    }
    const indexes = selectedNoteIds.map((id) => activeNotes.findIndex((note) => note.id === id)).sort((a, b) => a - b);
    const consecutive = indexes.every((index, position) => position === 0 || index === indexes[position - 1] + 1);
    const beamable = selectedNotes.every((note) => note.pitch !== null && toNumber(note.duration) <= 0.5);
    if (!consecutive || !beamable) {
      setEditStatus("서로 붙어 있는 8분음표나 16분음표만 이을 수 있어요.");
      return;
    }
    const beamGroup = `beam-${Date.now()}-${++splitCounter.current}`;
    updateActiveMeasure((measure) => ({
      ...measure, candidateId: "custom", candidateName: "직접 다듬은 가락",
      notes: (measure.notes ?? []).map((note) => selectedNoteIds.includes(note.id)
        ? { ...note, beamGroup, beamBreak: undefined }
        : note)
    }));
    setEditStatus(`${selectedNoteIds.length}개의 짧은 음표 기둥을 한 줄로 묶었어요.`);
  }

  function unbeamSelectedNotes() {
    if (!activeMeasure.notes || selectedNoteIds.length === 0) {
      setEditStatus("분리할 음표를 먼저 골라 주세요.");
      return;
    }
    const separable = selectedNotes.filter((note) => note.pitch !== null && toNumber(note.duration) <= 0.5);
    if (separable.length === 0) {
      setEditStatus("기둥으로 연결된 8분음표나 16분음표를 골라 주세요.");
      return;
    }
    const selectedGroups = new Set(separable.flatMap((note) => note.beamGroup ? [note.beamGroup] : []));
    const selectedIdSet = new Set(selectedNoteIds);
    updateActiveMeasure((measure) => ({
      ...measure, candidateId: "custom", candidateName: "직접 다듬은 가락",
      notes: (measure.notes ?? []).map((note) =>
        selectedIdSet.has(note.id) || (note.beamGroup && selectedGroups.has(note.beamGroup))
          ? { ...note, beamGroup: undefined, beamBreak: note.pitch !== null && toNumber(note.duration) <= 0.5 ? true : note.beamBreak }
          : note)
    }));
    setEditStatus(`${separable.length}개의 짧은 음표를 따로 보이게 분리했어요.`);
  }

  function linkSelectedNotes() {
    if (!activeMeasure.notes || selectedNoteIds.length !== 2) {
      setEditStatus("붙임줄/이음줄은 이웃한 음표 두 개를 골라서 만들 수 있어요.");
      return;
    }
    const indexes = selectedNoteIds
      .map((id) => activeNotes.findIndex((note) => note.id === id))
      .sort((a, b) => a - b);
    const [firstIndex, secondIndex] = indexes;
    const first = activeNotes[firstIndex];
    const second = activeNotes[secondIndex];
    if (firstIndex < 0 || secondIndex < 0 || secondIndex !== firstIndex + 1 || !first || !second) {
      setEditStatus("바로 옆에 붙어 있는 음표 두 개를 골라 주세요.");
      return;
    }
    if (first.pitch === null || second.pitch === null) {
      setEditStatus("쉼표는 붙임줄이나 이음줄로 이을 수 없어요.");
      return;
    }
    const removing = first.linkToNext === true;
    updateActiveMeasure((measure) => ({
      ...measure, candidateId: "custom", candidateName: "직접 다듬은 가락",
      notes: sanitizeNoteLinks((measure.notes ?? []).map((note) => note.id === first.id
        ? { ...note, linkToNext: removing ? undefined : true }
        : note))
    }));
    if (removing) {
      setEditStatus("음표 사이의 줄을 지웠어요.");
    } else {
      setEditStatus(first.pitch === second.pitch
        ? "같은 높이의 두 음을 붙임줄로 이었어요. 한 음처럼 길게 이어져요."
        : "다른 높이의 두 음을 이음줄로 이었어요. 부드럽게 이어 불러요.");
    }
  }

  function addRestNote() {
    if (!activeMeasure.notes) return;
    const token = ++splitCounter.current;
    const rest: NoteEvent = {
      id: `rest-${activeIndex + 1}-${token}`,
      pitch: null,
      duration: rational(1)
    };
    const selectedIndexes = selectedNoteIds
      .map((id) => activeNotes.findIndex((note) => note.id === id))
      .filter((index) => index >= 0);
    const insertAt = selectedIndexes.length > 0 ? Math.max(...selectedIndexes) + 1 : activeNotes.length;
    const next = sanitizeNoteLinks([...activeNotes.slice(0, insertAt), rest, ...activeNotes.slice(insertAt)]);
    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: "custom",
      candidateName: "직접 다듬은 가락",
      notes: next
    }));
    setSelectedNoteId(rest.id);
    setSelectedNoteIds([rest.id]);
    setEditStatus("한 박자짜리 쉼표를 추가했어요. 박자가 넘치면 아래 경고가 알려줘요.");
  }

  function addMelodyNote() {
    if (!activeMeasure.notes) return;
    const remaining = capacity - usedBeats;
    const beats = remaining >= 1 ? 1 : remaining >= .5 ? .5 : remaining >= .25 ? .25 : 0;
    if (beats === 0) {
      setEditStatus("이 마디는 이미 가득 찼어요. 음표를 줄이거나 지운 뒤 새 음표를 넣어 보세요.");
      return;
    }
    const token = ++splitCounter.current;
    const source = selectedNotes.find((note) => note.pitch !== null) ?? activeNotes.find((note) => note.pitch !== null);
    const note: NoteEvent = {
      id: `note-${activeIndex + 1}-${token}`,
      pitch: source?.pitch ?? 60,
      duration: rationalFromBeats(beats)
    };
    const selectedIndexes = selectedNoteIds
      .map((id) => activeNotes.findIndex((item) => item.id === id))
      .filter((index) => index >= 0);
    const insertAt = selectedIndexes.length > 0 ? Math.max(...selectedIndexes) + 1 : activeNotes.length;
    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: "custom",
      candidateName: "직접 다듬은 가락",
      notes: sanitizeNoteLinks([...(measure.notes ?? []).slice(0, insertAt), note, ...(measure.notes ?? []).slice(insertAt)])
    }));
    setSelectedNoteId(note.id);
    setSelectedNoteIds([note.id]);
    setEditStatus("새 음표를 넣었어요. 위·아래로 움직여 음높이를 골라 보세요.");
  }

  function copySelectedNotes() {
    if (!activeMeasure.notes || selectedNoteIds.length === 0) return;
    const selectedIdSet = new Set(selectedNoteIds);
    const selectedIndexes = activeNotes
      .map((note, index) => selectedIdSet.has(note.id) ? index : -1)
      .filter((index) => index >= 0);
    if (selectedIndexes.length === 0) return;

    const token = ++splitCounter.current;
    const copiedBeamGroups = new Map<string, string>();
    const copies = selectedIndexes.map((noteIndex, copyIndex) => {
      const note = activeNotes[noteIndex];
      let beamGroup: string | undefined;
      if (note.beamGroup) {
        beamGroup = copiedBeamGroups.get(note.beamGroup);
        if (!beamGroup) {
          beamGroup = `beam-copy-${token}-${copiedBeamGroups.size + 1}`;
          copiedBeamGroups.set(note.beamGroup, beamGroup);
        }
      }
      return {
        ...note,
        id: `${note.id}-copy-${token}-${copyIndex + 1}`,
        beamGroup,
        linkToNext: undefined
      };
    });
    const insertAt = Math.max(...selectedIndexes) + 1;
    const next = sanitizeNoteLinks([...activeNotes.slice(0, insertAt), ...copies, ...activeNotes.slice(insertAt)]);

    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: "custom",
      candidateName: measure.candidateName,
      notes: next
    }));
    setSelectedNoteId(copies[0]?.id ?? "");
    setSelectedNoteIds(copies.map((note) => note.id));
    setEditStatus(`${copies.length}개의 음표를 바로 뒤에 복사했어요.`);
  }

  function deleteNote() {
    if (!activeMeasure.notes || selectedNoteIds.length === 0 || activeMeasure.notes.length <= selectedNoteIds.length) return;
    const next = sanitizeNoteLinks(activeMeasure.notes.filter((note) => !selectedNoteIds.includes(note.id)));
    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: "custom",
      candidateName: "직접 다듬은 가락",
      notes: next
    }));
    setSelectedNoteId(next[0]?.id ?? "");
    setSelectedNoteIds(next[0] ? [next[0].id] : []);
    setEditStatus("");
  }

  function resetActiveMeasure() {
    const candidate = candidates.find((item) => item.id === activeMeasure.candidateId) ?? candidates[0];
    chooseCandidate(candidate);
  }

  function goNext() {
    const rhythmCheck = validation?.state === "exact" ? "valid" : "invalid";
    setRhythmChecks((current) => ({ ...current, [activeIndex]: rhythmCheck }));
    if (rhythmCheck === "invalid") return;
    if (activeIndex < measures.length - 1) {
      selectMeasure(activeIndex + 1);
    }
  }

  function updateNoteLyric(measureIndex: number, noteId: string, value: string) {
    setMeasures((current) => current.map((measure, index) => index !== measureIndex ? measure : ({
      ...measure,
      notes: (measure.notes ?? []).map((note) => note.id === noteId ? { ...note, lyric: value } : note)
    })));
  }

  function addSoundEffect(effectId: SoundEffectId) {
    updateActiveMeasure((measure) => ({
      ...measure,
      effects: [...measure.effects, {
        id: `effect-${activeIndex + 1}-${effectId}-${Date.now()}-${measure.effects.length + 1}`,
        effectId,
        offsetBeats: Math.min(capacity - 0.25, measure.effects.length * 0.5)
      }]
    }));
  }

  function moveSoundEffect(eventId: string, offsetBeats: number) {
    updateActiveMeasure((measure) => ({
      ...measure,
      effects: measure.effects.map((event) => event.id === eventId ? { ...event, offsetBeats } : event)
    }));
  }

  function removeSoundEffect(eventId: string) {
    updateActiveMeasure((measure) => ({
      ...measure,
      effects: measure.effects.filter((event) => event.id !== eventId)
    }));
  }

  function toggleAccompanimentInstrument(id: InstrumentId) {
    setAccompanimentInstrumentIds((current) => {
      const unique = uniqueAccompanimentInstrumentIds(current);
      if (unique.includes(id)) return unique.filter((instrumentId) => instrumentId !== id);
      if (unique.length >= MAX_ACCOMPANIMENT_INSTRUMENTS) return unique;
      return uniqueAccompanimentInstrumentIds([...unique, id]);
    });
  }

  function openArrangement() {
    workspace.changeView("arrange");
    setShowArrangement(true);
    setCompletionCelebration(true);
    window.setTimeout(() => document.querySelector("#arrangement")?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function preserveViewportAfterButtonClick(event: React.MouseEvent<HTMLElement>) {
    if (!(event.target as Element).closest("button")) return;
    const left = window.scrollX;
    const top = window.scrollY;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (Math.abs(window.scrollX - left) > 1 || Math.abs(window.scrollY - top) > 1) {
        window.scrollTo({ left, top, behavior: "auto" });
      }
    }));
  }

  function keepEditorFocus(event: React.MouseEvent<HTMLElement>) {
    if ((event.target as Element).closest("button")) event.preventDefault();
  }

  function makeSharedComposition(): SharedComposition | null {
    if (!allValid || printableMeasures.length !== songLength) return null;
    const creator = creatorName.trim();
    const title = songTitle.trim();
    if (!creator || !title) return null;
    return {
      version: 1,
      title,
      description: songDescription.trim(),
      creator,
      originalCreator: originalCreator || creator,
      presetId: selectedPresetId,
      meter,
      songLength,
      structureTemplateId: structureTemplateId ?? undefined,
      instrumentId: selectedInstrumentId,
      accompanimentStyleId,
      accompanimentInstrumentIds,
      accompanimentTrackMix,
      beatPattern,
      beatVolume,
      bpm,
      lyrics,
      measures: printableMeasures.map(({ candidateName, notes, chords, keyFifths, effects }) => ({ candidateName, notes, chords, keyFifths, effects }))
    };
  }

  async function createMobileRecordingLink() {
    const composition = makeSharedComposition();
    if (!composition) {
      setShareStatus("스마트폰 녹음 링크를 만들려면 곡 제목과 작곡가 이름을 먼저 적어 주세요.");
      return;
    }
    const url = buildMobileRecordingUrl(buildShareUrl(composition, window.location));
    setMobileRecordingUrl(url);
    setGeneratedShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("스마트폰 녹음 링크를 복사했어요. QR을 스캔해도 바로 열 수 있어요.");
    } catch {
      setShareStatus("아래 링크를 길게 눌러 복사하거나 QR을 스캔해 주세요.");
    }
  }

  async function saveMobileRecordingQr() {
    const svg = mobileRecordingQrRef.current;
    if (!svg) return;

    const source = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("QR image load failed"));
        image.src = svgUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png");
      });
      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = safeSongFileName("png").replace(/\.png$/i, "-스마트폰-녹음-QR.png");
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      setShareStatus("QR 코드 이미지를 저장했어요.");
    } catch (error) {
      console.error(error);
      setShareStatus("QR 코드 이미지를 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  function applyProjectDraft(project: SavedDraft): boolean {
    if (!recoverySafety.current) {
      setShareStatus("이전 그림 기록을 먼저 보관해야 해요. 그림 복구에서 저장 공간을 확인해 주세요.");
      return false;
    }
    projectLoadRequest.current += 1;
    void saveBrowserProjectDraft(currentDraft);
    const projectId = project.projectId ?? crypto.randomUUID();
    project = { ...project, projectId };
    // An old shared-song URL must not take precedence over the project on reload.
    const projectUrl = new URL(window.location.href);
    projectUrl.hash = project.sourceHash;
    try { window.history.replaceState(window.history.state, "", projectUrl); }
    catch { window.location.hash = project.sourceHash; }
    checkpointBrowserProject(project);
    adoptDraftRevision(project);
    setProjectIdentity({ projectId, cloudScoreId: project.cloudScoreId, cloudOwnerId: project.cloudOwnerId });
    const preset = findHarmonyPreset(project.presetId);
    historyCurrent.current = null;
    setUndoStack([]);
    setRedoStack([]);
    setSelectedPresetId(preset.id);
    setMeter(project.meter);
    setSongLength(project.songLength);
    setStructureTemplateId(project.structureTemplateId ?? null);
    setMeasures(compositionFromDraft(project, preset));
    setMusicVideoScenes(project.musicVideoScenes ?? []);
    setRhythmChecks({});
    setSelectedInstrumentId(findInstrument(project.instrumentId).id);
    const nextAccompanimentStyle = findAccompanimentStyle(project.accompanimentStyleId ?? "arpeggio");
    setAccompanimentStyleId(nextAccompanimentStyle.id);
    setAccompanimentInstrumentIds(uniqueAccompanimentInstrumentIds(project.accompanimentInstrumentIds ?? ["piano"]));
    accompanimentMixer.loadTrackMix(project.accompanimentTrackMix);
    loadBeatPattern(project.beatPattern, project.beatVolume, project.meter);
    setBpm(project.bpm ?? 96);
    setShowArrangement(project.showArrangement);
    setSongTitle(project.title);
    setSongDescription(project.description ?? "");
    setCreatorName(project.creator);
    setOriginalCreator(project.originalCreator);
    setSourceHash(project.sourceHash);
    setCloudSavedFingerprint(null);
    setActiveIndex(0);
    setSelectedNoteId("");
    setSelectedNoteIds([]);
    setEditStatus("");
    return true;
  }

  function confirmRecoveryPreserved() {
    recoverySafety.current = true;
    setRecoverySafe(true);
  }

  async function ensureRecoveryPreserved() {
    if (recoverySafety.current) return;
    if (!(await scanLostDrawingRecoveryRecords()).preserved) {
      throw new Error("이전 그림 원본을 보관할 공간이 부족해요. 저장 공간을 확보한 뒤 다시 확인해 주세요.");
    }
    confirmRecoveryPreserved();
  }

  async function restoreLostDrawing(candidate: LostDrawingRecoveryCandidate) {
    if (cloudBusy || cloudAutosave.busy || musicVideoBusy) throw new Error("진행 중인 저장이나 영상 작업이 끝나면 복구해 주세요.");
    await ensureRecoveryPreserved();
    const sourceOwner = candidate.sourceKind === "cloud" ? activeAuthUid.current : undefined;
    const checkAccount = () => {
      if (candidate.sourceKind === "cloud" && (!sourceOwner || activeAuthUid.current !== sourceOwner ||
        !candidate.source.startsWith(`cloud:${sourceOwner}:`))) throw new Error("그림을 보관한 계정이 바뀌었어요. 다시 로그인한 뒤 복구해 주세요.");
    };
    checkAccount();
    // A successful primary checkpoint alone cannot protect the current drawing
    // while replacing it when IndexedDB is unavailable and backup writes fail.
    const currentDrawing = await scanLostDrawingRecoveryRecords([{ value: currentDraft,
      source: `recovery-current:${currentDraft.projectId}`, sourceKind: "archive", currentPointer: false }]);
    if (!currentDrawing.preserved) throw new Error("현재 그림의 별도 보관본을 저장하지 못했어요. 저장 공간을 확보한 뒤 복구해 주세요.");
    checkAccount();
    const preservedCurrent = await saveBrowserProjectDraft(currentDraft);
    if (!preservedCurrent) throw new Error("현재 작품을 보관할 공간이 부족해요. 저장 공간을 확보한 뒤 복구해 주세요.");
    const copy = makeRecoveredDrawingProject(candidate, currentDraft, crypto.randomUUID(), sourceOwner ?? undefined);
    if (!await saveBrowserProjectDraft(copy)) throw new Error("복구 사본을 저장하지 못했어요. 원본 기록은 그대로 남아 있어요.");
    checkAccount();
    applyProjectDraft(copy);
    setRecoverySafe(true);
    setShowOpening(false);
    setAccountLibraryOpen(false);
    workspace.changeView("publish");
    setRecoveredStudioRequest((value) => value + 1);
    setShareStatus("남아 있던 그림을 새 프로젝트 사본으로 복구했어요. 이전 작품도 이 기기에 보관했어요.");
  }

  async function handleGoogleSignIn() {
    setCloudBusy(true);
    setCloudError("");
    setCloudSaveNotice("계정에 저장 중...");
    try {
      const { signInWithGoogle } = await import("./firebase/client");
      await signInWithGoogle();
    } catch (error) {
      console.error(error);
      setCloudError("Google 로그인에 실패했어요. 팝업 차단을 풀고 다시 시도해 주세요.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleEmailAuth(mode: "signin" | "signup", email: string, password: string): Promise<boolean> {
    setCloudBusy(true);
    setCloudError("");
    try {
      const { registerWithEmail, signInWithEmail } = await import("./firebase/client");
      if (mode === "signup") await registerWithEmail(email, password);
      else await signInWithEmail(email, password);
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(firebaseAuthMessage(error, mode));
      return false;
    } finally {
      setCloudBusy(false);
    }
  }

  async function handlePasswordReset(email: string): Promise<boolean> {
    setCloudBusy(true);
    setCloudError("");
    try {
      const { resetEmailPassword } = await import("./firebase/client");
      await resetEmailPassword(email);
      return true;
    } catch (error) {
      console.error(error);
      setCloudError(firebaseAuthMessage(error, "reset"));
      return false;
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleFirebaseSignOut() {
    setCloudBusy(true);
    try {
      const { signOutFirebase } = await import("./firebase/client");
      await signOutFirebase();
      setPublishingScore(null);
      setAccountLibraryOpen(false);
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleCloudSave(asCopy: boolean) {
    if (!authUser) return;
    const draft = { ...currentDraft, updatedAt: Date.now() };
    const draftIssues = findDraftSaveIssues(draft);
    setSaveIssues([]);
    setSaveFailureOpen(false);
    if (draftIssues.length > 0) {
      setCloudError("저장할 수 없는 부분을 확인해 주세요.");
      setSaveIssues(draftIssues);
      setSaveFailureOpen(true);
      return;
    }
    setCloudError("");
    setCloudSaveNotice("계정에 저장 중...");
    try {
      const savedScore = await cloudAutosave.save(asCopy);
      if (savedScore) {
        setCloudSaveNotice("계정 저장 완료 ✓ 다른 기기에서도 볼 수 있어요.");
        setShareStatus(asCopy ? "현재 악보를 새 클라우드 악보로 저장했어요." : "내 악보함에 저장했어요.");
      } else setCloudSaveNotice("브라우저에 보관했어요. 연결되면 프로젝트에 자동 저장해요.");
    } catch (error) {
      console.error(error);
      const issue = cloudSaveIssue(error);
      setCloudError(issue.message);
      setCloudSaveNotice("");
      setSaveIssues([issue]);
      setSaveFailureOpen(true);
    }
  }

  function locateSaveIssue(issue: SaveIssue) {
    setSaveFailureOpen(false);
    setAccountLibraryOpen(false);
    if (issue.measureIndex !== undefined) setActiveIndex(issue.measureIndex);
    if (["title", "creator", "description"].includes(issue.target)) setShowArrangement(true);
    workspace.revealSaveIssue(issue);
  }

  async function handleCloudLoad(score: CloudScore) {
    if (hasUnsavedWork && !window.confirm(`'${score.title}' 악보를 열까요?\n\n${UNSAVED_WORK_WARNING} 먼저 내 악보함에 저장해 주세요.`)) return;
    const request = ++projectLoadRequest.current;
    const project = await recoverCloudProjectDraft(score, authUser?.uid ?? "", currentDraft);
    if (request !== projectLoadRequest.current) return;
    if (!applyProjectDraft(project)) return;
    setCloudSavedFingerprint(draftFingerprint(project) === draftFingerprint(score.draft) ? draftFingerprint(project) : null);
    setAccountLibraryOpen(false);
    setShareStatus(project === score.draft ? "내 악보함에서 작품을 불러왔어요." : "최신 그림을 포함해 프로젝트를 불러왔어요.");
  }

  async function handleBrowserProjectLoad(project: SavedDraft) {
    if (hasUnsavedWork && !window.confirm(`'${project.title || "이름 없는 프로젝트"}' 복구본을 열까요? 현재 그림도 이 기기에 보관됩니다.`)) return;
    const request = ++projectLoadRequest.current;
    const archived = project.projectId ? await readBrowserProject(project.projectId) : null;
    if (request !== projectLoadRequest.current) return;
    if (archived && archived.updatedAt >= project.updatedAt) project = archived;
    if (currentDraft.projectId === project.projectId && currentDraft.updatedAt >= project.updatedAt) project = currentDraft;
    if (!applyProjectDraft(project)) return;
    setAccountLibraryOpen(false);
    setShowOpening(false);
    setShareStatus("이 기기에 자동 보관된 프로젝트와 그림을 불러왔어요.");
  }

  function openPublishedProjectCopy(song: PublishedSong) {
    if (song.access !== "project") return;
    if (hasUnsavedWork && !window.confirm(`'${song.title}' 프로젝트 사본을 열까요?\n\n${UNSAVED_WORK_WARNING} 먼저 내 악보함에 저장해 주세요.`)) return;
    const copyTitle = `${song.title.trim().slice(0, 56) || "제목 없는 노래"} 사본`;
    const copy: SavedDraft = {
      ...JSON.parse(JSON.stringify(song.draft)) as SavedDraft,
      projectId: crypto.randomUUID(), cloudScoreId: undefined, cloudOwnerId: undefined,
      updatedAt: Date.now(),
      sourceHash: "",
      title: copyTitle,
      creator: authUser?.displayName || authUser?.email?.split("@")[0] || "새 작곡가",
      originalCreator: song.draft.originalCreator || song.draft.creator || song.creator
    };
    if (!applyProjectDraft(copy)) return;
    setCommunityAlbumOpen(false);
    setShowOpening(false);
    setShareStatus(`'${song.title}' 프로젝트의 사본을 열었어요. 원본은 바뀌지 않아요.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCloudDelete(score: CloudScoreListItem) {
    if (!authUser || !window.confirm(`'${score.title}' 악보를 내 악보함에서 삭제할까요?`)) return;
    setCloudBusy(true);
    setCloudError("");
    try {
      const { deleteCloudScore } = await import("./firebase/scores");
      await deleteCloudScore(authUser.uid, score.id);
      if (activeCloudScoreId === score.id) {
        cloudAutosave.pause();
        setProjectIdentity((identity) => ({ ...identity, cloudScoreId: undefined, cloudOwnerId: undefined }));
      }
      retryCloudScores();
    } catch (error) {
      console.error(error);
      setCloudError("악보를 삭제하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setCloudBusy(false);
    }
  }

  async function startNewProject() {
    if (hasUnsavedWork && !window.confirm(`새 곡을 시작할까요?\n\n${UNSAVED_WORK_WARNING} 먼저 내 악보함에 저장해 주세요.`)) return;
    projectLoadRequest.current += 1;
    try { await ensureRecoveryPreserved(); }
    catch (error) { setShareStatus(error instanceof Error ? error.message : "이전 그림 기록을 먼저 확인해 주세요."); return; }
    setLeavingProject(true);
    try { await browserSave.flush(); await clearBrowserCurrentProject(); }
    catch { setLeavingProject(false); window.alert("새 곡을 시작하지 못했어요. 기기 저장 공간을 확인해 주세요."); return; }
    skipNextUnloadWarning();
    window.location.assign(`${window.location.pathname}?start=new`);
  }

  function safeSongFileName(extension: string): string {
    const safeTitle = songTitle.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "maeum-melody";
    return `${safeTitle}.${extension}`;
  }

  async function recordSongMp3(guideMode: KaraokeGuideMode = recordingGuideMode,
    captureMode: RecordingCaptureMode = recordingCaptureMode) {
    if (!allValid || printableMeasures.length !== songLength) {
      setRecordingStatus("먼저 모든 마디를 정확한 박자로 완성해 주세요.");
      return;
    }
    if (karaokeRunning) return;
    const abortController = new AbortController();
    karaokeAbortController.current = abortController;
    setKaraokeMode("recording");
    setRecordingSong(true);
    setKaraokeOpen(true);
    setKaraokePhase("intro");
    setKaraokeCount(null);
    setMicrophoneLevel(0);
    setKaraokeHighlight({ section: "intro", measureIndex: null, noteId: null });
    setRecordingStatus("녹음을 준비하고 있어요.");
    setRecordingVideoPlan(null);
    if (recordingDownloadUrl) {
      URL.revokeObjectURL(recordingDownloadUrl);
      setRecordingDownloadUrl("");
    }
    setRecordedAudioBuffer(null);
    setRecordedVocalBuffer(null);
    setRecordedBackingBuffer(null);
    setPreviewBackingVolume(1);
    setMixingPreview(false);
    setPitchReviews([]);
    setReviewPlaybackNoteId(null);
    setAnalyzingPitch(false);
    setPostProcessPreset("natural");
    const playable = measures.flatMap((measure, index) => measure.notes ? [{
      notes: measure.notes,
      harmony: measure.story,
      chords: measure.chords,
      effects: measure.effects,
      measureIndex: index
    }] : []);
    try {
      const result = await recordKaraokeComposition(
        playable, selectedInstrumentId, bpm, currentAccompanimentOptions, {
        guideMelodyMode: guideMode,
        recordingMode: captureMode,
        onStatus: setRecordingStatus,
        onInputLevel: setMicrophoneLevel,
        onPhase: setKaraokePhase,
        onCount: setKaraokeCount,
        onHighlight: setKaraokeHighlight
      }, {
        beats: meter.beats,
        unitBeats: 4 / meter.beatUnit
      }, abortController.signal);
      if (!result) {
        setRecordingStatus("다른 연주가 끝난 뒤에 다시 녹음해 주세요.");
        return;
      }
      const url = URL.createObjectURL(result.blob);
      setRecordingDownloadUrl(url);
      setRecordedAudioBuffer(result.audioBuffer);
      setRecordedVocalBuffer(result.vocalAudioBuffer);
      setRecordedBackingBuffer(result.backingAudioBuffer);
      setRecordingVideoPlan(buildRecordedMusicVideoPlan(songTitle, playable, bpm, selectedInstrumentId, currentAccompanimentOptions, result.introSeconds, result.audioBuffer.duration));
      setAnalyzingPitch(captureMode === "personal");
      // Run after the recording UI has settled so pitch checking never makes
      // the final recording feel slow. This is a gentle review, not a grade.
      if (captureMode === "personal") window.setTimeout(() => {
        try {
          setPitchReviews(reviewRecordedPitch(result.audioBuffer, playable, result.introSeconds, 60 / bpm));
        } finally {
          setAnalyzingPitch(false);
        }
      }, 0);
      setRecordingStatus("녹음이 끝났어요. 미리 들어보고 보정한 뒤 저장해 주세요.");
    } catch (error) {
      if (abortController.signal.aborted) {
        setKaraokePhase("idle");
        setKaraokeCount(null);
        setMicrophoneLevel(0);
        setKaraokeHighlight({ section: "intro", measureIndex: null, noteId: null });
        setRecordingStatus("녹음을 중단했어요. 마이크를 끄고 파일은 만들지 않았어요.");
        return;
      }
      console.error(error);
      setKaraokePhase("error");
      setRecordingStatus(error instanceof Error ? error.message : "녹음 중 문제가 생겼어요. 마이크 권한을 확인해 주세요.");
    } finally {
      if (karaokeAbortController.current === abortController) karaokeAbortController.current = null;
      setRecordingSong(false);
    }
  }

  async function practiceSong() {
    if (!allValid || printableMeasures.length !== songLength) {
      setRecordingStatus("먼저 모든 마디를 정확한 박자로 완성해 주세요.");
      return;
    }
    if (karaokeRunning) return;
    const abortController = new AbortController();
    karaokeAbortController.current = abortController;
    setKaraokeMode("practice");
    setPracticingSong(true);
    setKaraokeOpen(true);
    setKaraokePhase("intro");
    setKaraokeCount(null);
    setMicrophoneLevel(0);
    setReviewPlaybackNoteId(null);
    setKaraokeHighlight({ section: "intro", measureIndex: null, noteId: null });
    setRecordingStatus("연습 반주와 메인 가락을 준비하고 있어요.");
    const playable = measures.flatMap((measure, index) => measure.notes ? [{
      notes: measure.notes,
      harmony: measure.story,
      chords: measure.chords,
      effects: measure.effects,
      measureIndex: index
    }] : []);
    try {
      const duration = await practiceKaraokeComposition(
        playable, selectedInstrumentId, bpm, currentAccompanimentOptions, {
        onStatus: setRecordingStatus,
        onPhase: setKaraokePhase,
        onCount: setKaraokeCount,
        onHighlight: setKaraokeHighlight
      }, {
        beats: meter.beats,
        unitBeats: 4 / meter.beatUnit
      }, abortController.signal);
      if (duration === null && !abortController.signal.aborted) {
        setKaraokePhase("error");
        setRecordingStatus("다른 연주가 끝난 뒤에 다시 연습해 주세요.");
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        setKaraokePhase("idle");
        setKaraokeCount(null);
        setKaraokeHighlight({ section: "intro", measureIndex: null, noteId: null });
        setRecordingStatus("노래 연습을 중단했어요. 녹음된 파일은 없어요.");
        return;
      }
      console.error(error);
      setKaraokePhase("error");
      setRecordingStatus(error instanceof Error ? error.message : "연습 재생 중 문제가 생겼어요.");
    } finally {
      if (karaokeAbortController.current === abortController) karaokeAbortController.current = null;
      setPracticingSong(false);
    }
  }

  function closeKaraokeWindow() {
    if (karaokeRunning) {
      if (practicingSong) setRecordingStatus("노래 연습을 중단하는 중이에요.");
      else setRecordingStatus("녹음을 중단하고 마이크를 끄는 중이에요.");
      karaokeAbortController.current?.abort();
    }
    setKaraokeOpen(false);
  }

  async function applyPostProcessPreset(preset: KaraokePostProcessPreset) {
    if (!recordedAudioBuffer || processingRecording) return;
    setProcessingRecording(true);
    setPostProcessPreset(preset);
    setRecordingStatus("선택한 느낌으로 보정하는 중이에요.");
    try {
      const blob = await renderProcessedKaraokeMp3(recordedAudioBuffer, preset);
      if (recordingDownloadUrl) URL.revokeObjectURL(recordingDownloadUrl);
      setRecordingDownloadUrl(URL.createObjectURL(blob));
      setRecordingStatus("보정이 끝났어요. 미리듣기 후 저장할 수 있어요.");
    } catch (error) {
      console.error(error);
      setRecordingStatus("보정 중 문제가 생겼어요. 다른 느낌을 선택해 보세요.");
    } finally {
      setProcessingRecording(false);
    }
  }

  async function updatePreviewBackingVolume(nextVolume: number) {
    setPreviewBackingVolume(nextVolume);
    if (!recordedVocalBuffer || !recordedBackingBuffer) return;
    const request = backingMixRequest.current + 1;
    backingMixRequest.current = request;
    setMixingPreview(true);
    try {
      const mix = await renderKaraokePreviewMix(recordedVocalBuffer, recordedBackingBuffer, nextVolume);
      if (request !== backingMixRequest.current) return;
      if (recordingDownloadUrl) URL.revokeObjectURL(recordingDownloadUrl);
      setRecordedAudioBuffer(mix.audioBuffer);
      setRecordingDownloadUrl(URL.createObjectURL(mix.blob));
      setRecordingStatus("반주 크기를 바꿔서 다시 들을 수 있어요.");
    } catch (error) {
      console.error(error);
      setRecordingStatus("반주 크기를 바꾸는 중 문제가 생겼어요. 다시 움직여 보세요.");
    } finally {
      if (request === backingMixRequest.current) setMixingPreview(false);
    }
  }

  function saveProcessedRecording() {
    if (exportingBacking) return;
    recordingPreviewRef.current?.pause();
    recordingFileExport.show();
  }

  function karaokePhaseLabel(): string {
    if (karaokePhase === "intro") return "인트로 4마디";
    if (karaokePhase === "song") return karaokeMode === "practice" ? "가락 연습 중" : "노래 녹음 중";
    if (karaokePhase === "outro") return "아웃트로 4마디";
    if (karaokePhase === "encoding") return karaokeMode === "practice" ? "연습 마무리" : "MP3 만드는 중";
    if (karaokePhase === "done") return karaokeMode === "practice" ? "연습 완료" : "녹음 완료";
    if (karaokePhase === "error") return karaokeMode === "practice" ? "연습 확인 필요" : "녹음 확인 필요";
    return karaokeMode === "practice" ? "연습 준비" : "녹음 준비";
  }

  if (qrPlaybackMode) return <QrSongPlayback composition={incomingShare} songId={qrSongId} />;

  function openPractice() {
    void stopPlayback();
    resetPlaybackUi();
    clearNoteAnimationTimers();
    setPresetPreviewing(false);
    setBeatPreviewing(false);
    setPlayingMeasure(false);
    setPlayingId(null);
    setShowAppMenu(false);
    setPracticeOpen(true);
  }

  if (practiceOpen) return <PracticeMode onClose={() => setPracticeOpen(false)} />;

  return (
    <div className="app-shell">
      {showOpening && <OpeningScreen hasDraft={Boolean(resumableDraft)} onStart={startNewProject}
        onContinue={() => setShowOpening(false)} onPractice={openPractice} />}
      {!mobileRecordMode && <header className="topbar" inert={showOpening} aria-hidden={showOpening}>
        <div className="brand-menu-wrap">
          <a className="brand" href="#" aria-label="마음멜로디 홈">
            <span className="brand-mark"><Music2 size={23} strokeWidth={2.4} /></span>
            <span>마음멜로디</span>
          </a>
          <div className="app-menu">
            <button type="button" className="app-menu-trigger" aria-label="메뉴 열기"
              aria-expanded={showAppMenu} onClick={() => setShowAppMenu((open) => !open)}>
              <Menu size={19} />
            </button>
            {showAppMenu && <div className="app-menu-panel" role="menu">
              <button type="button" role="menuitem" onClick={startNewProject}><WandSparkles size={16} /> 새로 시작하기</button>
              <button type="button" role="menuitem" onClick={() => { setShowAppMenu(false); void lostDrawingRecovery.scan(); }}>
                <FileDown size={16} /> 사라진 그림 찾기</button>
              <button type="button" role="menuitem" disabled={isAnyPlaying || exportingBacking || exportingPdf || processingRecording}
                onClick={openPractice}><Music2 size={16} /> 기능 연습하기</button>
              <button type="button" role="menuitem" onClick={() => {
                setShowAppMenu(false);
                setCommunityAlbumOpen(true);
              }}><Library size={16} /> 모두의 앨범</button>
            </div>}
          </div>
        </div>
        <div className="project-title">
          <span className="eyebrow">나의 첫 번째 노래</span>
          <strong>{selectedPreset.childName} · {songLength}마디</strong>
        </div>
        <div className="topbar-actions">
          <div className={localSaveFailed ? "save-button failed" : "save-button"} role="status" aria-live="polite" data-testid="save-status">{saveStatus}</div>
          <span className={`topbar-cloud-status${cloudSaveIsCurrent ? " saved" : cloudSaveFailed ? " failed" : ""}`}>{cloudSaveLabel}</span>
          <button type="button" className={authUser ? "account-trigger signed-in" : "account-trigger"}
            data-testid="account-library-button" onClick={() => setAccountLibraryOpen(true)}>
            {authUser?.photoURL
              ? <img src={authUser.photoURL} alt="" referrerPolicy="no-referrer" />
              : <UserRound size={18} aria-hidden="true" />}
            <span>{authUser ? "내 악보함" : firebaseConfigured ? "로그인" : "계정 연결"}</span>
          </button>
        </div>
      </header>}

      {accountLibraryOpen && !mobileRecordMode && (
        <AccountLibrary configured={firebaseConfigured} user={authUser} authReady={authReady}
          scores={cloudScores} listStatus={cloudListStatus} onRetryList={retryCloudScores}
          busy={cloudBusy || cloudAutosave.busy} error={cloudError || cloudAutosave.error} saveNotice={cloudSaveNotice || cloudAutosave.status}
          currentScoreId={activeCloudScoreId} onClose={() => setAccountLibraryOpen(false)}
          onGoogleSignIn={() => void handleGoogleSignIn()} onEmailAuth={handleEmailAuth}
          onPasswordReset={handlePasswordReset} onClearError={() => setCloudError("")}
          onSignOut={() => void handleFirebaseSignOut()}
          onSave={(asCopy) => void handleCloudSave(asCopy)} onLoad={handleCloudLoad} onLoadLocal={handleBrowserProjectLoad}
          onPublish={(score) => { setPublishingScore(score); setAccountLibraryOpen(false); }}
          onDelete={(score) => void handleCloudDelete(score)} onFindLostDrawings={() => void lostDrawingRecovery.scan()} />
      )}

      {lostDrawingRecovery.open && <LostDrawingRecoveryDialog {...lostDrawingRecovery}
        onRestore={(candidate) => void lostDrawingRecovery.restore(candidate)} onDismiss={() => void lostDrawingRecovery.dismiss()}
        onClose={lostDrawingRecovery.close} onScan={() => void lostDrawingRecovery.scan()} />}
      {saveFailureOpen && <SaveFailureDialog issues={saveIssues} onClose={() => setSaveFailureOpen(false)} onLocate={locateSaveIssue} />}
      {scorePdf.recoveryOpen && <ScoreExportRecoveryDialog onSave={browserSave.flush}
        onBeforeRefresh={skipNextUnloadWarning} onClose={scorePdf.closeRecovery}
        recording={recordingDownloadUrl ? { url: recordingDownloadUrl, fileName: safeSongFileName("mp3") } : undefined} />}

      {communityAlbumOpen && !mobileRecordMode && (
        <CommunityAlbum configured={firebaseConfigured} user={authUser}
          onClose={() => setCommunityAlbumOpen(false)}
          onRequestLogin={() => { setCommunityAlbumOpen(false); setAccountLibraryOpen(true); }}
          onPlay={publishedSongPlayback.play} onStop={publishedSongPlayback.stop}
          playbackStore={publishedSongPlayback.store} onOpenProject={openPublishedProjectCopy} />
      )}

      {publishingScore && authUser && !mobileRecordMode && (
        <PublishScoreDialog user={authUser} score={publishingScore} onClose={() => {
          setPublishingScore(null);
          setAccountLibraryOpen(true);
        }}
          onPublished={(album) => {
            setPublishingScore(null);
            setAccountLibraryOpen(true);
            setShareStatus(`'${publishingScore.title}'을 '${album.name}' 앨범에 공개했어요.`);
          }} />
      )}

      {exportingBacking && !mobileRecordMode && <CompositionMediaExportDialog media={compositionMediaExport} />}

      {karaokeOpen && (
        <div className="karaoke-overlay" role="dialog" aria-modal="true"
          aria-label={karaokeMode === "practice" ? "노래 연습 창" : "노래 녹음 창"}>
          <section className={`karaoke-window ${karaokeMode}`}>
            <div className="karaoke-toolbar">
              <div>
                <span className={`karaoke-phase ${karaokePhase}`}>{karaokePhaseLabel()}</span>
                <h2>{songTitle || "나의 노래"}</h2>
                {recordingStatus && <p role="status">{recordingStatus}</p>}
                {karaokeMode === "recording" ? (
                  <>
                    <div className="microphone-level" aria-label="마이크 입력 크기">
                      <span>마이크</span>
                      <i><b style={{ width: `${Math.round(microphoneLevel * 100)}%` }} /></i>
                      <em>{microphoneLevel < .12 ? "조금 더 가까이" : microphoneLevel > .86 ? "조금만 멀리" : "좋아요"}</em>
                    </div>
                    <div className="recording-tips" aria-label="녹음 도움말">
                      {recordingCaptureMode === "choir" ? <>
                        <span><Users size={18} /> 모두 함께 불러요</span><span><Mic2 size={18} /> 마이크는 앞 가운데</span><span><Volume2 size={18} /> 스피커와 마이크는 떨어뜨려요</span>
                      </> : <>
                        <span><Headphones size={18} /> 이어폰을 써요</span><span><Mic2 size={18} /> 입에서 10~15cm</span><span><VolumeX size={18} /> 조용한 곳에서</span>
                      </>}
                    </div>
                  </>
                ) : (
                  <div className="practice-tips" aria-label="노래 연습 도움말">
                    <span>🔒 마이크·녹음 사용 안 함</span>
                  </div>
                )}
              </div>
              <button type="button" className={karaokeRunning ? "karaoke-force-stop" : "karaoke-close"}
                data-testid={recordingSong ? "force-stop-recording" : practicingSong ? "stop-song-practice" : "close-karaoke"}
                aria-label={recordingSong ? "녹음 강제 종료" : practicingSong ? "노래 연습 종료" : "카라오케 창 닫기"}
                onClick={closeKaraokeWindow}>
                {recordingSong ? <><Square size={17} /> 녹음 끝내기</>
                  : practicingSong ? <><Square size={17} /> 연습 끝내기</> : "닫기"}
              </button>
            </div>

            <div className="karaoke-score" data-testid="karaoke-score-window">
              {karaokeCount !== null && <div className="karaoke-count">{karaokeCount}</div>}
              <div className={karaokePhase === "intro" ? "karaoke-system active" : "karaoke-system"}
                data-karaoke-section-panel="intro">
                <div className="karaoke-system-label">인트로 반주 4마디</div>
                <div className="karaoke-measure-row">
                  {karaokeIntroMeasures.map((measure, index) => (
                    <div key={`intro-${index}`} className="karaoke-backing-measure" tabIndex={-1}
                      data-karaoke-section="intro" data-karaoke-measure-index={index}>
                      <span>{index + 1}마디</span>
                      <em>{measure.chords.join(" · ")}</em>
                      <ScoreMeasure notes={backingDisplayNotes(measure, meter, accompanimentStyleId, "intro", index)}
                        meter={meter} compact systemMeasure showSignature={index === 0}
                        playingNoteId={karaokeHighlight.section === "intro" && karaokeHighlight.measureIndex === index
                          ? karaokeHighlight.noteId : null} />
                    </div>
                  ))}
                </div>
              </div>

              <div className={karaokePhase === "song" ? "karaoke-system active" : "karaoke-system"}
                data-karaoke-section-panel="song">
                <div className="karaoke-system-label">
                  가락
                </div>
                {Array.from({ length: Math.ceil(measures.length / 4) }, (_, rowIndex) => (
                  <div key={`song-row-${rowIndex}`} className="karaoke-measure-row">
                    {measures.slice(rowIndex * 4, rowIndex * 4 + 4).map((measure, columnIndex) => {
                      const measureIndex = rowIndex * 4 + columnIndex;
                      const active = karaokeHighlight.section === "song" && karaokeHighlight.measureIndex === measureIndex;
                      return (
                        <div key={`song-${measureIndex}`} className={active ? "karaoke-song-measure active" : "karaoke-song-measure"}
                          tabIndex={-1} data-karaoke-section="song" data-karaoke-measure-index={measureIndex}>
                          <span>{measureIndex + 1}마디</span>
                          <em>{measure.chords.join(" · ")}</em>
                          <ScoreMeasure notes={measure.notes ?? []} meter={meter} keyFifths={measure.keyFifths} compact systemMeasure
                            showSignature={columnIndex === 0}
                            onNoteLayout={(positions) => updateKaraokeLyricNotePositions(measureIndex, positions)}
                            playingNoteId={reviewPlaybackNoteId ?? (active ? karaokeHighlight.noteId : null)}
                            reviewIssueNoteIds={pitchReviewByMeasure.filter((review) => review.measureIndex === measureIndex)
                              .map((review) => review.noteId)} />
                          <NoteLyrics notes={measure.notes ?? []} meter={meter} measureIndex={measureIndex} compact
                            showSignature={columnIndex === 0}
                            notePositions={karaokeLyricNotePositions[measureIndex]}
                            playingNoteId={active ? karaokeHighlight.noteId : null}
                            readOnly onChange={() => undefined} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className={karaokePhase === "outro" ? "karaoke-system active" : "karaoke-system"}
                data-karaoke-section-panel="outro">
                <div className="karaoke-system-label">아웃트로 반주 4마디</div>
                <div className="karaoke-measure-row">
                  {karaokeOutroMeasures.map((measure, index) => (
                    <div key={`outro-${index}`} className="karaoke-backing-measure" tabIndex={-1}
                      data-karaoke-section="outro" data-karaoke-measure-index={index}>
                      <span>{index + 1}마디</span>
                      <em>{measure.chords.join(" · ")}</em>
                      <ScoreMeasure notes={backingDisplayNotes(measure, meter, accompanimentStyleId, "outro", index)}
                        meter={meter} compact systemMeasure showSignature={index === 0}
                        playingNoteId={karaokeHighlight.section === "outro" && karaokeHighlight.measureIndex === index
                          ? karaokeHighlight.noteId : null} />
                      {karaokeMode === "recording" && <small>반주가 끝나면 자동 저장</small>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {karaokeMode === "recording" && recordingDownloadUrl && (
              <div className="karaoke-post-panel">
                <h3>녹음 미리듣기와 보정</h3>
                <audio ref={recordingPreviewRef} key={recordingDownloadUrl} controls src={recordingDownloadUrl}
                  onTimeUpdate={(event) => {
                    const now = event.currentTarget.currentTime;
                    setReviewPlaybackNoteId(pitchReviews.find((review) => now >= review.startSeconds && now < review.endSeconds)?.noteId ?? null);
                  }}
                  onEnded={() => setReviewPlaybackNoteId(null)} />
                <p className="local-preview-note">녹음 파일은 이 브라우저에만 임시 저장돼요.</p>
                <label className="backing-preview-volume">
                  <span><strong>미리듣기 반주 크기</strong><b>{Math.round(previewBackingVolume * 100)}%</b></span>
                  <input type="range" min="0.05" max="1.5" step="0.05" value={previewBackingVolume}
                    disabled={!recordedVocalBuffer || !recordedBackingBuffer || mixingPreview || recordingFileExport.busy}
                    onChange={(event) => void updatePreviewBackingVolume(Number(event.target.value))} />
                  {mixingPreview && <small role="status">반주 크기 조절 중...</small>}
                </label>
                <section className="pitch-review" aria-live="polite">
                  <div>
                    <strong>{recordingCaptureMode === "choir" ? "합창 녹음" : "가락 맞춰 보기"}</strong>
                    <span>{recordingCaptureMode === "choir" ? "여러 목소리가 함께 나와 개인 음정 검사는 하지 않아요."
                      : analyzingPitch ? "내 노래의 음높이를 살펴보고 있어요..." : "빨간 음표는 목표 음과 차이가 컸던 곳이에요."}</span>
                  </div>
                  {!analyzingPitch && pitchReviewByMeasure.length === 0 && (
                    <p>{recordingCaptureMode === "choir" ? "미리듣기로 목소리와 반주의 크기를 확인해 보세요."
                      : "크게 벗어난 음을 찾지 못했어요. 소리가 작았던 곳은 다음에 한 번 더 들어 보세요."}</p>
                  )}
                  <div className="pitch-review-list">
                    {pitchReviewByMeasure.map((review) => (
                      <button key={review.measureIndex} type="button" onClick={() => {
                        const preview = recordingPreviewRef.current;
                        if (!preview) return;
                        preview.currentTime = review.startSeconds;
                        void preview.play();
                      }}>
                        {review.measureIndex + 1}마디 · {review.cents! > 0 ? "조금 높게" : "조금 낮게"} 불렀어요
                      </button>
                    ))}
                  </div>
                </section>
                <div className="post-preset-buttons" aria-label="녹음 보정 선택">
                  {[
                    ["natural", "자연스럽게"],
                    ["clear", "더 또렷하게"],
                    ["soft", "더 부드럽게"],
                    ["loud", "더 크게"],
                    ["singer", "가수처럼 울림"]
                  ].map(([id, label]) => (
                    <button key={id} type="button"
                      className={postProcessPreset === id ? "active" : ""}
                      disabled={processingRecording || recordingFileExport.busy}
                      onClick={() => void applyPostProcessPreset(id as KaraokePostProcessPreset)}>
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" className="karaoke-download" disabled={mediaExportBusy || exportingBacking}
                  onClick={saveProcessedRecording}>
                  {processingRecording ? "보정 중..." : "이 느낌으로 파일 저장"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {recordingGuidePromptOpen && (
        <RecordingGuideDialog value={recordingGuideMode} onChange={setRecordingGuideMode}
          onCancel={() => setRecordingGuidePromptOpen(false)} onStart={(captureMode, guideMode) => {
            setRecordingCaptureMode(captureMode); setRecordingGuideMode(guideMode);
            setRecordingGuidePromptOpen(false); void recordSongMp3(guideMode, captureMode);
          }} />
      )}

      {recordingFileExport.open && <RecordingSaveDialog scenes={musicVideoScenes}
        videoUnavailableReason={recordingFileExport.videoUnavailableReason} busy={recordingFileExport.busy}
        progress={recordingFileExport.progress} status={recordingFileExport.status}
        onSaveMp3={recordingFileExport.saveMp3} onSaveMp4={() => void recordingFileExport.saveMp4()}
        onClose={recordingFileExport.close} onCancel={recordingFileExport.cancel} />}

      {soundEffectDialogOpen && activeMeasure.notes && (
        <MeasureSoundEffectDialog measureIndex={activeIndex} notes={activeMeasure.notes} meter={meter}
          capacity={capacity} events={activeMeasure.effects} playing={playingMeasure}
          onPlay={() => void playActiveMeasure()} onAdd={addSoundEffect} onMove={moveSoundEffect}
          onRemove={removeSoundEffect} onClose={() => setSoundEffectDialogOpen(false)} />
      )}

      {mobileRecordMode && (
        <main className="mobile-record-main">
          <section className="mobile-record-panel" aria-label="스마트폰 녹음 전용 화면">
            <span className="mobile-record-kicker"><Smartphone size={18} /> 스마트폰 녹음</span>
            <h1>{songTitle || "나의 노래"}</h1>
            <p>이어폰을 사용하면 반주가 마이크에 들어가는 소리를 줄일 수 있어요.</p>
            <div className="mobile-record-summary">
              <span>{songLength}마디</span>
              <span>{meterKey(meter)}</span>
              <span>{bpm} BPM</span>
              <span>{selectedInstrument.name}</span>
            </div>
            {!incomingShare && (
              <p className="mobile-record-warning">
                곡 정보가 없는 녹음 주소예요. 데스크탑 작업 화면에서 스마트폰 녹음 링크를 다시 만들어 주세요.
              </p>
            )}
            {isLocalHost(window.location) && (
              <p className="mobile-record-warning">
                이 주소는 localhost라서 스마트폰에서 데스크탑 앱에 접근하지 못할 수 있어요. 배포된 HTTPS 주소에서 만든 QR을 쓰면 가장 안정적입니다.
              </p>
            )}
            <button type="button" className="mobile-record-start action-button" disabled={mediaExportBusy || exportingBacking || !allValid}
              onClick={() => setRecordingGuidePromptOpen(true)}>
              <Mic2 size={24} /> {recordingSong ? "녹음 중..." : "녹음 시작"}
            </button>
            {recordingStatus && <p className="mobile-record-status" role="status">{recordingStatus}</p>}
            {recordingDownloadUrl && (
              <><button type="button" className="mobile-record-save action-button" disabled={mediaExportBusy || exportingBacking}
                onClick={saveProcessedRecording}>
                녹음 파일 저장
              </button>
              </>
            )}
          </section>
        </main>
      )}

      {!mobileRecordMode && <main className="composer-studio" inert={showOpening} aria-hidden={showOpening}>
        {!recoverySafe && <div className="recovery-storage-warning" role="alert">
          이전 그림 기록을 보관할 공간이 부족해 자동 저장을 잠시 멈췄어요. 저장 공간을 확보한 뒤 다시 확인해 주세요.
          <button type="button" onClick={() => void lostDrawingRecovery.scan()}>그림 기록 확인</button>
        </div>}
        <ComposerSettings summary={`${songLength}마디 · ${meterKey(meter)}박자 · ${bpm} BPM`}>
        <SongMoodSetup bpm={bpm} rhythmStyleId={accompanimentStyleId} disabled={isAnyPlaying}
          onTempoChange={setBpm} onRhythmChange={setAccompanimentStyleId} />

        <HarmonyPresetChooser preset={selectedPreset} meter={meter}
          bpm={bpm} accompanimentStyleId={accompanimentStyleId}
          disabled={isAnyPlaying} playing={presetPreviewing}
          onPlayingChange={setPresetPreviewing} onSelect={choosePreset}
          baseDraft={currentDraft} onImportScore={applyProjectDraft} />

        <ComposerMeterChooser meter={meter} onSelect={chooseMeter} />

        <SongLengthChooser length={songLength} onSelect={chooseLength} />

        <SongStructureChooser length={songLength} selectedId={structureTemplateId} onSelect={chooseStructure} />
        </ComposerSettings>

        <ComposerWorkspaceTabs value={workspace.view} onChange={workspace.changeView} arrangementAvailable={showArrangement} />
        <ComposerPlaybackControls bpm={bpm} onTempoChange={setBpm} songLength={songLength} completedCount={completedCount}
          tempoDisabled={isAnyPlaying} canStart={completedCount > 0 && !isAnyPlaying}
          canToggle={completedCount > 0 && playingId === null && !playingMeasure && (songPlaybackState !== "idle" || Boolean(activeMeasure.notes))}
          state={songPlaybackState} playingIndex={playingMeasureIndex} canStop={playingSong}
          onStart={() => void playWholeSong(0)} onToggle={() => toggleWholeSong()} onStop={() => void stopWholeSong()} />
        {workspace.view !== "publish" && (recordingStatus || shareStatus) &&
          <p className="workspace-activity" role="status">{recordingStatus || shareStatus}</p>}
        <ComposerWorkspacePanel view="melody" active={workspace.view}>
        <ComposerMeasureNavigator measures={measures} activeIndex={activeIndex} meter={meter}
          playingIndex={playingMeasureIndex} onSelect={selectMeasure} />
        <div className="composition-workspace">
        <section className="candidate-section candidate-sidebar">
          <ComposerCandidateHeading current={activeIndex + 1} total={songLength} story={activeMeasure.story}>
            <CandidateFeelingTabs
              groups={candidateFeelingGroups.map((group) => ({ ...group, count: group.candidates.length }))}
              activeId={selectedFeelingGroup.id}
              onChange={setActiveMelodyFeeling} />
            {activeIndex > 0 && measures[activeIndex - 1].notes?.some((note) => note.pitch !== null) &&
              <p className="candidate-priority-note">앞마디와 자연스럽게 이어지는 가락부터 보여줘요.</p>}
          </ComposerCandidateHeading>

          <details className="workspace-disclosure preview-instrument-disclosure candidate-instrument-disclosure">
            <summary>가락 악기 <small>{selectedInstrument.name}</small></summary>
            <ComposerInstrumentPicker context="candidate" value={selectedInstrumentId} onChange={setSelectedInstrumentId} />
          </details>

          <div className="candidate-grid" id="melody-feeling-panel" role="tabpanel"
            aria-labelledby={`melody-feeling-${selectedFeelingGroup.id}`}>
            {selectedFeelingGroup.candidates.slice(0, 3).map(renderCandidateCard)}
            {selectedFeelingGroup.candidates.length > 3 && <details className="workspace-disclosure more-candidates" key={selectedFeelingGroup.id}>
              <summary>다른 가락 {selectedFeelingGroup.candidates.length - 3}개 더 보기</summary>
              <div className="candidate-grid">{selectedFeelingGroup.candidates.slice(3).map(renderCandidateCard)}</div>
            </details>}
          </div>
        </section>

          <div className="score-workspace-column score-editor-column">

        <section className="editor-section">
          <div className="editor-copy">
            <div className="editor-copy-text">
              <h2>{activeIndex + 1}마디 편집</h2>
              <details className="editor-help"><summary>편집 도움말</summary>
                <p>위아래로 끌어 음높이를 바꿔요. 여러 음 선택을 켜면 음표를 하나씩 골라 함께 고칠 수 있어요.</p>
              </details>
            </div>
            <div className="editor-copy-actions">
              <button className="measure-sound-open" type="button"
                disabled={!activeMeasure.notes || validation?.state !== "exact" || isAnyPlaying}
                onClick={() => setSoundEffectDialogOpen(true)}>
                <Volume2 size={17} /> 소리 추가
                {activeMeasure.effects.length > 0 && <span className="measure-sound-count">{activeMeasure.effects.length}</span>}
              </button>
              <button className="listen-all action-button" type="button" disabled={!activeMeasure.notes || isAnyPlaying}
                onClick={() => void playActiveMeasure()}>
                <PlayIcon playing={playingMeasure} /> 이 마디 듣기
              </button>
              <div className="history-actions" aria-label="작곡 되돌리기">
                <button type="button" disabled={undoStack.length === 0} onClick={undoCompositionChange}><Undo2 size={16} /> 되돌리기</button>
                <button type="button" disabled={redoStack.length === 0} onClick={redoCompositionChange}><Redo2 size={16} /> 다시 하기</button>
              </div>
            </div>
          </div>

          <div className="focused-measure-editor">
          <div className={activeMeasure.notes ? "editor-card" : "editor-card empty-editor"}>
            {activeMeasure.notes ? (
              <>
                <ScoreMeasure notes={activeNotes} meter={meter} keyFifths={activeMeasure.keyFifths} showPitchNames
                  playingNoteId={playingMeasure || playingMeasureIndex === activeIndex ? playingNoteId : null}
                  selectedNoteId={selectedNoteId} selectedNoteIds={selectedNoteIds}
                  onSelectNote={selectNote} onMoveNote={selectMultipleNotes ? undefined : moveNotePitch}
                  onMovePosition={selectMultipleNotes ? undefined : moveNotePosition}
                  onNoteLayout={(positions) => updateEditorLyricNotePositions(activeIndex, positions)} />
                <ComposerLyrics key={activeIndex} notes={activeNotes} meter={meter} measureIndex={activeIndex}
                  selectedNoteId={selectedNoteId} notePositions={editorLyricNotePositions[activeIndex]}
                  onFocusNote={(noteId) => selectNote(noteId)}
                  onChange={(notes) => setMeasures((current) => current.map((measure, index) =>
                    index === activeIndex ? { ...measure, notes } : measure))} />
                <div className="beat-meter">
                  <div className="beat-meter-label">
                    <span>이 마디에 채운 길이</span>
                    <strong>{usedBeats} / {capacity}</strong>
                  </div>
                  <div className="beat-track"><span style={{ width: `${Math.min(usedBeats / capacity, 1) * 100}%` }} /></div>
                  <p className={`validation ${validation?.state ?? ""}`}>
                    {validation?.state === "exact" ? "✓" : "!"} {validation?.message}
                  </p>
                </div>
                <MeasureHarmonyGuide chords={activeMeasure.chords} notes={activeNotes}
                  meter={meter} selectedNote={selectedNote} />
                <details className="workspace-disclosure note-tools-disclosure">
                  <summary>음표 다듬기 <span>높이 · 길이 · 쉼표 · 복사</span></summary>
                <div className="note-tools" onMouseDown={keepEditorFocus} onClickCapture={preserveViewportAfterButtonClick}>
                  <div><span>고른 음표</span><strong>{selectedNoteIds.length > 1 ? `${selectedNoteIds.length}개 선택` : selectedNote ? pitchName(selectedNote.pitch, selectedNote.accidental) : "음표를 골라 주세요"}</strong></div>
                  <button type="button" aria-pressed={selectMultipleNotes}
                    onClick={() => setSelectMultipleNotes((current) => !current)}>
                    ☑<span>여러 음 선택</span></button>
                  <button type="button" onClick={() => changePitch(1)}
                    disabled={selectedNoteIds.length === 0 || selectedNotes.every((note) => note.pitch === null)}>↑<span>높게</span></button>
                  <button type="button" onClick={() => changePitch(-1)}
                    disabled={selectedNoteIds.length === 0 || selectedNotes.every((note) => note.pitch === null)}>↓<span>낮게</span></button>
                  <button type="button" data-testid="split-note" disabled={selectedNoteIds.length !== 1}
                    onClick={splitSelectedNote}>½<span>쪼개기</span></button>
                  <button type="button" onClick={lengthenSelectedNote} disabled={selectedNoteIds.length !== 1}>2×<span>길게</span></button>
                  <button type="button" data-testid="dot-note" disabled={selectedNoteIds.length !== 1 || selectedNote?.dotted}
                    onClick={dotSelectedNote}>•<span>점 붙이기</span></button>
                  <button type="button" data-testid="beam-notes" disabled={selectedNoteIds.length < 2}
                    onClick={beamSelectedNotes}>▰<span>기둥 묶기</span></button>
                  <button type="button" data-testid="unbeam-notes" disabled={selectedNoteIds.length === 0}
                    onClick={unbeamSelectedNotes}>▯<span>분리</span></button>
                  <button type="button" data-testid="link-notes" disabled={selectedNoteIds.length !== 2}
                    onClick={linkSelectedNotes}>⌒<span>음표 잇기</span></button>
                  <button type="button" data-testid="add-rest" onClick={addRestNote}>𝄽<span>쉼표</span></button>
                  <button type="button" data-testid="add-note" onClick={addMelodyNote}><Plus size={17} /><span>음표 추가</span></button>
                  <button type="button" className="danger" onClick={deleteNote}><Trash2 size={18} /><span>지우기</span></button>
                  <button type="button" className="reset" data-testid="reset-measure" onClick={resetActiveMeasure}><Undo2 size={18} /><span>처음으로</span></button>
                  <button type="button" data-testid="copy-notes" disabled={selectedNoteIds.length === 0}
                    onClick={copySelectedNotes}><Copy size={18} /><span>복사</span></button>
                </div>
                </details>
                {editStatus && <p className="edit-status" role="status">{editStatus}</p>}
              </>
            ) : (
              <div className="empty-message"><Music2 size={44} /><strong>먼저 가락을 하나 골라 주세요</strong></div>
            )}
          </div>
          </div>
        </section>

        <details className="workspace-disclosure preview-instrument-disclosure measure-instrument-disclosure">
          <summary>가락 악기 <small>{selectedInstrument.name}</small></summary>
          <ComposerInstrumentPicker value={selectedInstrumentId} onChange={setSelectedInstrumentId} />
        </details>

        <section className="story-focus">
          <div className="focus-index">{activeIndex + 1}</div>
          <div>
            <span>지금 만드는 마디</span>
            <h2>{activeIndex + 1}마디 · {activeMeasure.storyHint}</h2>
          </div>
          <div className={`focus-story ${activeMeasure.story}`}>
            <span>{storyInfo[activeMeasure.story].icon}</span>
            <div><strong>{storyInfo[activeMeasure.story].label}</strong></div>
          </div>
        </section>
          </div>

          <div className="score-workspace-column score-timeline-column">
        <details className="workspace-disclosure full-score-disclosure">
          <summary id="composition-heading">전체 악보 보기 <span>{songLength}마디 · 가사 함께 보기</span></summary>
        <section className="composition-section" aria-labelledby="composition-heading">
          {structurePlan && <SongStoryMap plan={structurePlan} activeIndex={activeIndex}
            completed={measures.map((measure) => measure.notes !== null)} onSelect={selectMeasure} />}
          <MobileMeasureRange total={songLength} activeIndex={activeIndex}>
            {measures.map((measure, index) => (
              <div className="measure-cell" key={index}>
                <button type="button" data-testid={`measure-${index + 1}`}
                  data-save-target={`measure-${index}`}
                  data-playing={playingMeasureIndex === index ? "true" : undefined}
                  aria-current={playingMeasureIndex === index ? "true" : undefined}
                  aria-label={`${index + 1}마디, ${storyInfo[measure.story].label}, ${measure.storyHint}${measure.notes ? ", 가락 선택 완료" : ", 가락 선택 전"}`}
                  data-rhythm-check={rhythmChecks[index]}
                  className={`measure-slot ${measure.story}${activeIndex === index ? " active" : ""}${measure.notes ? " completed" : ""}${rhythmChecks[index] ? ` rhythm-${rhythmChecks[index]}` : ""}${recentCompletedIndex === index ? " just-completed" : ""}${playingMeasureIndex === index ? " playing" : ""}${saveIssues.some((issue) => issue.measureIndex === index) ? " save-issue" : ""}`}
                  onClick={() => selectMeasure(index)}>
                  <span className="measure-slot-header">
                    <strong>{index + 1}마디</strong>
                    <span className="measure-slot-meta">
                      {measure.notes && <span className="measure-status-icon" aria-label="가락 선택 완료"><CheckCircle2 size={13} /></span>}
                      <span className="measure-story-label">{storyInfo[measure.story].icon} {measure.storyHint}</span>
                    </span>
                  </span>
                  <ScoreMeasure notes={measure.notes ?? []} meter={meter} keyFifths={measure.keyFifths} compact wide
                    playingNoteId={playingMeasureIndex === index ? playingNoteId : null}
                    showSignature={index % 4 === 0} systemMeasure
                    onNoteLayout={(positions) => updateTimelineLyricNotePositions(index, positions)} />
                  {measure.effects.length > 0 && (
                    <span className="measure-effects" aria-label={`${measure.effects.length}개 효과음`}>
                      {measure.effects.map((effect) => <i key={effect.id} title={`${findSoundEffect(effect.effectId).name} · ${effect.offsetBeats}박`}>
                        {findSoundEffect(effect.effectId).icon}
                      </i>)}
                    </span>
                  )}
                </button>
                <div className={lyrics[index]?.trim() ? "measure-lyric filled" : "measure-lyric"}
                  onFocus={() => setActiveIndex(index)}>
                  <span>{index + 1}마디 가사</span>
                  <NoteLyrics notes={measure.notes ?? []} meter={meter} measureIndex={index} compact wide
                    showSignature={index % 4 === 0}
                    notePositions={timelineLyricNotePositions[index]}
                    onChange={(noteId, value) => updateNoteLyric(index, noteId, value)} />
                </div>
              </div>
            ))}
          </MobileMeasureRange>
        </section>
        </details>

          </div>

        </div>

        </ComposerWorkspacePanel>
        {!showArrangement && (["arrange", "publish"] as const).map((view) => (
          <ComposerWorkspacePanel key={view} view={view} active={workspace.view}>
            <ComposerWorkspaceEmpty complete={allValid} onReturn={() => workspace.changeView("melody")} onComplete={openArrangement} />
          </ComposerWorkspacePanel>
        ))}
        {showArrangement && (<>
          <ComposerWorkspacePanel view="arrange" active={workspace.view}>
          <section className="arrangement-section" id="arrangement" data-testid="arrangement-section">
            {completionCelebration && (
              <div className="completion-celebration" role="status">
                <ComposerChildArtwork kind="complete" />
                <div>
                  <strong>{songLength}마디 가락을 완성했어요!</strong>
                </div>
                <button type="button" onClick={() => setCompletionCelebration(false)} aria-label="완성 안내 닫기">
                  <X size={17} aria-hidden="true" /> 시작하기
                </button>
              </div>
            )}
            <div className="arrangement-heading">
              <div className="arrangement-heading-copy">
                <h2>반주·가사</h2>
              </div>
              <div className="selected-instrument">
                <span>{selectedInstrument.icon}</span>
                <div><small>지금 고른 악기</small><strong>{selectedInstrument.name}</strong></div>
                <div className="arrangement-playback-controls">
                  <button type="button" data-testid="play-arranged"
                    disabled={playingId !== null || playingMeasure} onClick={() => toggleWholeSong(0)}>
                    <PlayIcon playing={songPlaybackState === "playing"} />
                    {songPlaybackState === "paused" ? "다시 재생" :
                      songPlaybackState === "playing" ? `일시정지${playingMeasureIndex !== null ? ` · ${playingMeasureIndex + 1}마디` : ""}` : "전체 듣기"}
                  </button>
                  {playingSong && <button type="button" className="song-stop" data-testid="stop-arranged-playback"
                    onClick={() => void stopWholeSong()}><Square size={18} /> 중지</button>}
                </div>
              </div>
            </div>

            <ComposerInstrumentLibrary value={selectedInstrumentId} onChange={setSelectedInstrumentId} />

            <section className="accompaniment-builder" aria-labelledby="accompaniment-heading">
              <AccompanimentEditor styleId={accompanimentStyleId} instrumentIds={accompanimentInstrumentIds}
                disabled={isAnyPlaying} playback={{ state: songPlaybackState, disabled: playingId !== null || playingMeasure || musicVideoBusy,
                  onListen: () => toggleWholeSong(0) }}
                onChange={(styleId, instrumentIds) => {
                  setAccompanimentStyleId(styleId);
                  if (instrumentIds) setAccompanimentInstrumentIds(uniqueAccompanimentInstrumentIds(instrumentIds));
                }} onToggleInstrument={toggleAccompanimentInstrument}>
                <details className="workspace-disclosure mixer-disclosure">
                  <summary>반주 소리 조절 <span>악기별 음량 · 따로 듣기</span></summary>
                <AccompanimentMixer instrumentIds={accompanimentInstrumentIds} mixer={accompanimentMixer}
                  canListen={accompanimentReady && !exportingBacking && (playingSong || !isAnyPlaying)} editingDisabled={isAnyPlaying}
                  controlsDisabled={exportingBacking || karaokeRunning || processingRecording || recordingFileExport.busy || musicVideoBusy}
                  onSolo={(instrumentId) => void toggleAccompanimentSolo(instrumentId)}
                  onRemove={toggleAccompanimentInstrument} />
                </details>
              </AccompanimentEditor>
              <details className="workspace-disclosure beat-disclosure">
                <summary>비트 만들기 <span>타악기 · 리듬 직접 넣기</span></summary>
              <BeatInstrumentChooser events={beatPattern}
                meter={meter} bpm={bpm} volume={beatVolume} disabled={isAnyPlaying} playing={beatPreviewing}
                onChange={setBeatPattern} onVolumeChange={setBeatVolume}
                onPlayingChange={setBeatPreviewing} />
              </details>
            </section>

            <details className="workspace-disclosure all-lyrics-disclosure">
              <summary>전체 가사 쓰기 <span>{lyrics.filter((lyric) => lyric.trim()).length}/{songLength}마디 입력</span></summary>
            <div className="lyrics-heading">
              <div><span className="number-badge">♪</span><div><h2>가사</h2></div></div>
              <strong>{lyrics.filter((lyric) => lyric.trim()).length}/{songLength}마디 입력</strong>
            </div>
            <div className="lyrics-grid">
              {measures.map((measure, index) => (
                <div key={index} className={lyrics[index].trim() ? "lyric-card filled" : "lyric-card"}>
                  <span>{index + 1}마디</span>
                  <ScoreMeasure notes={measure.notes ?? []} meter={meter} keyFifths={measure.keyFifths} compact
                    onNoteLayout={(positions) => updateLyricNotePositions(index, positions)} />
                  <NoteLyrics notes={measure.notes ?? []} meter={meter} measureIndex={index} compact
                    notePositions={lyricNotePositions[index]}
                    onChange={(noteId, value) => updateNoteLyric(index, noteId, value)} />
                </div>
              ))}
            </div>

            </details>
          </section>
          </ComposerWorkspacePanel>
          <ComposerWorkspacePanel view="publish" active={workspace.view}>
            <div className="publish-section publish-with-guide">
              <div className="publish-details-intro">
                <div className="publish-details-content">
                  <div className="publish-heading">
                    <div><h2>저장·발표</h2></div>
                  </div>
                  {originalCreator && (
                    <div className="original-credit" data-testid="original-credit">
                      <span>원작자</span><strong data-testid="original-creator">{originalCreator}</strong>
                      <p>리메이크 곡에서도 이 표시는 지울 수 없어요.</p>
                    </div>
                  )}
                  <div className="publish-fields">
                    <label className={saveIssues.some((issue) => issue.target === "title") ? "save-issue" : ""} data-save-target="title"><span>곡 제목</span><input data-testid="song-title" value={songTitle} maxLength={60}
                      onChange={(event) => { setSongTitle(event.target.value); setShareStatus(""); }} /></label>
                    <label className={saveIssues.some((issue) => issue.target === "creator") ? "save-issue" : ""} data-save-target="creator"><span>{originalCreator ? "리메이크 작곡가" : "작곡가"}</span>
                      <input data-testid="creator-name" value={creatorName} maxLength={40}
                        onChange={(event) => { setCreatorName(event.target.value); setShareStatus(""); }}
                        placeholder="이름 또는 별명" /></label>
                  </div>
                  <details className="workspace-disclosure song-story-disclosure">
                    <summary>노래 이야기 적기 <span>선택 사항</span></summary>
                  <label className={`song-description-field${saveIssues.some((issue) => issue.target === "description") ? " save-issue" : ""}`} data-save-target="description">
                    <span>이 노래에 대한 이야기</span>
                    <textarea data-testid="song-description" value={songDescription} maxLength={600} rows={4}
                      onChange={(event) => { setSongDescription(event.target.value); setShareStatus(""); }}
                      placeholder="노래 이야기" />
                    <small>{songDescription.length}/600</small>
                  </label>
                  </details>
                </div>
                <ComposerChildArtwork kind="recording" />
              </div>
              <PublishPlaybackNotice isAnyPlaying={isAnyPlaying} onStop={() => void stopWholeSong()} />
              <div className="publish-actions">
                {firebaseConfigured && <div className="publish-action-group publish-action-group-cloud">
                  <h3>다른 기기에서도 이어 만들기</h3>
                  <button type="button" className="publish-cloud-save action-button" disabled={cloudBusy}
                    onClick={() => authUser ? void handleCloudSave(false) : setAccountLibraryOpen(true)}>
                    <Library size={18} /> {cloudBusy ? "저장 중..." : authUser ? "내 악보함에 저장" : "로그인하고 저장"}
                  </button>
                </div>}
                <CompositionSaveFiles media={compositionMediaExport} complete={allValid && exportMeasures.length === songLength}
                  busy={mediaExportBusy} exportingPdf={exportingPdf} onPdf={(include) => void exportPdf(include)} />
                <CompositionPerformActions complete={allValid} playing={isAnyPlaying}
                  practicing={practicingSong} recording={recordingSong}
                  onMobileLink={() => void createMobileRecordingLink()} onPractice={() => void practiceSong()}
                  onRecord={() => setRecordingGuidePromptOpen(true)} />
              </div>
              {recordingStatus && <p className="recording-status" role="status">{recordingStatus}</p>}
              {recordingDownloadUrl && (
                <><button type="button" className="recording-download" disabled={mediaExportBusy || exportingBacking}
                  onClick={saveProcessedRecording}>녹음 파일 저장</button>
                </>
              )}
              {shareStatus && <p className="share-status" role="status">{shareStatus}</p>}
              {generatedShareUrl && (
                <label className="share-url"><span>공유 주소</span>
                  <textarea data-testid="share-url" readOnly value={generatedShareUrl} rows={3} /></label>
              )}
              {mobileRecordingUrl && (
                <div className="mobile-record-qr" data-testid="mobile-recording-qr">
                  {canRenderMobileRecordingQr ? (
                    <QRCodeSVG ref={mobileRecordingQrRef} value={mobileRecordingUrl} size={320} marginSize={4} level="L" boostLevel={false}
                      bgColor="#ffffff" fgColor="#111111" shapeRendering="crispEdges"
                      title="스마트폰 녹음 링크 QR 코드" />
                  ) : (
                    <div className="mobile-record-qr-fallback"><QrCode size={38} /></div>
                  )}
                  <div className="mobile-record-qr-copy">
                    <strong>{canRenderMobileRecordingQr ? "스마트폰 카메라로 스캔" : "링크를 복사해서 열기"}</strong>
                    {!canRenderMobileRecordingQr && <p>곡 정보가 길어 QR을 만들 수 없어요. 공유 주소를 복사해 주세요.</p>}
                    {canRenderMobileRecordingQr && (
                      <button type="button" className="mobile-record-qr-save" data-testid="save-mobile-recording-qr"
                        onClick={() => void saveMobileRecordingQr()}>
                        <FileDown size={17} aria-hidden="true" /> QR 이미지 저장
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <section className="composition-music-video" aria-label="뮤직비디오 만들기">
              <MusicVideoFeature scenes={musicVideoScenes} onScenesChange={setMusicVideoScenes}
                openRequest={recoveredStudioRequest} onFindLostDrawings={() => void lostDrawingRecovery.scan()}
                saveStatus={saveStatus} projectSaveStatus={cloudSaveLabel} saveError={localSaveFailed ? saveStatus : cloudAutosave.error}
                onBusyChange={setMusicVideoBusy} complete={allValid && exportMeasures.length === songLength}
                busy={mediaExportBusy || exportingBacking || exportingPdf}
                recording={matchingMusicVideoRecording(recordingDownloadUrl, recordingVideoPlan, exportMeasures, bpm, selectedInstrumentId, currentAccompanimentOptions)}
                measures={exportMeasures} title={songTitle} composer={creatorName} instrumentId={selectedInstrumentId}
                bpm={bpm} accompaniment={currentAccompanimentOptions} />
            </section>
            <p className="audio-credit">
              음원: FluidR3 SoundFont(CC BY 3.0) · 국립국악원 디지털 음원(공공누리 제1유형) · THIRD_PARTY_NOTICES.md
            </p>
          </ComposerWorkspacePanel>
            {allValid && printableMeasures.length === songLength && (
              <PdfScoreSheet title={songTitle} description={songDescription} creator={creatorName} originalCreator={originalCreator}
                meter={meter}
                measures={printableMeasures} includeAccompaniment={pdfIncludeAccompaniment}
                playbackUrl={pdfPlaybackUrl} />
            )}
        </>)}
      </main>}

      {!mobileRecordMode && <footer className="bottom-bar" inert={showOpening} aria-hidden={showOpening}
        onMouseDown={workspace.view === "melody" ? keepEditorFocus : undefined}
        onClickCapture={workspace.view === "melody" ? preserveViewportAfterButtonClick : undefined}>
        <div className="save-status-row" role="status" aria-live="polite">
          <span className={localSaveFailed ? "save-status-local failed" : "save-status-local saved"}>{saveStatus}</span>
          <span className={`save-status-cloud${cloudSaveIsCurrent ? " saved" : cloudSaveFailed ? " failed" : ""}`}>{cloudSaveLabel}</span>
        </div>
        {workspace.view === "melody" ? <>
        <div>
          <span className="mini-label">{activeIndex + 1}번째 마디 · {meterKey(meter)}</span>
          <strong>{validation && validation.state !== "exact" ? validation.message :
            activeMeasure.candidateName ?? "아직 가락을 고르지 않았어요"}</strong>
          <span className={`status-dot ${validation?.state ?? "empty"}`} />
        </div>
        <button type="button" className="secondary action-button" disabled={activeIndex === 0}
          onClick={() => selectMeasure(Math.max(0, activeIndex - 1))}><ArrowLeft size={18} /> 이전 마디</button>
        {activeIndex < measures.length - 1 ? (
          <button type="button" className="primary action-button" data-testid="next-measure"
            disabled={!activeMeasure.notes || validation?.state !== "exact"} onClick={goNext}>
            다음 마디로 <ArrowRight size={18} />
          </button>
        ) : (
          <button type="button" className={allValid ? "primary action-button finish-ready" : "primary action-button"} data-testid="finish-composition" disabled={!allValid}
            onClick={openArrangement}>
            {songLength}마디 완성 <CheckCircle2 size={18} />
          </button>
        )}
        </> : <div className="workspace-footer-actions">
          <button type="button" className="secondary action-button" onClick={() => workspace.changeView("melody")}><ArrowLeft size={18} /> 가락 만들기</button>
          <button type="button" className="primary action-button" onClick={() => workspace.changeView(workspace.view === "arrange" ? "publish" : "arrange")}>
            {workspace.view === "arrange" ? "저장·발표로" : "반주·가사로"}<ArrowRight size={18} />
          </button>
        </div>}
      </footer>}
    </div>
  );
}
