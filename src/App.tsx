import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, FileDown, FileMusic, FileUp, Menu, Mic2, Music2, PartyPopper, Plus, QrCode, Redo2, Share2, SlidersHorizontal, Smartphone, Square, Undo2, Volume2, WandSparkles, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { exportBackingCompositionMp3, pausePlayback, playComposition, playMeasure, recordKaraokeComposition, renderKaraokePreviewMix, renderProcessedKaraokeMp3, resumePlayback, stopPlayback,
  type KaraokePostProcessPreset } from "./audio/player";
import { preloadInstrument } from "./audio/samplePlayer";
import { reviewRecordedPitch, type RecordingPitchReview } from "./audio/pitchReview";
import PlayIcon from "./components/PlayIcon";
import PdfScoreSheet from "./components/PdfScoreSheet";
import ScoreMeasure from "./components/ScoreMeasure";
import NoteLyrics from "./components/NoteLyrics";
import SoundEffectEditor from "./components/SoundEffectEditor";
import { ACCOMPANIMENT_STYLES, ENSEMBLE_PRESETS, MAX_ACCOMPANIMENT_INSTRUMENTS, accompanimentInstrumentPart, createAccompanimentPattern, findAccompanimentStyle,
  type AccompanimentStyleId } from "./music/accompaniment";
import { getCandidates, MELODY_CANDIDATE_COUNT, MELODY_FEELING_GROUPS } from "./music/candidates";
import { chooseRecommendedCandidate, rankRecommendedCandidates, recommendedEndingPitch } from "./music/recommendation";
import { chordDegreeSequence, chordMidiPitches, chordPitchClasses } from "./music/chord";
import { DRAFT_STORAGE_KEY, isSavedDraft, readDraft, writeDraft, type SavedDraft } from "./music/draft";
import { findHarmonyPreset, HARMONY_PRESETS, type HarmonyPreset } from "./music/harmonyPresets";
import { findInstrument, INSTRUMENTS, type InstrumentId } from "./music/instruments";
import { measureCapacity, meterKey, SUPPORTED_METERS, validateMeasure, type Meter } from "./music/meter";
import { rational, toNumber } from "./music/rational";
import { pitchName, positionNotes } from "./music/score";
import { findSoundEffect, type SoundEffectId } from "./music/soundEffects";
import { buildShareUrl, readCompositionFromHash, type SharedComposition } from "./music/share";
import type { HarmonyStory, MelodyCandidate, NoteEvent, SoundEffectEvent } from "./music/types";

type MeasureDraft = {
  story: HarmonyStory;
  storyHint: string;
  chords: readonly string[];
  candidateId: string | null;
  candidateName: string | null;
  notes: readonly NoteEvent[] | null;
  effects: readonly SoundEffectEvent[];
};

function uniqueAccompanimentInstrumentIds(ids: readonly InstrumentId[]): InstrumentId[] {
  const unique: InstrumentId[] = [];
  ids.forEach((id) => {
    const canonicalId = findInstrument(id).id;
    if (!unique.includes(canonicalId) && unique.length < MAX_ACCOMPANIMENT_INSTRUMENTS) unique.push(canonicalId);
  });
  return unique.length > 0 ? unique : [findInstrument("piano").id];
}

async function waitForVexScoreRender(timeoutMs = 4000): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const scores = Array.from(document.querySelectorAll<HTMLElement>("[data-vex-score='true']"));
    if (scores.length === 0 || scores.every((score) => score.dataset.vexReady === "true")) return;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
}

function sameInstrumentOrder(a: readonly InstrumentId[], b: readonly InstrumentId[]): boolean {
  return a.length === b.length && a.every((id, index) => findInstrument(id).id === findInstrument(b[index]).id);
}

function repeatFourMeasures<T>(items: readonly T[], fromEnd = false): T[] {
  if (items.length === 0) return [];
  const source = fromEnd ? items.slice(Math.max(0, items.length - 4)) : items.slice(0, 4);
  const repeated: T[] = [];
  for (let index = 0; index < 4; index += 1) repeated.push(source[index % source.length]);
  return repeated;
}

function rationalFromBeats(value: number) {
  return rational(Math.max(1, Math.round(value * 24)), 24);
}

function backingDisplayNotes(measure: MeasureDraft, meter: Meter, styleId: AccompanimentStyleId,
  section: "intro" | "outro", displayIndex: number): NoteEvent[] {
  const capacity = toNumber(measureCapacity(meter));
  const chordSymbols = measure.chords.length > 0 ? measure.chords : [""];
  const chordBeats = capacity / chordSymbols.length;
  let sequence = 0;
  const events = chordSymbols.flatMap((chord, chordIndex) => {
    const pitches = chord ? chordMidiPitches(chord) : chordMidiPitches("C");
    return createAccompanimentPattern(styleId, chordBeats).map((event) => {
      const id = `${section}-${displayIndex}-${sequence}`;
      sequence += 1;
      const pitch = event.voice === "root"
        ? pitches[0] - 12
        : event.voice === "step"
          ? pitches[(event.step ?? 0) % pitches.length]
          : pitches[0];
      return {
        id,
        onset: chordIndex * chordBeats + event.offsetBeats,
        duration: event.durationBeats,
        pitch: Math.max(48, Math.min(76, pitch))
      };
    });
  }).sort((left, right) => left.onset - right.onset);

  const notes: NoteEvent[] = [];
  let cursor = 0;
  events.forEach((event) => {
    if (event.onset > cursor + 0.001) {
      notes.push({ id: `${event.id}-rest-before`, pitch: null, duration: rationalFromBeats(event.onset - cursor) });
    }
    notes.push({ id: event.id, pitch: event.pitch, duration: rationalFromBeats(event.duration) });
    cursor = Math.max(cursor, event.onset + event.duration);
  });
  if (cursor < capacity - 0.001) {
    notes.push({ id: `${section}-${displayIndex}-rest-end`, pitch: null, duration: rationalFromBeats(capacity - cursor) });
  }
  return notes;
}

type SongLength = 8 | 12 | 16;
type SongPlaybackState = "idle" | "playing" | "paused";
type KaraokePhase = "idle" | "intro" | "song" | "outro" | "encoding" | "done" | "error";
type KaraokeHighlight = Readonly<{
  section: "intro" | "song" | "outro";
  measureIndex: number | null;
  noteId: string | null;
}>;
type PlaybackSegment = Readonly<{ measureIndex: number; start: number; end: number }>;
type PlaybackNoteSegment = Readonly<{ measureIndex: number; noteId: string; start: number; end: number }>;

const PREVIEW_INSTRUMENT_LIMIT = 15;
const QR_RENDER_LIMIT = 2900;
const QUICK_PREVIEW_INSTRUMENTS = INSTRUMENTS.slice(0, PREVIEW_INSTRUMENT_LIMIT);
const MORE_PREVIEW_INSTRUMENTS = INSTRUMENTS.slice(PREVIEW_INSTRUMENT_LIMIT);

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

type CompositionSnapshot = Readonly<{
  presetId: string;
  meter: Meter;
  songLength: SongLength;
  measures: readonly MeasureDraft[];
}>;

type HarmonyFit = "chord" | "passing" | "color";

function noteHarmonyFit(note: NoteEvent, notes: readonly NoteEvent[], chords: readonly string[], meter: Meter): HarmonyFit | null {
  if (note.pitch === null) return null;
  const positioned = positionNotes(notes).find((item) => item.id === note.id);
  const capacity = toNumber(measureCapacity(meter));
  const chordIndex = Math.min(Math.max(0, Math.floor((positioned?.onset ?? 0) / (capacity / Math.max(1, chords.length)))), Math.max(0, chords.length - 1));
  const tones = chordPitchClasses(chords[chordIndex] ?? "C");
  const pitchClass = ((note.pitch % 12) + 12) % 12;
  if (tones.includes(pitchClass)) return "chord";
  const nearTone = tones.some((tone) => Math.min((pitchClass - tone + 12) % 12, (tone - pitchClass + 12) % 12) <= 2);
  return nearTone ? "passing" : "color";
}

const roleHints: Record<HarmonyStory, readonly string[]> = {
  home: ["편안하게 시작", "잠깐 쉬어 가기", "우리 집에 도착"],
  journey: ["한 걸음 출발", "조금 더 멀리", "힘차게 나아가기"],
  wonder: ["다음이 궁금하게", "비밀 문 앞에서", "마지막을 기다려"],
  bounce: ["통통 뛰어가기", "리듬을 타기", "즐겁게 도착"],
  tender: ["살며시 시작", "따뜻하게 이어가기", "포근히 마무리"],
  brave: ["가슴 펴고 시작", "더 높이 나아가기", "당당하게 도착"],
  shadow: ["조심조심 시작", "비밀 길 지나기", "살짝 풀어주기"],
  sparkle: ["반짝이며 시작", "별빛 따라가기", "빛나게 도착"],
  swing: ["몸을 흔들며", "리듬에 맞추기", "들썩이며 끝내기"],
  floating: ["구름에 올라", "둥실둥실 걷기", "살며시 내려오기"],
  march: ["발맞춰 출발", "씩씩하게 걷기", "힘차게 도착"],
  folk: ["이야기 시작", "노래를 이어가기", "함께 마무리"]
};

const meterDetails: Record<string, { name: string; clap: string }> = {
  "2/4": { name: "두 박자", clap: "강 · 약" },
  "3/4": { name: "세 박자", clap: "강 · 약 · 약" },
  "4/4": { name: "네 박자", clap: "강 · 약 · 중강 · 약" },
  "6/8": { name: "두 덩어리 박자", clap: "하나둘셋 · 넷다섯여섯" }
};

function emptyComposition(preset: HarmonyPreset, length: SongLength): MeasureDraft[] {
  return Array.from({ length }, (_, index) => {
    const story = preset.roles[index % preset.roles.length];
    return {
      story,
      storyHint: roleHints[story][Math.floor(index / 4) % roleHints[story].length],
      chords: preset.bars[index % preset.bars.length],
      candidateId: null,
      candidateName: null,
      notes: null,
      effects: []
    };
  });
}

function lyricText(notes: readonly NoteEvent[] | null): string {
  return (notes ?? []).filter((note) => note.pitch !== null).map((note) => note.lyric ?? "").join("");
}

function applyLegacyLyric(notes: readonly NoteEvent[], lyric: string | undefined): readonly NoteEvent[] {
  if (!lyric || notes.some((note) => note.lyric)) return notes;
  const syllables = Array.from(lyric.replace(/\s+/g, ""));
  let lyricIndex = 0;
  return notes.map((note) => note.pitch === null ? note : { ...note, lyric: syllables[lyricIndex++] ?? "" });
}

function compositionFromShare(shared: SharedComposition, preset: HarmonyPreset): MeasureDraft[] {
  return emptyComposition(preset, shared.songLength).map((measure, index) => ({
    ...measure,
    candidateId: "shared",
    candidateName: shared.measures[index].candidateName,
    notes: applyLegacyLyric(shared.measures[index].notes, shared.lyrics[index]),
    effects: shared.measures[index].effects ?? []
  }));
}

function compositionFromDraft(draft: SavedDraft, preset: HarmonyPreset): MeasureDraft[] {
  return emptyComposition(preset, draft.songLength).map((measure, index) => ({
    ...measure,
    candidateId: draft.measures[index].candidateId,
    candidateName: draft.measures[index].candidateName,
    notes: draft.measures[index].notes
      ? applyLegacyLyric(draft.measures[index].notes, draft.lyrics[index]) : null,
    effects: draft.measures[index].effects ?? []
  }));
}

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

export default function App() {
  const mobileRecordMode = isRecordingLink(window.location.search, window.location.hash);
  const [incomingShare] = useState(() => readCompositionFromHash(window.location.hash));
  const [savedDraft] = useState(() => readDraft(window.localStorage));
  const [showOpening, setShowOpening] = useState(() =>
    !mobileRecordMode && new URLSearchParams(window.location.search).get("start") !== "new");
  const [showAppMenu, setShowAppMenu] = useState(false);
  const resumableDraft = savedDraft && (!incomingShare || savedDraft.sourceHash === window.location.hash)
    ? savedDraft : null;
  const initialPreset = findHarmonyPreset(resumableDraft?.presetId ?? incomingShare?.presetId ?? HARMONY_PRESETS[0].id);
  const initialLength = resumableDraft?.songLength ?? incomingShare?.songLength ?? 8;
  const [selectedPresetId, setSelectedPresetId] = useState(initialPreset.id);
  const [songLength, setSongLength] = useState<SongLength>(initialLength);
  const [meter, setMeter] = useState<Meter>(resumableDraft?.meter ?? incomingShare?.meter ?? { beats: 4, beatUnit: 4 });
  const [measures, setMeasures] = useState<MeasureDraft[]>(() =>
    resumableDraft ? compositionFromDraft(resumableDraft, initialPreset) :
      incomingShare ? compositionFromShare(incomingShare, initialPreset) : emptyComposition(initialPreset, initialLength)
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [showMoreCandidates, setShowMoreCandidates] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [undoStack, setUndoStack] = useState<readonly CompositionSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<readonly CompositionSnapshot[]>([]);
  const historyCurrent = useRef<CompositionSnapshot | null>(null);
  const restoringHistory = useRef(false);
  const splitCounter = useRef(0);
  const completionAnimationTimer = useRef<number | null>(null);
  const [recentCompletedIndex, setRecentCompletedIndex] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [songPlaybackState, setSongPlaybackState] = useState<SongPlaybackState>("idle");
  const [playingMeasureIndex, setPlayingMeasureIndex] = useState<number | null>(null);
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);
  const [playingMeasure, setPlayingMeasure] = useState(false);
  const [lyricNotePositions, setLyricNotePositions] = useState<Record<number, Record<string, { x: number; y: number }>>>({});
  const [timelineLyricNotePositions, setTimelineLyricNotePositions] = useState<Record<number, Record<string, { x: number; y: number }>>>({});
  const [karaokeLyricNotePositions, setKaraokeLyricNotePositions] = useState<Record<number, Record<string, { x: number; y: number }>>>({});
  const playbackTicker = useRef<number | null>(null);
  const playbackElapsed = useRef(0);
  const playbackStartedAt = useRef(0);
  const playbackDuration = useRef(0);
  const playbackSegments = useRef<readonly PlaybackSegment[]>([]);
  const playbackNoteSegments = useRef<readonly PlaybackNoteSegment[]>([]);
  const noteAnimationTimers = useRef<number[]>([]);
  const projectFileInput = useRef<HTMLInputElement | null>(null);
  const recordingPreviewRef = useRef<HTMLAudioElement | null>(null);
  const backingMixRequest = useRef(0);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<InstrumentId>(
    findInstrument(resumableDraft?.instrumentId ?? incomingShare?.instrumentId ?? "piano").id
  );
  const [accompanimentStyleId, setAccompanimentStyleId] = useState<AccompanimentStyleId>(
    resumableDraft?.accompanimentStyleId ?? incomingShare?.accompanimentStyleId ?? "arpeggio"
  );
  const [accompanimentInstrumentIds, setAccompanimentInstrumentIds] = useState<InstrumentId[]>(() =>
    uniqueAccompanimentInstrumentIds(resumableDraft?.accompanimentInstrumentIds ?? incomingShare?.accompanimentInstrumentIds ?? ["piano"])
  );
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
  const [saveStatus, setSaveStatus] = useState(resumableDraft ? "이어 불러옴 ✓" : "저장됨 ✓");
  const [shareStatus, setShareStatus] = useState("");
  const [generatedShareUrl, setGeneratedShareUrl] = useState("");
  const [mobileRecordingUrl, setMobileRecordingUrl] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfIncludeAccompaniment, setPdfIncludeAccompaniment] = useState(false);
  const [exportingBacking, setExportingBacking] = useState(false);
  const [recordingSong, setRecordingSong] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [recordingDownloadUrl, setRecordingDownloadUrl] = useState("");
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
  const selectedInstrument = findInstrument(selectedInstrumentId);
  const selectedAccompanimentStyle = findAccompanimentStyle(accompanimentStyleId);
  const activeEnsemblePresetId = ENSEMBLE_PRESETS.find((preset) =>
    sameInstrumentOrder(preset.instrumentIds, accompanimentInstrumentIds))?.id ?? null;
  const canRenderMobileRecordingQr = mobileRecordingUrl.length > 0 && mobileRecordingUrl.length <= QR_RENDER_LIMIT;

  const activeMeasure = measures[activeIndex];
  const lyrics = measures.map((measure) => lyricText(measure.notes));
  const candidates = useMemo(
    () => getCandidates(activeMeasure.story, meter, activeMeasure.chords),
    [activeMeasure.story, activeMeasure.chords, meter]
  );
  const candidatePriority = useMemo(() => {
    const earlierMeasures = measures.slice(0, activeIndex);
    const previousNotes = [...earlierMeasures].reverse().find((measure) => measure.notes)?.notes ?? [];
    const previousPitch = [...previousNotes].reverse().find((note) => note.pitch !== null)?.pitch ?? null;
    const earlierIndexes = new Set(earlierMeasures
      .map((measure) => candidates.findIndex((candidate) => candidate.id === measure.candidateId))
      .filter((index) => index >= 0));
    const previousCandidateIndex = candidates.findIndex((candidate) => candidate.id === measures[activeIndex - 1]?.candidateId);
    return rankRecommendedCandidates(candidates, activeMeasure.chords, previousPitch, activeIndex, measures.length,
      previousCandidateIndex, earlierIndexes);
  }, [activeIndex, activeMeasure.chords, candidates, measures]);
  const visibleCandidates = showMoreCandidates ? candidatePriority : candidatePriority.slice(0, 6);
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
    candidates: visibleCandidates.filter((candidate) => candidate.feelingId === group.id)
  })).filter((group) => group.candidates.length > 0), [visibleCandidates]);
  const activeNotes = activeMeasure.notes ?? [];
  const validation = activeMeasure.notes
    ? validateMeasure(activeMeasure.notes, meter)
    : null;
  const usedBeats = activeNotes.reduce((total, note) => total + toNumber(note.duration), 0);
  const capacity = toNumber(measureCapacity(meter));
  const selectedNote = activeNotes.find((note) => note.id === selectedNoteId);
  const selectedNotes = activeNotes.filter((note) => selectedNoteIds.includes(note.id));
  const selectedHarmonyFit = selectedNote ? noteHarmonyFit(selectedNote, activeNotes, activeMeasure.chords, meter) : null;
  const completedCount = measures.filter((measure) => measure.notes !== null).length;
  const allValid = measures.every(
    (measure) => measure.notes && validateMeasure(measure.notes, meter).state === "exact"
  );
  // Completing every measure only unlocks the finish button.  Accompaniment is
  // deliberately held back until that button opens the arrangement stage.
  const accompanimentReady = showArrangement && allValid;
  const activeStep = showArrangement ? 3 : 2;
  const playingSong = songPlaybackState !== "idle";
  const isAnyPlaying = playingId !== null || playingSong || playingMeasure;
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
    effects: measure.effects
  }] : []);
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
      setPlayingMeasureIndex(null);
      setPlayingNoteId(null);
    }
  }

  function startPlaybackTicker() {
    clearPlaybackTicker();
    updatePlaybackPosition();
    playbackTicker.current = window.setInterval(updatePlaybackPosition, 60);
  }

  function resetPlaybackUi() {
    clearPlaybackTicker();
    playbackElapsed.current = 0;
    playbackDuration.current = 0;
    playbackSegments.current = [];
    playbackNoteSegments.current = [];
    setSongPlaybackState("idle");
    setPlayingMeasureIndex(null);
    setPlayingNoteId(null);
  }

  useEffect(() => () => {
    clearPlaybackTicker();
    clearNoteAnimationTimers();
    if (completionAnimationTimer.current !== null) window.clearTimeout(completionAnimationTimer.current);
    void stopPlayback();
  }, []);

  useEffect(() => () => {
    if (recordingDownloadUrl) URL.revokeObjectURL(recordingDownloadUrl);
  }, [recordingDownloadUrl]);

  useEffect(() => {
    // 선택된 멜로디 악기 프리로드
    void preloadInstrument(selectedInstrumentId);
  }, [selectedInstrumentId]);

  useEffect(() => {
    setShowMoreCandidates(false);
  }, [activeIndex, meter, selectedPresetId]);

  useEffect(() => {
    // 선택된 반주 악기들 프리로드
    accompanimentInstrumentIds.forEach((id) => {
      void preloadInstrument(id);
    });
  }, [accompanimentInstrumentIds]);

  useEffect(() => {
    const next: CompositionSnapshot = { presetId: selectedPresetId, meter, songLength, measures };
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
      previous.songLength === next.songLength && previous.measures === next.measures) return;
    setUndoStack((stack) => [...stack, previous].slice(-40));
    setRedoStack([]);
    historyCurrent.current = next;
  }, [measures, meter, selectedPresetId, songLength]);

  useEffect(() => {
    setSaveStatus("저장 중…");
    const timer = window.setTimeout(() => {
      const draft: SavedDraft = {
        version: 1,
        updatedAt: Date.now(),
        sourceHash,
        title: songTitle,
        description: songDescription,
        creator: creatorName,
        originalCreator,
        presetId: selectedPresetId,
        meter,
        songLength,
        instrumentId: selectedInstrumentId,
        accompanimentStyleId,
        accompanimentInstrumentIds,
        bpm,
        lyrics,
        measures: measures.map(({ candidateId, candidateName, notes, effects }) => ({ candidateId, candidateName, notes, effects })),
        showArrangement
      };
      setSaveStatus(writeDraft(window.localStorage, draft) ? "저장됨 ✓" : "저장하지 못했어요");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [accompanimentInstrumentIds, accompanimentStyleId, bpm, creatorName, measures, meter,
    originalCreator, selectedInstrumentId, selectedPresetId, songDescription, sourceHash, showArrangement, songLength, songTitle]);

  function restoreComposition(snapshot: CompositionSnapshot) {
    restoringHistory.current = true;
    setSelectedPresetId(snapshot.presetId);
    setMeter(snapshot.meter);
    setSongLength(snapshot.songLength);
    setMeasures(snapshot.measures as MeasureDraft[]);
    setActiveIndex((index) => Math.min(index, snapshot.measures.length - 1));
    setSelectedNoteId("");
    setSelectedNoteIds([]);
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

  function confirmNewStructure(message: string): boolean {
    return completedCount === 0 || window.confirm(`${message}\n\n지금 만든 마디는 지워지지만, 바로 되돌리기 버튼으로 되돌릴 수 있어요.`);
  }

  function chooseMeter(next: Meter) {
    if (meterKey(next) === meterKey(meter)) return;
    if (!confirmNewStructure("박자를 바꾸면 새 노래를 만들어요.")) return;
    setMeter(next);
    setMeasures(emptyComposition(selectedPreset, songLength));
    setActiveIndex(0);
    setSelectedNoteId("");
    setSelectedNoteIds([]);
    setShowArrangement(false);
  }

  function choosePreset(id: string) {
    const preset = findHarmonyPreset(id);
    if (preset.id !== selectedPresetId && !confirmNewStructure("화음 이야기를 바꾸면 새 노래를 만들어요.")) return;
    setSelectedPresetId(preset.id);
    setMeasures(emptyComposition(preset, songLength));
    setActiveIndex(0);
    setSelectedNoteId("");
    setSelectedNoteIds([]);
    setShowArrangement(false);
  }

  function chooseLength(length: SongLength) {
    if (length === songLength) return;
    if (!confirmNewStructure("마디 수를 바꾸면 새 노래를 만들어요.")) return;
    setSongLength(length);
    setMeasures(emptyComposition(selectedPreset, length));
    setActiveIndex(0);
    setSelectedNoteId("");
    setSelectedNoteIds([]);
    setShowArrangement(false);
  }

  function updateActiveMeasure(update: (measure: MeasureDraft) => MeasureDraft) {
    setMeasures((current) =>
      current.map((measure, index) => (index === activeIndex ? update(measure) : measure))
    );
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

  function fillRecommended() {
    let previousPitch: number | null = null;
    let previousCandidateIndex = -1;
    const usedCandidateIndexes = new Set<number>();
    const recommendedMeasures = measures.map((measure, index) => {
      const measureCandidates = getCandidates(measure.story, meter, measure.chords);
      const candidate = chooseRecommendedCandidate(
        measureCandidates,
        measure.chords,
        previousPitch,
        index,
        measures.length,
        previousCandidateIndex,
        usedCandidateIndexes
      );
      previousCandidateIndex = measureCandidates.indexOf(candidate);
      usedCandidateIndexes.add(previousCandidateIndex);
      previousPitch = recommendedEndingPitch(candidate);
      return {
        ...measure,
        candidateId: candidate.id,
        candidateName: candidate.name,
        notes: candidate.notes
      };
    });
    setMeasures(recommendedMeasures);
    const activeCandidate = recommendedMeasures[activeIndex];
    setSelectedNoteId(activeCandidate.notes[0]?.id ?? "");
    setSelectedNoteIds(activeCandidate.notes[0] ? [activeCandidate.notes[0].id] : []);
    setEditStatus("");
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
          <div><strong>{candidate.name}</strong><span>{candidate.hint}</span></div>
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

  function renderPreviewInstrumentPicker() {
    return (
      <div className="preview-instrument-picker measure-instrument-picker" aria-label="가락 미리듣기 악기 선택">
        <div>
          <span className="section-kicker">먼저 소리를 골라요</span>
          <strong>가락을 어떤 악기로 들어 볼까요?</strong>
          <small>여기서 고른 악기는 완성곡의 가락 악기로도 이어져요.</small>
        </div>
        <div className="preview-instrument-options">
          {QUICK_PREVIEW_INSTRUMENTS.map((instrument) => (
            <button key={instrument.id} type="button" data-testid={`preview-instrument-${instrument.id}`}
              className={selectedInstrumentId === instrument.id ? "active" : ""}
              aria-pressed={selectedInstrumentId === instrument.id}
              onClick={() => setSelectedInstrumentId(instrument.id)}>
              <span>{instrument.icon}</span><strong>{instrument.name}</strong>
            </button>
          ))}
          <label className="preview-instrument-more">
            <span>더 많은 악기</span>
            <select data-testid="preview-instrument-more-select"
              aria-label="더 많은 악기 중에서 선택"
              value={MORE_PREVIEW_INSTRUMENTS.some((instrument) => instrument.id === selectedInstrumentId)
                ? selectedInstrumentId : ""}
              onChange={(event) => event.target.value && setSelectedInstrumentId(event.target.value)}>
              <option value="">악기를 골라 보세요.</option>
              {MORE_PREVIEW_INSTRUMENTS.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>{instrument.icon} {instrument.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  }

  async function playWholeSong(startMeasureIndex = 0) {
    const playable = measures.slice(startMeasureIndex).flatMap((measure, relativeIndex) => measure.notes ? [{
      notes: measure.notes, harmony: measure.story, chords: measure.chords, effects: measure.effects,
      measureIndex: startMeasureIndex + relativeIndex
    }] : []);
    if (playable.length === 0) return;
    const duration = await playComposition(playable, selectedInstrumentId, bpm, accompanimentReady ? {
      styleId: accompanimentStyleId,
      instrumentIds: accompanimentInstrumentIds
    } : undefined);
    if (duration === null) return;
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
    await stopPlayback();
    resetPlaybackUi();
  }

  function toggleWholeSong(startMeasureIndex = activeIndex) {
    if (songPlaybackState === "idle") void playWholeSong(startMeasureIndex);
    else if (songPlaybackState === "playing") void pauseWholeSong();
    else resumeWholeSong();
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
      measureIndex: activeIndex
    }], selectedInstrumentId, bpm, accompanimentReady ? {
      styleId: accompanimentStyleId,
      instrumentIds: accompanimentInstrumentIds
    } : undefined);
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
        ? { ...note, pitch: Math.max(48, Math.min(84, note.pitch + amount)) }
        : note)
    }));
  }

  function moveNotePitch(id: string, value: number) {
    updateActiveMeasure((measure) => ({
      ...measure,
      candidateId: "custom",
      candidateName: "직접 다듬은 가락",
      notes: replaceNote(measure.notes ?? [], id, (note) => note.pitch === null ? note : { ...note, pitch: value })
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
      setEditStatus("첫 음표를 누른 뒤 Shift를 누르고 마지막 음표를 골라 주세요.");
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
    if (validation?.state !== "exact") return;
    if (activeIndex < measures.length - 1) {
      setActiveIndex(activeIndex + 1);
      const next = measures[activeIndex + 1];
      setSelectedNoteId(next.notes?.[0]?.id ?? "");
      setSelectedNoteIds(next.notes?.[0] ? [next.notes[0].id] : []);
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
        offsetBeats: Math.min(capacity - 0.01, measure.effects.length * 0.5)
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
    setShowArrangement(true);
    setCompletionCelebration(true);
    window.setTimeout(() => document.querySelector("#arrangement")?.scrollIntoView({ behavior: "smooth" }), 50);
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
      instrumentId: selectedInstrumentId,
      accompanimentStyleId,
      accompanimentInstrumentIds,
      bpm,
      lyrics,
      measures: printableMeasures.map(({ candidateName, notes, effects }) => ({ candidateName, notes, effects }))
    };
  }

  async function copyShareLink() {
    const composition = makeSharedComposition();
    if (!composition) {
      setShareStatus("곡 제목과 작곡가 이름을 먼저 적어 주세요.");
      return;
    }
    const url = buildShareUrl(composition, window.location);
    setGeneratedShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("공유 링크를 복사했어요!");
    } catch {
      setShareStatus("아래 링크를 길게 눌러 복사해 주세요.");
    }
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
      setShareStatus(isLocalHost(window.location)
        ? "녹음 링크를 복사했어요. localhost 주소는 스마트폰에서 바로 열리지 않을 수 있어요."
        : "스마트폰 녹음 링크를 복사했어요. QR을 스캔해도 바로 열 수 있어요.");
    } catch {
      setShareStatus(isLocalHost(window.location)
        ? "아래 링크를 길게 눌러 복사해 주세요. localhost 주소는 스마트폰에서 바로 열리지 않을 수 있어요."
        : "아래 링크를 길게 눌러 복사하거나 QR을 스캔해 주세요.");
    }
  }

  async function exportPdf(includeAccompaniment = false) {
    if (!songTitle.trim() || !creatorName.trim()) {
      setShareStatus("PDF에 넣을 곡 제목과 작곡가 이름을 먼저 적어 주세요.");
      return;
    }
    setExportingPdf(true);
    setPdfIncludeAccompaniment(includeAccompaniment);
    setShareStatus(includeAccompaniment ? "반주가 포함된 A4 악보를 만들고 있어요..." : "A4 악보를 만들고 있어요...");
    try {
      // The hidden PDF sheet must re-render after the selected layout changes.
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      await document.fonts.ready;
      await waitForVexScoreRender();
      await document.fonts.ready;
      const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-pdf-page]"));
      if (pages.length === 0) return;
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"), import("jspdf")
      ]);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      for (let index = 0; index < pages.length; index += 1) {
        const canvas = await html2canvas(pages[index], { scale: 2, backgroundColor: "#ffffff", logging: false });
        if (index > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(canvas.toDataURL("image/jpeg", .94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
      }
      const safeTitle = songTitle.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "마음멜로디";
      pdf.save(`${safeTitle}${includeAccompaniment ? "-반주포함" : ""}.pdf`);
      setShareStatus(includeAccompaniment ? "반주 포함 A4 PDF 악보를 저장했어요!" : "A4 PDF 악보를 저장했어요!");
    } catch (error) {
      console.error(error);
      setShareStatus("PDF를 만드는 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function exportBackingMp3() {
    if (!allValid || printableMeasures.length !== songLength) {
      setShareStatus("먼저 모든 마디를 정확한 박자로 완성해 주세요.");
      return;
    }
    if (exportingBacking) return;
    setExportingBacking(true);
    setShareStatus("인트로와 아웃트로가 들어간 반주 음악을 만들고 있어요.");
    const playable = measures.flatMap((measure, index) => measure.notes ? [{
      notes: measure.notes,
      harmony: measure.story,
      chords: measure.chords,
      effects: measure.effects,
      measureIndex: index
    }] : []);
    try {
      const blob = await exportBackingCompositionMp3(playable, selectedInstrumentId, bpm, {
        styleId: accompanimentStyleId,
        instrumentIds: accompanimentInstrumentIds
      });
      if (!blob) {
        setShareStatus("다른 연주나 녹음이 끝난 뒤에 다시 저장해 주세요.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = safeSongFileName("mp3").replace(/\.mp3$/i, "-반주음악.mp3");
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setShareStatus("반주 음악 MP3를 저장했어요.");
    } catch (error) {
      console.error(error);
      setShareStatus("반주 음악을 만드는 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setExportingBacking(false);
    }
  }

  function currentProjectDraft(): SavedDraft {
    return {
      version: 1,
      updatedAt: Date.now(),
      sourceHash,
      title: songTitle,
      description: songDescription,
      creator: creatorName,
      originalCreator,
      presetId: selectedPresetId,
      meter,
      songLength,
      instrumentId: selectedInstrumentId,
      accompanimentStyleId,
      accompanimentInstrumentIds,
      bpm,
      lyrics,
      measures: measures.map(({ candidateId, candidateName, notes, effects }) => ({ candidateId, candidateName, notes, effects })),
      showArrangement
    };
  }

  function saveProjectFile() {
    const blob = new Blob([JSON.stringify(currentProjectDraft(), null, 2)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeSongFileName("maeum-melody.txt");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShareStatus("나중에 다시 고칠 수 있는 작품 파일을 저장했어요.");
  }

  function startNewProject() {
    if (completedCount > 0 && !window.confirm("새 곡을 시작할까요? 지금 만든 곡은 작품 파일로 저장한 뒤 다시 불러올 수 있어요.")) return;
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    window.location.assign(`${window.location.pathname}?start=new`);
  }

  async function loadProjectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1_500_000) {
      setShareStatus("작품 파일이 너무 커요. 1.5MB 이하의 작품 파일을 골라 주세요.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isSavedDraft(parsed)) throw new Error("invalid-project");
      if (completedCount > 0 && !window.confirm("지금 만든 곡 대신 불러온 작품을 열까요? 현재 곡은 자동 저장되어 있어요.")) return;
      const project = parsed;
      const preset = findHarmonyPreset(project.presetId);
      historyCurrent.current = null;
      setUndoStack([]);
      setRedoStack([]);
      setSelectedPresetId(preset.id);
      setMeter(project.meter);
      setSongLength(project.songLength);
      setMeasures(compositionFromDraft(project, preset));
      setSelectedInstrumentId(findInstrument(project.instrumentId).id);
      setAccompanimentStyleId(project.accompanimentStyleId ?? "arpeggio");
      setAccompanimentInstrumentIds(uniqueAccompanimentInstrumentIds(project.accompanimentInstrumentIds ?? ["piano"]));
      setBpm(project.bpm ?? 96);
      setShowArrangement(project.showArrangement);
      setSongTitle(project.title);
      setSongDescription(project.description ?? "");
      setCreatorName(project.creator);
      setOriginalCreator(project.originalCreator);
      setSourceHash(project.sourceHash);
      setActiveIndex(0);
      setSelectedNoteId("");
      setSelectedNoteIds([]);
      setEditStatus("");
      writeDraft(window.localStorage, project);
      setShareStatus("작품 파일을 불러왔어요. 이어서 고쳐 보세요!");
    } catch (error) {
      console.error(error);
      setShareStatus("마음멜로디 작품 파일인지 확인해 주세요.");
    }
  }

  function safeSongFileName(extension: string): string {
    const safeTitle = songTitle.trim().replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "maeum-melody";
    return `${safeTitle}.${extension}`;
  }

  async function recordSongMp3() {
    if (!allValid || printableMeasures.length !== songLength) {
      setRecordingStatus("먼저 모든 마디를 정확한 박자로 완성해 주세요.");
      return;
    }
    if (recordingSong) return;
    setRecordingSong(true);
    setKaraokeOpen(true);
    setKaraokePhase("intro");
    setKaraokeCount(null);
    setMicrophoneLevel(0);
    setKaraokeHighlight({ section: "intro", measureIndex: null, noteId: null });
    setRecordingStatus("녹음을 준비하고 있어요.");
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
      const result = await recordKaraokeComposition(playable, selectedInstrumentId, bpm, {
        styleId: accompanimentStyleId,
        instrumentIds: accompanimentInstrumentIds
      }, {
        onStatus: setRecordingStatus,
        onInputLevel: setMicrophoneLevel,
        onPhase: setKaraokePhase,
        onCount: setKaraokeCount,
        onHighlight: setKaraokeHighlight
      }, {
        beats: meter.beats,
        unitBeats: 4 / meter.beatUnit
      });
      if (!result) {
        setRecordingStatus("다른 연주가 끝난 뒤에 다시 녹음해 주세요.");
        return;
      }
      const url = URL.createObjectURL(result.blob);
      setRecordingDownloadUrl(url);
      setRecordedAudioBuffer(result.audioBuffer);
      setRecordedVocalBuffer(result.vocalAudioBuffer);
      setRecordedBackingBuffer(result.backingAudioBuffer);
      setAnalyzingPitch(true);
      // Run after the recording UI has settled so pitch checking never makes
      // the final recording feel slow. This is a gentle review, not a grade.
      window.setTimeout(() => {
        try {
          setPitchReviews(reviewRecordedPitch(result.audioBuffer, playable, result.introSeconds, 60 / bpm));
        } finally {
          setAnalyzingPitch(false);
        }
      }, 0);
      setRecordingStatus("녹음이 끝났어요. 미리 들어보고 보정한 뒤 저장해 주세요.");
      setRecordingStatus(`완료! 앞 ${Math.round(result.introSeconds)}초는 4마디 반주 인트로로 들어갔어요.`);
      setRecordingStatus("녹음이 끝났어요. 미리 들어보고 보정한 뒤 저장해 주세요.");
    } catch (error) {
      console.error(error);
      setKaraokePhase("error");
      setRecordingStatus(error instanceof Error ? error.message : "녹음 중 문제가 생겼어요. 마이크 권한을 확인해 주세요.");
    } finally {
      setRecordingSong(false);
    }
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
    if (!recordingDownloadUrl) return;
    const link = document.createElement("a");
    link.href = recordingDownloadUrl;
    link.download = safeSongFileName("mp3");
    link.click();
    setRecordingStatus("MP3 파일을 저장했어요.");
  }

  function karaokePhaseLabel(): string {
    if (karaokePhase === "intro") return "인트로 4마디";
    if (karaokePhase === "song") return "노래 녹음 중";
    if (karaokePhase === "outro") return "아웃트로 4마디";
    if (karaokePhase === "encoding") return "MP3 만드는 중";
    if (karaokePhase === "done") return "녹음 완료";
    if (karaokePhase === "error") return "녹음 확인 필요";
    return "녹음 준비";
  }

  return (
    <div className="app-shell">
      <input ref={projectFileInput} className="project-file-input" type="file"
        accept="text/plain,.txt,application/json,.json" onChange={(event) => void loadProjectFile(event)} />
      {showOpening && (
        <section className="opening-screen" aria-label="마음멜로디 시작 화면">
          <div className="opening-orb orb-one" />
          <div className="opening-orb orb-two" />
          <div className="opening-stars" aria-hidden="true">
            <span>♪</span><span>✦</span><span>♫</span><span>✧</span><span>♩</span><span>✦</span>
          </div>
          <div className="opening-score" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <div className="opening-card">
            <div className="opening-mark"><Music2 size={42} /></div>
            <span className="opening-kicker">나만의 멜로디 놀이터</span>
            <h1>마음멜로디</h1>
            <p>마음에 드는 가락을 고르고<br />나만의 노래를 완성해요.</p>
            <div className="opening-actions">
              <button type="button" className="opening-start action-button" onClick={() => {
                window.localStorage.removeItem(DRAFT_STORAGE_KEY);
                window.location.assign(`${window.location.pathname}?start=new`);
              }}>
                <WandSparkles size={20} /> 시작하기 <ArrowRight size={18} />
              </button>
              <button type="button" className="opening-continue action-button" disabled={!resumableDraft}
                onClick={() => setShowOpening(false)}>
                <Music2 size={19} /> 이어하기
              </button>
            </div>
            <small>{resumableDraft ? "저장한 노래를 이어서 만들 수 있어요." : "저장한 노래가 생기면 여기서 이어할 수 있어요."}</small>
          </div>
        </section>
      )}
      {!mobileRecordMode && <header className="topbar">
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
              <button type="button" role="menuitem" onClick={() => {
                setShowAppMenu(false);
                projectFileInput.current?.click();
              }}><FileUp size={16} /> 악보 불러오기</button>
            </div>}
          </div>
        </div>
        <div className="project-title">
          <span className="eyebrow">나의 첫 번째 노래</span>
          <strong>{selectedPreset.childName} · {songLength}마디</strong>
        </div>
        <div className="save-button" role="status" aria-live="polite" data-testid="save-status">{saveStatus}</div>
      </header>}

      {karaokeOpen && (
        <div className="karaoke-overlay" role="dialog" aria-modal="true" aria-label="노래 녹음 창">
          <section className="karaoke-window">
            <div className="karaoke-toolbar">
              <div>
                <span className={`karaoke-phase ${karaokePhase}`}>{karaokePhaseLabel()}</span>
                <h2>{songTitle || "나의 노래"}</h2>
                <p>{recordingStatus || "4마디 인트로 뒤에 노래를 불러 주세요."}</p>
                <div className="microphone-level" aria-label="마이크 입력 크기">
                  <span>마이크</span>
                  <i><b style={{ width: `${Math.round(microphoneLevel * 100)}%` }} /></i>
                  <em>{microphoneLevel < .12 ? "조금 더 가까이" : microphoneLevel > .86 ? "조금만 멀리" : "좋아요"}</em>
                </div>
                <div className="recording-tips" aria-label="녹음 도움말">
                  <span>🎧 이어폰을 써요</span>
                  <span>🎙️ 입에서 10~15cm</span>
                  <span>🤫 조용한 곳에서</span>
                </div>
              </div>
              <button type="button" className="karaoke-close" disabled={recordingSong}
                onClick={() => setKaraokeOpen(false)}>닫기</button>
            </div>

            <div className="karaoke-score" data-testid="karaoke-score-window">
              {karaokeCount !== null && <div className="karaoke-count">{karaokeCount}</div>}
              <div className={karaokePhase === "intro" ? "karaoke-system active" : "karaoke-system"}>
                <div className="karaoke-system-label">인트로 반주 4마디</div>
                <div className="karaoke-measure-row">
                  {karaokeIntroMeasures.map((measure, index) => (
                    <div key={`intro-${index}`} className="karaoke-backing-measure">
                      <span>{index + 1}마디</span>
                      <em>{measure.chords.join(" · ")}</em>
                      <ScoreMeasure notes={backingDisplayNotes(measure, meter, accompanimentStyleId, "intro", index)}
                        meter={meter} compact systemMeasure showSignature={index === 0}
                        playingNoteId={karaokeHighlight.section === "intro" && karaokeHighlight.measureIndex === index
                          ? karaokeHighlight.noteId : null} />
                      <small>반주만 듣고 준비해요</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className={karaokePhase === "song" ? "karaoke-system active" : "karaoke-system"}>
                <div className="karaoke-system-label">노래 부르는 부분</div>
                {Array.from({ length: Math.ceil(measures.length / 4) }, (_, rowIndex) => (
                  <div key={`song-row-${rowIndex}`} className="karaoke-measure-row">
                    {measures.slice(rowIndex * 4, rowIndex * 4 + 4).map((measure, columnIndex) => {
                      const measureIndex = rowIndex * 4 + columnIndex;
                      const active = karaokeHighlight.section === "song" && karaokeHighlight.measureIndex === measureIndex;
                      return (
                        <div key={`song-${measureIndex}`} className={active ? "karaoke-song-measure active" : "karaoke-song-measure"}>
                          <span>{measureIndex + 1}마디</span>
                          <em>{measure.chords.join(" · ")}</em>
                          <ScoreMeasure notes={measure.notes ?? []} meter={meter} compact systemMeasure
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

              <div className={karaokePhase === "outro" ? "karaoke-system active" : "karaoke-system"}>
                <div className="karaoke-system-label">아웃트로 반주 4마디</div>
                <div className="karaoke-measure-row">
                  {karaokeOutroMeasures.map((measure, index) => (
                    <div key={`outro-${index}`} className="karaoke-backing-measure">
                      <span>{index + 1}마디</span>
                      <em>{measure.chords.join(" · ")}</em>
                      <ScoreMeasure notes={backingDisplayNotes(measure, meter, accompanimentStyleId, "outro", index)}
                        meter={meter} compact systemMeasure showSignature={index === 0}
                        playingNoteId={karaokeHighlight.section === "outro" && karaokeHighlight.measureIndex === index
                          ? karaokeHighlight.noteId : null} />
                      <small>마지막 반주 뒤 자동 저장돼요</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {recordingDownloadUrl && (
              <div className="karaoke-post-panel">
                <h3>녹음 미리듣기와 보정</h3>
                <audio ref={recordingPreviewRef} key={recordingDownloadUrl} controls src={recordingDownloadUrl}
                  onTimeUpdate={(event) => {
                    const now = event.currentTarget.currentTime;
                    setReviewPlaybackNoteId(pitchReviews.find((review) => now >= review.startSeconds && now < review.endSeconds)?.noteId ?? null);
                  }}
                  onEnded={() => setReviewPlaybackNoteId(null)} />
                <p className="local-preview-note">미리듣기 파일은 서버에 올리지 않고 이 브라우저 안에서만 임시로 만들어져요.</p>
                <label className="backing-preview-volume">
                  <span><strong>미리듣기 반주 크기</strong><b>{Math.round(previewBackingVolume * 100)}%</b></span>
                  <input type="range" min="0.25" max="1.6" step="0.05" value={previewBackingVolume}
                    disabled={!recordedVocalBuffer || !recordedBackingBuffer || mixingPreview}
                    onChange={(event) => void updatePreviewBackingVolume(Number(event.target.value))} />
                  <small>{mixingPreview ? "반주 크기를 바꾸고 있어요..." : "내 목소리는 그대로 두고 반주만 조절해 보세요."}</small>
                </label>
                <section className="pitch-review" aria-live="polite">
                  <div>
                    <strong>가락 맞춰 보기</strong>
                    <span>{analyzingPitch ? "내 노래의 음높이를 살펴보고 있어요..." : "빨간 음표는 목표 음과 차이가 컸던 곳이에요."}</span>
                  </div>
                  {!analyzingPitch && pitchReviewByMeasure.length === 0 && (
                    <p>크게 벗어난 음을 찾지 못했어요. 소리가 작았던 곳은 다음에 한 번 더 들어 보세요.</p>
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
                      disabled={processingRecording}
                      onClick={() => void applyPostProcessPreset(id as KaraokePostProcessPreset)}>
                      {label}
                    </button>
                  ))}
                </div>
                <button type="button" className="karaoke-download" disabled={processingRecording}
                  onClick={saveProcessedRecording}>
                  {processingRecording ? "보정 중..." : "이 느낌으로 MP3 저장"}
                </button>
              </div>
            )}
            {false && recordingDownloadUrl && (
              <a className="karaoke-download" href={recordingDownloadUrl} download={safeSongFileName("mp3")}>
                완성된 MP3 다시 저장하기
              </a>
            )}
          </section>
        </div>
      )}

      {mobileRecordMode && (
        <main className="mobile-record-main">
          <section className="mobile-record-panel" aria-label="스마트폰 녹음 전용 화면">
            <span className="mobile-record-kicker"><Smartphone size={18} /> 스마트폰 녹음</span>
            <h1>{songTitle || "나의 노래"}</h1>
            <p>
              데스크탑에서 완성한 곡을 스마트폰 마이크로 녹음합니다. 이어폰을 끼면 반주가 다시 마이크에 들어가는 소리를 줄일 수 있어요.
            </p>
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
            <button type="button" className="mobile-record-start action-button" disabled={recordingSong || !allValid}
              onClick={() => void recordSongMp3()}>
              <Mic2 size={24} /> {recordingSong ? "녹음 중..." : "녹음 시작"}
            </button>
            {recordingStatus && <p className="mobile-record-status" role="status">{recordingStatus}</p>}
            {recordingDownloadUrl && (
              <button type="button" className="mobile-record-save action-button" onClick={saveProcessedRecording}>
                MP3 저장
              </button>
            )}
          </section>
        </main>
      )}

      {false && <nav className="stepper" aria-label="작곡 단계">
        {["화음 이야기", "박자와 길이", `${songLength}마디 가락`, "악기", "가사", "완성"].map((label, index) => (
          <div className={index < activeStep ? "step done" : index === activeStep ? "step active" : "step"} key={label}>
            <span>{index < activeStep ? "✓" : index + 1}</span>
            <small>{label}</small>
          </div>
        ))}
      </nav>}

      {!mobileRecordMode && <main>
        {false && <section className="intro m1-intro">
          <div>
            <span className="section-kicker">M2 · 100가지 화음 이야기</span>
            <h1>{songLength}마디의 음악 여행을 만들어요</h1>
            <p>화음 이야기와 곡 길이를 고른 뒤, 각 마디에 어울리는 가락을 선택하세요.</p>
          </div>
          <div className="progress-card">
            <span>완성한 마디</span>
            <strong>{completedCount}<small>/{songLength}</small></strong>
            <div><i style={{ width: `${completedCount / songLength * 100}%` }} /></div>
          </div>
        </section>}

        <section className="preset-chooser" aria-labelledby="preset-heading">
          <div className="compact-heading">
            <span className="number-badge">1</span>
            <div><h2 id="preset-heading">화음 이야기를 골라요</h2><p>어려운 이름 대신 느낌과 장면으로 고를 수 있어요.</p></div>
          </div>
          <div className="preset-picker">
            <label>
              <span>100가지 이야기</span>
              <select data-testid="harmony-preset-select" value={selectedPresetId}
                onChange={(event) => choosePreset(event.target.value)}>
                {HARMONY_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.id} · {preset.childName}</option>
                ))}
              </select>
            </label>
            <div className="preset-summary">
              <span>{selectedPreset.category} · {selectedPreset.difficulty}</span>
              <strong>{selectedPreset.childName}</strong>
              <p>{selectedPreset.mood}</p>
            </div>
          </div>
        </section>

        <section className="meter-chooser" aria-labelledby="meter-heading">
          <div className="compact-heading">
            <span className="number-badge">2</span>
            <div><h2 id="meter-heading">노래의 박자를 골라요</h2><p>박자를 바꾸면 작곡이 새로 시작돼요.</p></div>
          </div>
          <div className="meter-options">
            {SUPPORTED_METERS.map((item) => {
              const key = meterKey(item);
              const detail = meterDetails[key];
              const active = key === meterKey(meter);
              return (
                <button key={key} type="button" data-testid={`meter-${item.beats}-${item.beatUnit}`}
                  className={active ? "meter-option active" : "meter-option"}
                  aria-pressed={active} onClick={() => chooseMeter(item)}>
                  <strong>{key}</strong><span>{detail.name}</span><small>{detail.clap}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="length-chooser" aria-labelledby="length-heading">
          <div className="compact-heading">
            <span className="number-badge">3</span>
            <div><h2 id="length-heading">노래 길이를 골라요</h2><p>처음에는 8마디, 긴 이야기는 12·16마디가 좋아요.</p></div>
          </div>
          <div className="length-options">
            {([8, 12, 16] as const).map((length) => (
              <button key={length} type="button" data-testid={`length-${length}`}
                className={songLength === length ? "length-option active" : "length-option"}
                aria-pressed={songLength === length} onClick={() => chooseLength(length)}>
                <strong>{length}마디</strong><span>{length / 4}개의 이야기 묶음</span>
              </button>
            ))}
          </div>
        </section>

        <div className="composition-workspace">
          <div className="score-workspace-column">
        <section className="composition-section" aria-labelledby="composition-heading">
          <div className="compact-heading timeline-heading">
            <span className="number-badge">4</span>
            <div><h2 id="composition-heading">{songLength}마디를 차례로 채워요</h2><p>색깔은 마디마다 어울리는 화음 느낌을 알려줘요.</p></div>
            <div className="timeline-actions">
              <label className="tempo-control">
                <span>빠르기</span>
                <input type="range" min="40" max="200" step="2" value={bpm}
                  data-testid="tempo-slider" disabled={isAnyPlaying}
                  onChange={(event) => setBpm(Number(event.target.value))} />
                <span className="tempo-number-wrap">
                  <input type="number" min="40" max="200" step="2" value={bpm} data-testid="tempo-number"
                    aria-label="빠르기 BPM 숫자 입력" disabled={isAnyPlaying}
                    onChange={(event) => setBpm(Math.max(40, Math.min(200, Number(event.target.value) || 40)))} />
                  <strong>BPM</strong>
                </span>
              </label>
              <button type="button" className="ghost-button action-button" data-testid="fill-recommended" onClick={fillRecommended}>
                <WandSparkles size={17} /> 추천으로 모두 채우기
              </button>
              <button type="button" className="ghost-button action-button" data-testid="play-song-from-start"
                disabled={completedCount === 0 || isAnyPlaying}
                onClick={() => void playWholeSong(0)}>
                <PlayIcon /> 처음부터 듣기
              </button>
              <button type="button" className="song-play action-button" data-testid="toggle-song-playback"
                disabled={completedCount === 0 || playingId !== null || playingMeasure ||
                  (songPlaybackState === "idle" && !activeMeasure.notes)}
                onClick={() => toggleWholeSong()}>
                <PlayIcon playing={songPlaybackState === "playing"} />
                {songPlaybackState === "paused" ? "다시 재생" :
                  songPlaybackState === "playing" ? `일시정지${playingMeasureIndex !== null ? ` · ${playingMeasureIndex + 1}마디` : ""}` : "이어 듣기"}
              </button>
              {playingSong && <button type="button" className="song-stop action-button" data-testid="stop-song-playback"
                onClick={() => void stopWholeSong()}><Square size={14} fill="currentColor" aria-hidden="true" /> 중지</button>}
            </div>
          </div>

          <div className="measure-timeline">
            {measures.map((measure, index) => (
              <div className="measure-cell" key={index}>
                <button type="button" data-testid={`measure-${index + 1}`}
                  data-playing={playingMeasureIndex === index ? "true" : undefined}
                  aria-current={playingMeasureIndex === index ? "true" : undefined}
                  aria-label={`${index + 1}마디, ${chordDegreeSequence(measure.chords)}${measure.notes ? ", 가락 선택 완료" : ", 가락 선택 전"}`}
                  className={`measure-slot ${measure.story}${activeIndex === index ? " active" : ""}${measure.notes ? " completed" : ""}${recentCompletedIndex === index ? " just-completed" : ""}${playingMeasureIndex === index ? " playing" : ""}`}
                  onClick={() => {
                    setActiveIndex(index);
                    setSelectedNoteId(measure.notes?.[0]?.id ?? "");
                    setSelectedNoteIds(measure.notes?.[0] ? [measure.notes[0].id] : []);
                    setEditStatus("");
                  }}>
                  <span className="measure-slot-header">
                    <strong>{index + 1}마디</strong>
                    <span className="measure-slot-meta">
                      {measure.notes && <span className="measure-status-icon" aria-label="가락 선택 완료"><CheckCircle2 size={13} /></span>}
                      <span className="degree-label">{chordDegreeSequence(measure.chords)}</span>
                    </span>
                  </span>
                  <ScoreMeasure notes={measure.notes ?? []} meter={meter} compact wide
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
                  {!measure.notes && <span className="empty-score-label">가락을 골라 주세요</span>}
                </button>
                <div className={lyrics[index]?.trim() ? "measure-lyric filled" : "measure-lyric"}
                  onFocus={() => setActiveIndex(index)}>
                  <span>{index + 1}마디 · 음표마다 한 글자</span>
                  <NoteLyrics notes={measure.notes ?? []} meter={meter} measureIndex={index} compact wide
                    showSignature={index % 4 === 0}
                    notePositions={timelineLyricNotePositions[index]}
                    onChange={(noteId, value) => updateNoteLyric(index, noteId, value)} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {renderPreviewInstrumentPicker()}

        <section className="story-focus">
          <div className="focus-index">{activeIndex + 1}</div>
          <div>
            <span>지금 만드는 마디</span>
            <h2>{activeIndex + 1}마디 · {activeMeasure.storyHint}</h2>
          </div>
          <div className={`focus-story ${activeMeasure.story}`}>
            <span>{storyInfo[activeMeasure.story].icon}</span>
            <div><strong>{storyInfo[activeMeasure.story].label}</strong><small>{storyInfo[activeMeasure.story].description}</small></div>
          </div>
        </section>
        {activeMeasure.notes && validation?.state === "exact" && (
          <SoundEffectEditor measureIndex={activeIndex} capacity={capacity} events={activeMeasure.effects}
            onAdd={addSoundEffect} onMove={moveSoundEffect} onRemove={removeSoundEffect} />
        )}
          </div>

        <section className="candidate-section candidate-sidebar">
          <div className="section-heading">
            <div>
              <span className={`dot ${activeMeasure.story}`} />
              <h2>이 마디에 어울리는 가락</h2>
              <p>{meterKey(meter)}박자에 딱 맞는 {MELODY_CANDIDATE_COUNT}가지를 준비했어요.</p>
            </div>
            <span className="count-pill">{activeIndex + 1}/{songLength} 마디</span>
          </div>
          <div className="candidate-priority-note">
            <div>
              <strong>{showMoreCandidates ? "모든 가락 보기" : "지금 마디에 추천하는 가락 6개"}</strong>
              <span>{activeIndex === 0 ? "노래의 시작을 또렷하게 열어 주는 가락이에요." :
              activeIndex === songLength - 1 ? "노래를 자연스럽게 마무리하는 가락이에요." :
                "앞 마디와 부드럽게 이어지고, 다음 마디로 나아가는 가락이에요."}</span>
            </div>
            <div className="candidate-view-toggle" role="group" aria-label="가락 보기 방식">
              <button type="button" className={!showMoreCandidates ? "active" : ""}
                onClick={() => setShowMoreCandidates(false)}>추천 6개</button>
              <button type="button" className={showMoreCandidates ? "active" : ""}
                onClick={() => setShowMoreCandidates(true)}>전체 {MELODY_CANDIDATE_COUNT}개</button>
            </div>
          </div>

          <div className="preview-instrument-picker candidate-instrument-picker" aria-label="가락 미리듣기 악기 선택">
            <div>
              <span className="section-kicker">먼저 소리를 골라요</span>
              <strong>가락을 어떤 악기로 들어 볼까요?</strong>
              <small>여기서 고른 악기는 완성곡의 가락 악기로도 이어져요.</small>
            </div>
            <div className="preview-instrument-options">
              {QUICK_PREVIEW_INSTRUMENTS.map((instrument) => (
                <button key={instrument.id} type="button" data-testid={`preview-instrument-${instrument.id}`}
                  className={selectedInstrumentId === instrument.id ? "active" : ""}
                  aria-pressed={selectedInstrumentId === instrument.id}
                  onClick={() => setSelectedInstrumentId(instrument.id)}>
                  <span>{instrument.icon}</span><strong>{instrument.name}</strong>
                </button>
              ))}
              <label className="preview-instrument-more">
                <span>더 많은 악기</span>
                <select data-testid="preview-instrument-more-select"
                  aria-label="더 많은 악기 중에서 선택"
                  value={MORE_PREVIEW_INSTRUMENTS.some((instrument) => instrument.id === selectedInstrumentId)
                    ? selectedInstrumentId : ""}
                  onChange={(event) => event.target.value && setSelectedInstrumentId(event.target.value)}>
                  <option value="">악기를 골라 보세요</option>
                  {MORE_PREVIEW_INSTRUMENTS.map((instrument) => (
                    <option key={instrument.id} value={instrument.id}>{instrument.icon} {instrument.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {showMoreCandidates ? <div className="candidate-feeling-groups">
            {candidateFeelingGroups.map((group) => (
              <section className={`candidate-feeling-group ${group.id}`} key={group.id}>
                <header>
                  <div><strong>{group.label}</strong><span>{group.description}</span></div>
                  <small>{group.candidates.length}가지</small>
                </header>
                <div className="candidate-grid">
            {group.candidates.map((candidate) => (
              <article key={candidate.id}
                className={`candidate-card${activeMeasure.candidateId === candidate.id ? " selected" : ""}${playingId === candidate.id ? " previewing" : ""}`}
                data-playing={playingId === candidate.id ? "true" : undefined}
                onClick={() => chooseCandidate(candidate)}>
                <div className="card-top">
                  <div><strong>{candidate.name}</strong><span>{candidate.hint}</span></div>
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
            ))}
                </div>
              </section>
            ))}
          </div> : <div className="candidate-grid recommended-candidate-grid">
            {candidatePriority.slice(0, 6).map(renderCandidateCard)}
          </div>}
        </section>
        </div>

        <section className="editor-section">
          <div className="editor-copy">
            <span className="section-kicker">선택 사항 · 직접 다듬기</span>
            <h2>{activeIndex + 1}마디의 음표를 바꿔 보세요</h2>
            <p>음표를 위아래로 끌면 높이가 바뀌어요. 여러 음표는 첫 음표를 누른 뒤 Shift를 누르고 마지막 음표를 골라요.</p>
            <button className="listen-all action-button" type="button" disabled={!activeMeasure.notes || isAnyPlaying}
              onClick={() => void playActiveMeasure()}>
              <PlayIcon playing={playingMeasure} /> 이 마디 듣기
            </button>
            <div className="history-actions" aria-label="작곡 되돌리기">
              <button type="button" disabled={undoStack.length === 0} onClick={undoCompositionChange}><Undo2 size={16} /> 되돌리기</button>
              <button type="button" disabled={redoStack.length === 0} onClick={redoCompositionChange}><Redo2 size={16} /> 다시 하기</button>
            </div>
          </div>

          <div className={activeMeasure.notes ? "editor-card" : "editor-card empty-editor"}>
            {activeMeasure.notes ? (
              <>
                <ScoreMeasure notes={activeNotes} meter={meter}
                  playingNoteId={playingMeasure || playingMeasureIndex === activeIndex ? playingNoteId : null}
                  selectedNoteId={selectedNoteId} selectedNoteIds={selectedNoteIds}
                  onSelectNote={selectNote} onMoveNote={moveNotePitch} onMovePosition={moveNotePosition} />
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
                <div className="harmony-guide" aria-live="polite">
                  <span className="harmony-guide-title">화음 어울림</span>
                  <span className="fit-chord">● 딱 어울리는 음</span>
                  <span className="fit-passing">● 지나가는 음</span>
                  <span className="fit-color">● 색다른 음</span>
                  {selectedNote && selectedHarmonyFit && <strong className={`fit-${selectedHarmonyFit}`}>
                    {selectedHarmonyFit === "chord" ? "지금 고른 음은 이 화음에 딱 어울려요!" :
                      selectedHarmonyFit === "passing" ? "지금 고른 음은 다음 음으로 이어 주는 지나가는 음이에요." :
                        "지금 고른 음은 색다른 느낌을 주는 음이에요. 들어 보고 골라요."}
                  </strong>}
                </div>
                <div className="note-tools">
                  <div><span>고른 음표</span><strong>{selectedNoteIds.length > 1 ? `${selectedNoteIds.length}개 선택` : selectedNote ? pitchName(selectedNote.pitch) : "음표를 골라 주세요"}</strong></div>
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
                  <button type="button" className="danger" onClick={deleteNote}>×<span>지우기</span></button>
                  <button type="button" className="reset" data-testid="reset-measure" onClick={resetActiveMeasure}>↺<span>처음으로</span></button>
                  <button type="button" data-testid="copy-notes" disabled={selectedNoteIds.length === 0}
                    onClick={copySelectedNotes}>⧉<span>복사</span></button>
                </div>
                {editStatus && <p className="edit-status" role="status">{editStatus}</p>}
              </>
            ) : (
              <div className="empty-message"><span>♪</span><strong>먼저 가락을 하나 골라 주세요</strong><p>위의 스무 가지 카드를 눌러 시작할 수 있어요.</p></div>
            )}
          </div>
        </section>

        {showArrangement && (
          <section className="arrangement-section" id="arrangement" data-testid="arrangement-section">
            {completionCelebration && (
              <div className="completion-celebration" role="status">
                <span className="celebration-icon"><PartyPopper size={24} aria-hidden="true" /></span>
                <div>
                  <strong>{songLength}마디 가락을 완성했어요!</strong>
                  <span>이제 반주 스타일과 악기를 골라 나만의 노래를 더 풍성하게 만들어 봐요.</span>
                </div>
                <button type="button" onClick={() => setCompletionCelebration(false)} aria-label="완성 안내 닫기">
                  <X size={17} aria-hidden="true" /> 시작하기
                </button>
              </div>
            )}
            <div className="arrangement-heading">
              <div>
                <span className="section-kicker">M3 · 악기와 가사</span>
                <h2>내 노래에 어울리는 소리를 입혀요</h2>
                <p>피아노가 기본이에요. 다른 악기를 눌러 소리를 바꿀 수 있어요.</p>
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
                    onClick={() => void stopWholeSong()}><span aria-hidden="true">■</span> 중지</button>}
                </div>
              </div>
            </div>

            <div className="instrument-library-heading">
              <div><Music2 size={18} aria-hidden="true" /><strong>가락을 연주할 악기</strong></div>
              <span>한 가지 악기를 골라 노래의 중심 소리를 정해요.</span>
            </div>
            <div className="instrument-grid" aria-label="악기 선택">
              {INSTRUMENTS.map((instrument) => (
                <button key={instrument.id} type="button" data-testid={`instrument-${instrument.id}`}
                  className={selectedInstrumentId === instrument.id ? "instrument-card active" : "instrument-card"}
                  aria-pressed={selectedInstrumentId === instrument.id}
                  onClick={() => setSelectedInstrumentId(instrument.id)}>
                  <span className="instrument-icon">{instrument.icon}</span>
                  <span><strong>{instrument.name}</strong><small>{instrument.description}</small></span>
                  <em>{instrument.group} · 실제 샘플</em>
                </button>
              ))}
            </div>

            <section className="accompaniment-builder" aria-labelledby="accompaniment-heading">
              <div className="accompaniment-heading">
                <div>
                  <span className="section-kicker">자동 반주 만들기</span>
                  <h2 id="accompaniment-heading">노래 뒤에 어울리는 악기들을 붙여요</h2>
                  <p>리듬을 하나 고르고 여러 악기를 누르면 전체 듣기에서 함께 연주해요.</p>
                </div>
                <div className="accompaniment-summary">
                  <small>지금 반주</small>
                  <strong>{selectedAccompanimentStyle.name}</strong>
                  <span>{accompanimentInstrumentIds.length}개 악기</span>
                </div>
              </div>

              <div className="accompaniment-style-grid" aria-label="반주 스타일 선택">
                {ACCOMPANIMENT_STYLES.map((style) => (
                  <button key={style.id} type="button" data-testid={`accompaniment-style-${style.id}`}
                    className={accompanimentStyleId === style.id ? "accompaniment-style active" : "accompaniment-style"}
                    aria-pressed={accompanimentStyleId === style.id}
                    onClick={() => setAccompanimentStyleId(style.id)}>
                    <span>{style.alias}</span><strong>{style.name}</strong><small>{style.description}</small>
                  </button>
                ))}
              </div>

              <div className="ensemble-presets">
                <div><strong>빠른 악기 편성</strong><span>한 번에 골라도 되고 아래에서 하나씩 바꿔도 돼요.</span></div>
                {ENSEMBLE_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" data-testid={`ensemble-${preset.id}`}
                    className={activeEnsemblePresetId === preset.id ? "active" : ""}
                    aria-pressed={activeEnsemblePresetId === preset.id}
                    onClick={() => setAccompanimentInstrumentIds(uniqueAccompanimentInstrumentIds(preset.instrumentIds))}>
                    <strong>{preset.name}</strong><small>{preset.description}</small>
                  </button>
                ))}
              </div>

              <div className={`mixer-board${playingSong ? " playing" : ""}`} aria-label="현재 반주 트랙">
                <div className="mixer-board-heading">
                  <div><SlidersHorizontal size={18} aria-hidden="true" /><strong>지금 만드는 소리</strong></div>
                  <span>{1 + accompanimentInstrumentIds.length}개 트랙</span>
                </div>
                <div className="mixer-track melody-track">
                  <span className="mixer-track-icon">{selectedInstrument.icon}</span>
                  <span className="mixer-track-copy"><small>가락</small><strong>{selectedInstrument.name}</strong></span>
                  <span className="mixer-role">주인공</span>
                  <span className="mixer-level" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</span>
                  <Volume2 size={17} className="mixer-volume" aria-label="가락 소리 켜짐" />
                </div>
                {accompanimentInstrumentIds.map((instrumentId, trackIndex) => {
                  const instrument = findInstrument(instrumentId);
                  return (
                    <div className="mixer-track" key={`mixer-${instrument.id}`}>
                      <span className="mixer-track-icon">{instrument.icon}</span>
                      <span className="mixer-track-copy"><small>반주 {trackIndex + 1}</small><strong>{instrument.name}</strong></span>
                      <span className="mixer-role">{accompanimentInstrumentPart(instrument.id, trackIndex).label}</span>
                      <span className="mixer-level" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</span>
                      <button type="button" className="mixer-remove"
                        aria-label={`${instrument.name} 반주에서 빼기`}
                        onClick={() => toggleAccompanimentInstrument(instrument.id)}>
                        <X size={15} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
                {accompanimentInstrumentIds.length === 0 && (
                  <div className="mixer-empty"><Volume2 size={18} aria-hidden="true" /> 아래에서 반주 악기를 추가해 보세요.</div>
                )}
              </div>

              <div className="instrument-bank-heading">
                <strong>반주 트랙 추가</strong>
                <span>최대 {MAX_ACCOMPANIMENT_INSTRUMENTS}개까지 함께 연주할 수 있어요.</span>
              </div>

              <div className="accompaniment-instruments" aria-label="반주 악기 여러 개 선택">
                {INSTRUMENTS.map((instrument) => {
                  const active = accompanimentInstrumentIds.includes(instrument.id);
                  const blocked = !active && accompanimentInstrumentIds.length >= MAX_ACCOMPANIMENT_INSTRUMENTS;
                  return (
                    <button key={instrument.id} type="button"
                      data-testid={`accompaniment-instrument-${instrument.id}`}
                      className={active ? "accompaniment-instrument active" : "accompaniment-instrument"}
                      aria-pressed={active} disabled={blocked} onClick={() => toggleAccompanimentInstrument(instrument.id)}>
                      <span>{instrument.icon}</span><strong>{instrument.name}</strong><small>{active ? "함께 연주해요 ✓" : "반주에 더하기"}</small>
                    </button>
                  );
                })}
              </div>
              {accompanimentInstrumentIds.length === 0 &&
                <p className="accompaniment-warning">반주 악기를 하나 이상 골라 주세요. 지금은 가락만 연주돼요.</p>}
            </section>

            <div className="lyrics-heading">
              <div><span className="number-badge">♪</span><div><h2>음표마다 가사를 맞춰 적어요</h2><p>각 음표 아래 칸에 그 음으로 부를 한 글자를 적어요.</p></div></div>
              <strong>{lyrics.filter((lyric) => lyric.trim()).length}/{songLength}마디 입력</strong>
            </div>
            <div className="lyrics-grid">
              {measures.map((measure, index) => (
                <div key={index} className={lyrics[index].trim() ? "lyric-card filled" : "lyric-card"}>
                  <span>{index + 1}마디</span>
                  <ScoreMeasure notes={measure.notes ?? []} meter={meter} compact
                    onNoteLayout={(positions) => updateLyricNotePositions(index, positions)} />
                  <NoteLyrics notes={measure.notes ?? []} meter={meter} measureIndex={index} compact
                    notePositions={lyricNotePositions[index]}
                    onChange={(noteId, value) => updateNoteLyric(index, noteId, value)} />
                </div>
              ))}
            </div>

            <div className="publish-section">
              <div className="publish-heading">
                <div><span className="section-kicker">M4 · 저장과 공유</span><h2>내 악보를 세상에 보여 줘요</h2></div>
                <span>A4 PDF · 공유 링크 · 리메이크</span>
              </div>
              {originalCreator && (
                <div className="original-credit" data-testid="original-credit">
                  <span>원작자</span><strong data-testid="original-creator">{originalCreator}</strong>
                  <p>리메이크 곡에서도 이 표시는 지울 수 없어요.</p>
                </div>
              )}
              <div className="publish-fields">
                <label><span>곡 제목</span><input data-testid="song-title" value={songTitle} maxLength={60}
                  onChange={(event) => { setSongTitle(event.target.value); setShareStatus(""); }} /></label>
                <label><span>{originalCreator ? "리메이크 작곡가" : "작곡가"}</span>
                  <input data-testid="creator-name" value={creatorName} maxLength={40}
                    onChange={(event) => { setCreatorName(event.target.value); setShareStatus(""); }}
                    placeholder="이름이나 별명을 적어요" /></label>
              </div>
              <label className="song-description-field">
                <span>이 노래에 대한 이야기</span>
                <textarea data-testid="song-description" value={songDescription} maxLength={600} rows={4}
                  onChange={(event) => { setSongDescription(event.target.value); setShareStatus(""); }}
                  placeholder="왜 이 노래를 만들었는지, 어떤 장면이 떠오르는지, 가락이 주는 느낌을 자세히 적어 보세요." />
                <small>{songDescription.length}/600</small>
              </label>
              <div className="publish-actions">
                <button type="button" className="project-save-button action-button" data-testid="save-project-file"
                  onClick={saveProjectFile}>
                  <FileDown size={18} /> 작품 파일 저장
                </button>
                <button type="button" className="project-load-button action-button" data-testid="load-project-file"
                  onClick={() => projectFileInput.current?.click()}>
                  <FileUp size={18} /> 작품 파일 불러오기
                </button>
                <button type="button" className="pdf-button action-button" data-testid="export-pdf"
                  disabled={exportingPdf} onClick={() => void exportPdf(false)}>
                  <FileDown size={18} /> {exportingPdf ? "PDF 만드는 중..." : "A4 PDF 저장"}
                </button>
                <button type="button" className="pdf-button action-button" data-testid="export-pdf-with-accompaniment"
                  disabled={exportingPdf} onClick={() => void exportPdf(true)}>
                  <FileMusic size={18} /> {exportingPdf ? "PDF 만드는 중..." : "A4 PDF 저장(반주 포함)"}
                </button>
                <button type="button" className="backing-mp3-button action-button" data-testid="export-backing-mp3"
                  disabled={exportingBacking || !allValid} onClick={() => void exportBackingMp3()}>
                  <Music2 size={18} /> {exportingBacking ? "반주 음악 만드는 중..." : "반주 음악 저장"}
                </button>
                <button type="button" className="share-link-button action-button" data-testid="copy-share-link"
                  onClick={() => void copyShareLink()}><Share2 size={18} /> 공유 링크 복사</button>
                <button type="button" className="mobile-record-link-button action-button" data-testid="create-mobile-recording-link"
                  disabled={!allValid} onClick={() => void createMobileRecordingLink()}>
                  <QrCode size={18} /> 스마트폰 녹음 링크
                </button>
                <a className="samboard-share-button action-button" data-testid="open-samboard-share"
                  href="https://samboard.vivasam.com/studentEntry/?brdId=brd-0QZ60VWZ56TNW"
                  target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={18} /> 완성 노래 공유
                </a>
              </div>
              <div className="recording-actions">
                <button type="button" className="record-mp3-button action-button" data-testid="record-song-mp3"
                  disabled={recordingSong || !allValid} onClick={() => void recordSongMp3()}>
                  <Mic2 size={18} /> {recordingSong ? "녹음 중..." : "노래 녹음 MP3 저장"}
                </button>
              </div>
              {recordingStatus && <p className="recording-status" role="status">{recordingStatus}</p>}
              {recordingDownloadUrl && (
                <a className="recording-download" href={recordingDownloadUrl} download={safeSongFileName("mp3")}>
                  MP3 다시 저장하기
                </a>
              )}
              {shareStatus && <p className="share-status" role="status">{shareStatus}</p>}
              {generatedShareUrl && (
                <label className="share-url"><span>공유 주소</span>
                  <textarea data-testid="share-url" readOnly value={generatedShareUrl} rows={3} /></label>
              )}
              {mobileRecordingUrl && (
                <div className="mobile-record-qr" data-testid="mobile-recording-qr">
                  {canRenderMobileRecordingQr ? (
                    <QRCodeSVG value={mobileRecordingUrl} size={118} marginSize={2} level="L"
                      title="스마트폰 녹음 링크 QR 코드" />
                  ) : (
                    <div className="mobile-record-qr-fallback"><QrCode size={38} /></div>
                  )}
                  <div>
                    <strong>{canRenderMobileRecordingQr ? "스마트폰 카메라로 스캔" : "링크를 복사해서 열기"}</strong>
                    <p>{canRenderMobileRecordingQr
                      ? "폰에서는 작곡 도구 대신 녹음 버튼과 저장 화면만 열립니다."
                      : "곡 정보가 길어서 QR 대신 위 공유 주소를 스마트폰으로 보내 주세요."}</p>
                  </div>
                </div>
              )}
            </div>
            <p className="audio-credit">
              ?? ??: FluidR3 SoundFont(MIT) ? ??? ??? THIRD_PARTY_NOTICES.md
            </p>
            {allValid && printableMeasures.length === songLength && (
              <PdfScoreSheet title={songTitle} description={songDescription} creator={creatorName} originalCreator={originalCreator}
                meter={meter}
                measures={printableMeasures} includeAccompaniment={pdfIncludeAccompaniment} />
            )}
          </section>
        )}
      </main>}

      {!mobileRecordMode && <footer className="bottom-bar">
        <div>
          <span className="mini-label">{activeIndex + 1}번째 마디 · {meterKey(meter)}</span>
          <strong>{activeMeasure.candidateName ?? "아직 가락을 고르지 않았어요"}</strong>
          <span className={`status-dot ${validation?.state ?? "empty"}`} />
        </div>
        <button type="button" className="secondary action-button" disabled={activeIndex === 0}
          onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}><ArrowLeft size={18} /> 이전 마디</button>
        {activeIndex < measures.length - 1 ? (
          <button type="button" className="primary action-button" data-testid="next-measure"
            disabled={validation?.state !== "exact"} onClick={goNext}>
            다음 마디로 <ArrowRight size={18} />
          </button>
        ) : (
          <button type="button" className={allValid ? "primary action-button finish-ready" : "primary action-button"} data-testid="finish-composition" disabled={!allValid}
            onClick={openArrangement}>
            {songLength}마디 완성 <CheckCircle2 size={18} />
          </button>
        )}
      </footer>}
    </div>
  );
}
