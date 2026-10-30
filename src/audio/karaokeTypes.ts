import type { KaraokeGuideMode } from "./karaokeGuide";
import type { RecordingCaptureMode } from "./vocalCapture";

export type KaraokeRecordingResult = Readonly<{
  blob: Blob;
  audioBuffer: AudioBuffer;
  vocalAudioBuffer: AudioBuffer;
  backingAudioBuffer: AudioBuffer;
  durationSeconds: number;
  introSeconds: number;
  wavBlob?: Blob;
}>;

export type KaraokeHighlight = Readonly<{
  section: "intro" | "song" | "outro";
  measureIndex: number | null;
  noteId: string | null;
}>;

export type KaraokeRecordingCallbacks = Readonly<{
  guideMelodyMode?: KaraokeGuideMode;
  recordingMode?: RecordingCaptureMode;
  onStatus?: (message: string) => void;
  onInputLevel?: (level: number) => void;
  onPhase?: (phase: "intro" | "song" | "outro" | "encoding" | "done") => void;
  onCount?: (count: number | null) => void;
  onHighlight?: (highlight: KaraokeHighlight) => void;
}>;

export type KaraokeCountIn = Readonly<{ beats: number; unitBeats: number }>;
