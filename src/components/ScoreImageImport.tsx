import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  FileMusic,
  LoaderCircle,
  Minus,
  Plus,
  RotateCw,
  ScanLine,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { SavedDraft } from "../music/draft";
import { HomrLocalError, recognizeWithHomr } from "../music/homrClient";
import { validateMeasure } from "../music/meter";
import { rational, toNumber } from "../music/rational";
import {
  fillMeasureWithRest,
  readMusicScoreFile,
  recognizedScoreToDraft,
  scoreImportSummary,
  type RecognizedMeasure,
  type RecognizedScore
} from "../music/scoreImport";
import type { NoteEvent } from "../music/types";
import HomrSetupDialog from "./HomrSetupDialog";
import ScoreMeasure from "./ScoreMeasure";
import "./ScoreImageImport.css";
import "./ScoreImageImportCompletion.css";
import { withEditedPitch } from "../music/score";

type ScoreImageImportProps = Readonly<{
  baseDraft: SavedDraft;
  disabled?: boolean;
  onImport: (draft: SavedDraft) => void;
}>;

type ImportPhase = "setup" | "recognizing" | "review";

const durationChoices = [
  { label: "16분", numerator: 1, denominator: 4 },
  { label: "8분", numerator: 1, denominator: 2 },
  { label: "4분", numerator: 1, denominator: 1 },
  { label: "2분", numerator: 2, denominator: 1 },
  { label: "온음", numerator: 4, denominator: 1 }
] as const;

function isScoreDataFile(file: File): boolean {
  return /\.(musicxml|xml|mxl)$/i.test(file.name) || file.type.includes("xml");
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function confidenceText(confidence: RecognizedMeasure["confidence"]): string {
  if (confidence === "high") return "인식 좋음";
  if (confidence === "medium") return "확인 필요";
  return "꼭 확인";
}

function fileDescription(file: File): string {
  const size = file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)}KB` : `${(file.size / 1024 / 1024).toFixed(1)}MB`;
  return `${isScoreDataFile(file) ? "악보 파일" : file.type === "application/pdf" ? "PDF 악보" : "악보 사진"} · ${size}`;
}

function replaceMeasure(score: RecognizedScore, index: number, measure: RecognizedMeasure): RecognizedScore {
  return { ...score, measures: score.measures.map((item, itemIndex) => itemIndex === index ? measure : item) };
}

function replaceNote(measure: RecognizedMeasure, id: string, update: (note: NoteEvent) => NoteEvent): RecognizedMeasure {
  return { ...measure, notes: measure.notes.map((note) => note.id === id ? update(note) : note) };
}

export default function ScoreImageImport({ baseDraft, disabled = false, onImport }: ScoreImageImportProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>("setup");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [score, setScore] = useState<RecognizedScore | null>(null);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");
  const [showHomrSetup, setShowHomrSetup] = useState(false);
  const [recognitionSeconds, setRecognitionSeconds] = useState(0);

  const selectedMeasure = score?.measures[selectedMeasureIndex] ?? null;
  const selectedNote = selectedMeasure?.notes.find((note) => note.id === selectedNoteId) ?? null;
  const summary = useMemo(() => score ? scoreImportSummary(score) : null, [score]);
  const allExact = Boolean(score && summary?.exactMeasures === score.measures.length);

  useEffect(() => {
    if (!file || isScoreDataFile(file) || file.type === "application/pdf") {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase !== "recognizing" && !showHomrSetup) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, phase, showHomrSetup]);

  useEffect(() => {
    if (phase !== "recognizing") {
      setRecognitionSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setRecognitionSeconds(0);
    const timer = window.setInterval(() => {
      setRecognitionSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "review" || !dialogRef.current) return;
    if (typeof dialogRef.current.scrollTo === "function") {
      dialogRef.current.scrollTo({ top: 0, behavior: "auto" });
    } else {
      dialogRef.current.scrollTop = 0;
    }
  }, [phase]);

  function reset(nextOpen = false) {
    setOpen(nextOpen);
    setPhase("setup");
    setFile(null);
    setScore(null);
    setSelectedMeasureIndex(0);
    setSelectedNoteId("");
    setZoom(1);
    setRotation(0);
    setError("");
    setShowHomrSetup(false);
    setRecognitionSeconds(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  function chooseFile(nextFile: File | null) {
    if (!nextFile) return;
    if (nextFile.size > 7 * 1024 * 1024) {
      setError("악보 파일은 7MB 이하로 올려 주세요.");
      return;
    }
    setFile(nextFile);
    setScore(null);
    setZoom(1);
    setRotation(0);
    setError("");
    if (isPdfFile(nextFile)) {
      setError("사진으로 된 악보만 읽을 수 있어요. PDF는 원하는 페이지를 사진으로 저장한 뒤 다시 골라 주세요.");
      setShowHomrSetup(false);
    } else {
      setShowHomrSetup(!isScoreDataFile(nextFile));
    }
  }

  async function recognize() {
    if (!file) return;
    if (isPdfFile(file)) {
      setError("PDF에서 원하는 페이지를 사진으로 저장한 뒤 다시 골라 주세요.");
      return;
    }
    setPhase("recognizing");
    setError("");
    try {
      const scoreFile = isScoreDataFile(file) ? file : await recognizeWithHomr(file);
      const result = await readMusicScoreFile(scoreFile);
      setScore(result);
      setSelectedMeasureIndex(0);
      setSelectedNoteId(result.measures[0]?.notes[0]?.id ?? "");
      setPhase("review");
    } catch (recognitionError) {
      if (recognitionError instanceof HomrLocalError &&
        ["HOMR_NOT_READY", "LOCAL_SERVER_MISSING"].includes(recognitionError.code)) {
        setShowHomrSetup(true);
      }
      setError(recognitionError instanceof Error ? recognitionError.message : "악보를 인식하지 못했어요.");
      setPhase("setup");
    }
  }

  function selectMeasure(index: number) {
    const measure = score?.measures[index];
    setSelectedMeasureIndex(index);
    setSelectedNoteId(measure?.notes[0]?.id ?? "");
  }

  function updateSelectedNote(update: (note: NoteEvent) => NoteEvent) {
    if (!score || !selectedMeasure || !selectedNoteId) return;
    setScore(replaceMeasure(score, selectedMeasureIndex, replaceNote(selectedMeasure, selectedNoteId, update)));
  }

  function deleteSelectedNote() {
    if (!score || !selectedMeasure || !selectedNoteId || selectedMeasure.notes.length <= 1) return;
    const index = selectedMeasure.notes.findIndex((note) => note.id === selectedNoteId);
    const notes = selectedMeasure.notes.filter((note) => note.id !== selectedNoteId);
    setScore(replaceMeasure(score, selectedMeasureIndex, { ...selectedMeasure, notes }));
    setSelectedNoteId(notes[Math.min(index, notes.length - 1)]?.id ?? "");
  }

  function fillRest() {
    if (!score || !selectedMeasure) return;
    const next = fillMeasureWithRest(selectedMeasure, score.meter);
    setScore(replaceMeasure(score, selectedMeasureIndex, next));
    setSelectedNoteId(next.notes.at(-1)?.id ?? "");
  }

  function applyImport() {
    if (!score || !allExact) return;
    onImport(recognizedScoreToDraft(score, baseDraft));
    reset(false);
  }

  return (
    <>
      <button type="button" className="score-image-import-trigger" data-testid="score-import-open" disabled={disabled}
        onClick={() => reset(true)}>
        <ScanLine size={17} aria-hidden="true" /> 악보 가져오기
      </button>
      {open && createPortal(
        <div className="score-image-import-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && phase !== "recognizing") setOpen(false);
        }}>
          <section ref={dialogRef} className="score-image-import-dialog" role="dialog" aria-modal="true"
            aria-labelledby="score-import-heading">
            <header className="score-image-import-header">
              <div>
                <span><ScanLine size={15} /> 악보를 편곡 프로젝트로</span>
                <h2 id="score-import-heading">내 악보 가져오기</h2>
                <p>악보 사진이나 악보 파일을 골라 주세요.</p>
              </div>
              <button type="button" className="score-image-import-close" disabled={phase === "recognizing"}
                onClick={() => reset(false)} aria-label="악보 가져오기 닫기"><X size={20} /></button>
            </header>

            {phase !== "review" ? (
              <div className="score-image-import-setup">
                <div className="score-image-file-picker">
                  <input ref={inputRef} type="file" data-testid="score-import-file"
                    accept="image/png,image/jpeg,image/webp,application/pdf,.musicxml,.xml,.mxl"
                    disabled={phase === "recognizing"}
                    onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
                  <div className={`score-image-dropzone${previewUrl ? " has-image" : ""}`}>
                    {phase === "recognizing" ? (
                      <><LoaderCircle className="spin" size={42} />
                        <strong>{file && isScoreDataFile(file) ? "악보를 마디별로 읽고 있어요…" : "악보 사진을 읽고 있어요…"}</strong>
                        <span>{file && isScoreDataFile(file) ? "악보 구조와 박자 합계를 확인하고 있어요." :
                          `진행 중 · ${recognitionSeconds}초 · 보통 30초~2분 걸려요.`}</span></>
                    ) : previewUrl ? (
                      <img src={previewUrl} alt="가져올 악보 미리보기"
                        style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }} />
                    ) : (
                      <><Upload size={42} /><strong>악보 파일을 눌러 골라 주세요</strong>
                        <span>악보 사진 또는 악보 파일 · 최대 7MB</span></>
                    )}
                  </div>
                </div>
                {file && (
                  <div className="score-image-file-tools">
                    <FileMusic size={18} />
                    <span><strong>{file.name}</strong><small>{fileDescription(file)}</small></span>
                    {previewUrl && <>
                      <button type="button" onClick={() => setZoom((value) => Math.max(.6, value - .15))}
                        aria-label="미리보기 축소"><ZoomOut size={14} /></button>
                      <button type="button" onClick={() => setZoom((value) => Math.min(1.8, value + .15))}
                        aria-label="미리보기 확대"><ZoomIn size={14} /></button>
                      <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)}
                        aria-label="미리보기 회전"><RotateCw size={14} /></button>
                    </>}
                  </div>
                )}
                {phase === "recognizing" && file && !isScoreDataFile(file) && (
                  <div className="score-image-recognition-progress" data-testid="score-import-recognition-progress"
                    role="status" aria-live="polite">
                    <LoaderCircle className="spin" size={22} />
                    <span><strong>악보 읽는 중 · {recognitionSeconds}초</strong>
                      창을 닫지 마세요. 완료되면 자동으로 마디별 검수 화면이 열려요.</span>
                  </div>
                )}
                {file && !isScoreDataFile(file) && !isPdfFile(file) && (
                  <div className="score-image-loaded-status" data-testid="score-import-local-guide"
                    aria-live="polite"><Check size={16} />
                    <span><strong>사진을 불러왔어요</strong>이 컴퓨터 안에서 악보를 안전하게 읽어요.</span>
                    <button type="button" onClick={() => setShowHomrSetup(true)}>악보 읽기 준비 보기</button>
                  </div>
                )}
                <div className="score-image-photo-guide">
                  <strong>잘 읽히는 악보</strong><span>인쇄된 단선율</span><span>정면 촬영</span>
                  <span>그림자 없이 선명하게</span><span>한 번에 32마디 이하</span><span>내 컴퓨터에서만 처리</span>
                </div>
                {error && <p className="score-image-import-error" role="alert">{error}</p>}
                <footer>
                  <button type="button" onClick={() => reset(false)} disabled={phase === "recognizing"}>취소</button>
                  <button type="button" className="primary" data-testid="score-import-recognize"
                    disabled={!file || phase === "recognizing"}
                    onClick={() => void recognize()}>
                    {phase === "recognizing" ? <LoaderCircle className="spin" size={17} /> : <ScanLine size={17} />}
                    {phase === "recognizing" ? `인식 중 · ${recognitionSeconds}초` :
                      file && isScoreDataFile(file) ? "악보 읽기" : file && isPdfFile(file) ?
                        "PDF는 사진으로 저장해 주세요" : "악보 사진 읽기"}
                  </button>
                </footer>
              </div>
            ) : score && summary && (
              <div className="score-image-import-review">
                <div className="score-image-review-ready" role="status" data-testid="score-import-review-ready">
                  <Check size={23} />
                  <span><strong>악보 인식이 끝났어요</strong>
                    <small>{score.measures.length}마디를 찾았어요. 아래 결과를 확인한 뒤 편곡 프로젝트로 가져오세요.</small></span>
                </div>
                <div className="score-image-review-summary">
                  <button type="button" onClick={() => setPhase("setup")}><ArrowLeft size={14} /> 파일 다시 고르기</button>
                  <div><strong>{score.title}</strong>
                    <span className={`confidence confidence-${summary.confidence}`}>{confidenceText(summary.confidence)}</span></div>
                  <small>{score.measures.length}마디 · {score.meter.beats}/{score.meter.beatUnit}박자 ·
                    {score.keyFifths ? ` 조표 ${score.keyFifths > 0 ? "♯" : "♭"} ${Math.abs(score.keyFifths)}개 ·` : " 조표 없음 ·"}
                    박자 확인 {summary.exactMeasures}/{score.measures.length}</small>
                </div>
                {(score.warnings.length > 0 || summary.warningCount > 0) && (
                  <ul className="score-image-warnings">
                    {[...score.warnings, ...score.measures.flatMap((measure) => measure.warnings)].slice(0, 8)
                      .map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                  </ul>
                )}
                <div className="score-image-review-layout">
                  <aside className="score-image-original">
                    <strong>원본 악보</strong>
                    <div>{previewUrl ? <img src={previewUrl} alt="가져온 악보 원본"
                      style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }} /> :
                      <FileMusic size={62} aria-label="악보 파일" />}</div>
                    <p>인식 결과는 자동으로 확정되지 않아요. 원본과 음높이·쉼표·음가를 비교해 주세요.</p>
                  </aside>
                  <div>
                    <div className="score-image-measure-review">
                      {score.measures.map((measure, index) => {
                        const validation = validateMeasure(measure.notes, score.meter);
                        return (
                          <article key={index} role="button" tabIndex={0}
                            className={`score-image-measure-card confidence-${measure.confidence}${selectedMeasureIndex === index ? " selected" : ""}`}
                            onClick={() => selectMeasure(index)} onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") selectMeasure(index);
                            }}>
                            <header><strong>{index + 1}마디</strong><span>{confidenceText(measure.confidence)}</span>
                              <em className={`validation-${validation.state}`}>{validation.message}</em></header>
                            <ScoreMeasure notes={measure.notes} meter={score.meter} keyFifths={measure.keyFifths ?? score.keyFifths} compact />
                            {measure.warnings[0] && <small>{measure.warnings[0]}</small>}
                          </article>
                        );
                      })}
                    </div>
                    {selectedMeasure && (
                      <section className="score-image-note-editor">
                        <header><div><strong>{selectedMeasureIndex + 1}마디 고치기</strong>
                          <span>음표를 고른 뒤 높이와 길이를 확인하세요.</span></div>
                          <div>{validateMeasure(selectedMeasure.notes, score.meter).state === "short" &&
                            <button type="button" className="fill-rest" data-testid="score-import-fill-rest"
                              onClick={fillRest}>빈 박을 쉼표로 채우기</button>}</div>
                        </header>
                        <div className="score-image-note-chips">
                          {selectedMeasure.notes.map((note, index) => (
                            <button type="button" key={note.id} className={selectedNoteId === note.id ? "selected" : ""}
                              onClick={() => setSelectedNoteId(note.id)}>
                              {note.pitch === null ? "쉼" : note.pitch}<span>{toNumber(note.duration)}박</span>
                            </button>
                          ))}
                        </div>
                        {selectedNote ? (
                          <div className="score-image-note-controls">
                            <div className="pitch-controls">
                              <button type="button" disabled={selectedNote.pitch === null}
                                onClick={() => updateSelectedNote((note) => withEditedPitch(note, Math.max(0, (note.pitch ?? 0) - 1), selectedMeasure.keyFifths ?? score.keyFifths))}>
                                <Minus size={13} /> 반음
                              </button>
                              <button type="button" className="rest-toggle"
                                onClick={() => updateSelectedNote((note) => ({ ...note, pitch: note.pitch === null ? 60 : null, lyric: undefined }))}>
                                {selectedNote.pitch === null ? "가운데 도로 바꾸기" : "쉼표로 바꾸기"}
                              </button>
                              <button type="button" disabled={selectedNote.pitch === null}
                                onClick={() => updateSelectedNote((note) => withEditedPitch(note, Math.min(127, (note.pitch ?? 127) + 1), selectedMeasure.keyFifths ?? score.keyFifths))}>
                                <Plus size={13} /> 반음
                              </button>
                            </div>
                            <div className="duration-controls">
                              {durationChoices.map((choice) => (
                                <button type="button" key={choice.label}
                                  className={selectedNote.duration.numerator === choice.numerator &&
                                    selectedNote.duration.denominator === choice.denominator ? "selected" : ""}
                                  onClick={() => updateSelectedNote((note) => ({ ...note,
                                    duration: rational(choice.numerator, choice.denominator), dotted: undefined }))}>
                                  {choice.label}
                                </button>
                              ))}
                            </div>
                            <button type="button" className="delete-note" disabled={selectedMeasure.notes.length <= 1}
                              onClick={deleteSelectedNote}><Trash2 size={14} /> 삭제</button>
                          </div>
                        ) : <p>고칠 음표나 쉼표를 골라 주세요.</p>}
                      </section>
                    )}
                  </div>
                </div>
                <footer>
                  <button type="button" onClick={() => reset(false)}>취소</button>
                  <button type="button" className="primary" data-testid="score-import-apply"
                    disabled={!allExact} onClick={applyImport}>
                    <Check size={17} /> {allExact ? "검수 완료 · 편곡 프로젝트로 가져오기" : "모든 마디의 박자를 먼저 맞춰 주세요"}
                  </button>
                </footer>
              </div>
            )}
          </section>
        </div>,
        document.body
      )}
      <HomrSetupDialog open={open && showHomrSetup} onClose={() => setShowHomrSetup(false)}
        onReady={() => {
          setShowHomrSetup(false);
          void recognize();
        }} />
    </>
  );
}
