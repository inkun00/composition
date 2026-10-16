import { useEffect, useRef, useState } from "react";
import { measureCapacity, validateMeasure, type Meter } from "../music/meter";
import { rational, toNumber } from "../music/rational";
import { withEditedPitch } from "../music/score";
import type { NoteEvent } from "../music/types";
import { assignPracticeLyrics, createPracticeMeasures, makeLyricRhythm, PRACTICE_DURATIONS, type PracticeMeasure } from "./practiceModel";
import { emptyPracticeDraft, readPracticeDraft, writePracticeDraft, type PracticeDraft } from "./practiceStorage";
import { getPracticeScores, hasPracticeScoreData, MAX_PRACTICE_SCORES, normalizePracticeRhythmInstrument } from "./practiceScores";
import { normalizePracticePitch } from "./practicePitch";
import { isAvailablePracticeChord, normalizePracticeHarmony } from "./practiceHarmony";
import type { PracticeCreationMode } from "./practiceCreationMode";
import { usePracticeHistory } from "./usePracticeHistory";
import { practicePlacementRests } from "./practicePlacement";
import { unassignedLyricSyllables } from "./practiceLyricPlacement";

function isDraftComplete(draft: PracticeDraft) {
  const scores = getPracticeScores(draft);
  return scores.every((score) => score.measures.every((measure) => validateMeasure(measure.notes, draft.meter).state === "exact")) &&
    scores.some((score) => score.measures.some((measure) => measure.notes.some((note) => note.pitch !== null)));
}

function canDraftGoToMelody(draft: PracticeDraft) {
  if (draft.mode === "melody") return true;
  return draft.mode === "rhythm-melody" && isDraftComplete(draft) &&
    draft.measures.some((measure) => measure.notes.some((note) => note.pitch !== null));
}

export function usePracticeState() {
  const history = usePracticeHistory(readPracticeDraft);
  const { draft, latestDraft } = history;
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeScoreIndex, setActiveScoreIndex] = useState(0);
  const [step, setPracticeStep] = useState<"rhythm" | "melody">(() => draft.mode === "melody" ? "melody" : "rhythm");
  const [inputMode, setInputMode] = useState<"grid" | "score">("grid");
  const [selectedNoteId, setSelectedNote] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(true);
  const sequence = useRef(0);
  const latestStep = useRef(step);
  const selectedMeasure = useRef(activeIndex);
  const selectedScore = useRef(activeScoreIndex);
  const scores = getPracticeScores(draft);
  const active = scores[activeScoreIndex].measures[activeIndex];
  const editingStep = activeScoreIndex === 0 ? step : "rhythm";
  const scoreValidations = scores.map((score) => score.measures.map((measure) => validateMeasure(measure.notes, draft.meter)));
  const validations = scoreValidations[0];
  const complete = isDraftComplete(draft);
  const canGoToMelody = canDraftGoToMelody(draft);

  useEffect(() => {
    setSaved(writePracticeDraft(draft));
  }, [draft]);

  function updateDraft(change: (previous: PracticeDraft) => PracticeDraft) {
    history.update(change);
  }

  function changeStep(next: "rhythm" | "melody") {
    latestStep.current = next;
    setPracticeStep(next);
  }

  function rhythmLocked(scoreIndex = selectedScore.current) {
    return latestDraft.current.mode === "rhythm-melody" && latestStep.current === "melody" && scoreIndex === 0;
  }

  function rejectLockedRhythm(scoreIndex = selectedScore.current) {
    if (!rhythmLocked(scoreIndex)) return false;
    setNotice("리듬을 바꾸려면 리듬 만들기로 돌아가 주세요. 여기서는 음높이와 가사를 바꿀 수 있어요.");
    return true;
  }

  function updateMeasure(
    change: (measure: PracticeMeasure) => PracticeMeasure,
    targetIndex = selectedMeasure.current,
    scoreIndex = selectedScore.current
  ) {
    updateDraft((previous) => {
      const replace = (measures: PracticeMeasure[]) => measures.map((measure, index) => index === targetIndex ? change(measure) : measure);
      return scoreIndex === 0
        ? { ...previous, measures: replace(previous.measures) }
        : { ...previous, rhythmLayers: previous.rhythmLayers.map((layer, index) => index === scoreIndex - 1 ? { ...layer, measures: replace(layer.measures) } : layer) };
    });
    setNotice("");
  }

  function updateNotes(
    change: (notes: readonly NoteEvent[]) => readonly NoteEvent[],
    index = selectedMeasure.current,
    scoreIndex = selectedScore.current
  ) {
    updateMeasure((measure) => {
      const existingIds = new Set(measure.notes.map((note) => note.id));
      const availableLyrics = unassignedLyricSyllables(measure);
      let lyricIndex = 0;
      const notes = change(measure.notes).map((note) => {
        if (note.pitch === null || existingIds.has(note.id) || note.lyric !== undefined) return note;
        return { ...note, lyric: availableLyrics[lyricIndex++] ?? "" };
      });
      return { ...measure, notes };
    }, index, scoreIndex);
  }

  function activateMeasure(index: number, scoreIndex = selectedScore.current) {
    selectedScore.current = scoreIndex;
    selectedMeasure.current = index;
    setActiveScoreIndex(scoreIndex);
    setActiveIndex(index);
  }

  function noteOwner(id: string) {
    for (const [scoreIndex, score] of getPracticeScores(latestDraft.current).entries()) {
      const index = score.measures.findIndex((measure) => measure.notes.some((note) => note.id === id));
      if (index >= 0) return { index, scoreIndex };
    }
    return null;
  }

  function selectNote(id: string | null) {
    if (id === null) {
      setSelectedNote(null);
      return;
    }
    const owner = noteOwner(id);
    if (!owner) return;
    activateMeasure(owner.index, owner.scoreIndex);
    setSelectedNote(id);
  }

  function configure(change: Partial<Omit<PracticeDraft, "measures" | "rhythmLayers" | "version" | "mode">>) {
    updateDraft((previous) => ({ ...previous, ...change }));
    setNotice("");
  }

  function selectMeasure(index: number, scoreIndex = selectedScore.current) {
    if (!Number.isInteger(scoreIndex) || scoreIndex < 0 || scoreIndex >= getPracticeScores(latestDraft.current).length) return;
    if (!Number.isInteger(index) || index < 0 || index >= latestDraft.current.measures.length) return;
    activateMeasure(index, scoreIndex);
    setSelectedNote(null);
    setNotice("");
  }

  function selectScore(scoreIndex: number) {
    selectMeasure(selectedMeasure.current, scoreIndex);
  }

  function restoreHistory(next: PracticeDraft | null) {
    if (!next) return;
    const scoreIndex = Math.min(selectedScore.current, getPracticeScores(next).length - 1);
    const index = Math.min(selectedMeasure.current, next.measures.length - 1);
    activateMeasure(index, scoreIndex);
    setSelectedNote(null);
    changeStep(next.mode === "melody" ? "melody"
      : latestStep.current === "melody" && canDraftGoToMelody(next) ? "melody" : "rhythm");
    setNotice("");
  }

  function undo() { restoreHistory(history.undo()); }
  function redo() { restoreHistory(history.redo()); }

  function addRhythmScore() {
    const previous = latestDraft.current;
    if (previous.mode === "melody") return;
    if (rejectLockedRhythm(0)) return;
    const scoreIndex = previous.rhythmLayers.length + 1;
    if (scoreIndex >= MAX_PRACTICE_SCORES) {
      setNotice("악보는 최대 3개까지 함께 연주할 수 있어요.");
      return;
    }
    const id = `practice-layer-${Date.now()}-${sequence.current++}`;
    const instrumentId = scoreIndex === 1 ? "beat:clap" : "beat:shaker";
    const measures = createPracticeMeasures(previous.measures.length).map((measure, index) => ({ ...measure, id: `${id}-measure-${index + 1}` }));
    updateDraft((draft) => ({ ...draft, rhythmLayers: [...draft.rhythmLayers, { id, instrumentId, measures }] }));
    selectMeasure(0, scoreIndex);
  }

  function removeRhythmScore(scoreIndex: number) {
    const previous = latestDraft.current;
    if (previous.mode === "melody") return;
    if (rejectLockedRhythm(0)) return;
    if (!Number.isInteger(scoreIndex) || scoreIndex < 1 || scoreIndex > previous.rhythmLayers.length) return;
    const target = previous.rhythmLayers[scoreIndex - 1];
    if (hasPracticeScoreData(target) && !window.confirm(`악보 ${scoreIndex + 1}의 가사와 음표가 지워져요. 삭제할까요?`)) return;
    updateDraft((draft) => ({ ...draft, rhythmLayers: draft.rhythmLayers.filter((_, index) => index !== scoreIndex - 1) }));
    if (selectedScore.current === scoreIndex) selectMeasure(selectedMeasure.current, 0);
    else if (selectedScore.current > scoreIndex) activateMeasure(selectedMeasure.current, selectedScore.current - 1);
    setNotice("");
  }

  function setRhythmInstrument(scoreIndex: number, id: string) {
    if (latestDraft.current.mode === "melody") return;
    const instrumentId = normalizePracticeRhythmInstrument(id);
    if (!instrumentId || !Number.isInteger(scoreIndex) || scoreIndex < 0 || scoreIndex >= getPracticeScores(latestDraft.current).length) return;
    if (scoreIndex === 0) configure({ rhythmInstrumentId: instrumentId });
    else {
      updateDraft((draft) => ({ ...draft, rhythmLayers: draft.rhythmLayers.map((layer, index) => index === scoreIndex - 1 ? { ...layer, instrumentId } : layer) }));
      setNotice("");
    }
  }

  function resize(count: number) {
    if (rejectLockedRhythm(0)) return;
    if (!Number.isInteger(count) || count < 1 || count > 8) return;
    const previous = latestDraft.current;
    const storedScores = [{ measures: previous.measures }, ...previous.rhythmLayers];
    if (count < previous.measures.length && storedScores.some((score) => hasPracticeScoreData({ measures: score.measures.slice(count) }))) {
      if (!window.confirm("마디 수를 줄이면 뒤쪽 마디의 가사와 음표가 지워져요. 줄일까요?")) return;
    }
    function resizeMeasures(measures: PracticeMeasure[], idPrefix: string) {
      const resized = count <= measures.length ? measures.slice(0, count)
        : [...measures, ...createPracticeMeasures(count - measures.length).map((measure, index) => ({ ...measure, id: `${idPrefix}-${measures.length + index + 1}` }))];
      return normalizePracticeHarmony(resized);
    }
    updateDraft((previous) => ({
      ...previous,
      measures: resizeMeasures(previous.measures, "practice-measure"),
      rhythmLayers: previous.rhythmLayers.map((layer) => ({ ...layer, measures: resizeMeasures(layer.measures, `${layer.id}-measure`) }))
    }));
    activateMeasure(Math.min(selectedMeasure.current, count - 1));
    setSelectedNote(null);
    setNotice("");
  }

  function setMeter(meter: Meter) {
    if (rejectLockedRhythm(0)) return;
    configure({ meter });
    setNotice("음표는 그대로 두었어요. 새 박자에 맞는지 마디마다 확인해 주세요.");
  }

  function addNote(beats: number, pitch: number | null, dotted?: boolean, index = selectedMeasure.current, scoreIndex = selectedScore.current, onset?: number) {
    if (rejectLockedRhythm(scoreIndex)) return;
    if (!PRACTICE_DURATIONS.some((item) => item.beats === beats)) return;
    const target = getPracticeScores(latestDraft.current)[scoreIndex]?.measures[index];
    if (!target) return;
    if (onset !== undefined && onset >= toNumber(measureCapacity(latestDraft.current.meter))) return;
    const rests = practicePlacementRests(target.notes, onset, () => `practice-rest-${Date.now()}-${sequence.current++}`);
    if (!rests) return;
    if (target.notes.length + rests.length >= 64) {
      setNotice("한 마디에 음표가 너무 많아요. 필요 없는 음표를 지우거나 다음 마디를 사용해 주세요.");
      return;
    }
    const id = `practice-note-${Date.now()}-${sequence.current++}`;
    updateNotes((notes) => [...notes, ...rests, { id, pitch, duration: rational(beats * 4, 4), dotted }], index, scoreIndex);
    selectNote(id);
    if (rests.length > 0) setNotice("누른 칸에 음표를 넣었어요. 앞의 빈 박자는 쉼표로 채웠어요.");
  }

  function setPitch(id: string, pitch: number) {
    const owner = noteOwner(id);
    const nextPitch = normalizePracticePitch(pitch);
    if (!owner || nextPitch === null) return;
    updateMeasure((measure) => ({
      ...measure,
      notes: measure.notes.map((note) => note.id === id ? withEditedPitch(note, nextPitch) : note)
    }), owner.index, owner.scoreIndex);
    selectNote(id);
  }

  function setDuration(id: string, beats: number, dotted?: boolean) {
    if (!PRACTICE_DURATIONS.some((item) => item.beats === beats)) return;
    const owner = noteOwner(id);
    if (!owner) return;
    if (rejectLockedRhythm(owner.scoreIndex)) return;
    updateMeasure((measure) => ({
      ...measure,
      notes: measure.notes.map((note) => note.id === id ? { ...note, duration: rational(beats * 4, 4), dotted } : note)
    }), owner.index, owner.scoreIndex);
    selectNote(id);
  }

  function deleteNote(id: string) {
    const owner = noteOwner(id);
    if (!owner) return;
    if (rejectLockedRhythm(owner.scoreIndex)) return;
    updateNotes((notes) => notes.filter((note) => note.id !== id), owner.index, owner.scoreIndex);
    activateMeasure(owner.index, owner.scoreIndex);
    setSelectedNote(null);
  }

  function setLyric(lyric: string, index = selectedMeasure.current, scoreIndex = selectedScore.current) {
    updateMeasure((measure) => ({ ...measure, lyric, notes: assignPracticeLyrics(measure.notes, lyric) }), index, scoreIndex);
  }

  function setNoteLyric(id: string, lyric: string) {
    const owner = noteOwner(id);
    if (!owner) return;
    const target = getPracticeScores(latestDraft.current)[owner.scoreIndex].measures[owner.index].notes.find((note) => note.id === id);
    if (target?.pitch === null) return;
    updateMeasure((measure) => {
      const overflow = unassignedLyricSyllables(measure).join("");
      const notes = measure.notes.map((note) => note.id === id ? { ...note, lyric } : note);
      return {
        ...measure,
        notes,
        lyric: notes.filter((note) => note.pitch !== null).map((note) => note.lyric ?? "").join("") + overflow
      };
    }, owner.index, owner.scoreIndex);
    selectNote(id);
  }

  function generateRhythm(index = selectedMeasure.current, scoreIndex = selectedScore.current) {
    if (scoreIndex === 0 && latestStep.current !== "rhythm") return;
    const target = getPracticeScores(latestDraft.current)[scoreIndex]?.measures[index];
    if (!target) return;
    if (target.notes.length && !window.confirm("이 마디의 음표를 가사에 맞춘 새 리듬으로 바꿀까요?")) return;
    try {
      const notes = makeLyricRhythm(target.lyric, latestDraft.current.meter, `practice-lyric-${Date.now()}-${sequence.current++}`);
      updateNotes(() => notes, index, scoreIndex);
      activateMeasure(index, scoreIndex);
      setSelectedNote(notes[0]?.id ?? null);
      setNotice("가사에 음표를 붙였어요. 음표 길이를 바꿔 나만의 리듬을 만들어 보세요.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "가사를 확인해 주세요.");
    }
  }

  function fillRests(index = selectedMeasure.current, scoreIndex = selectedScore.current) {
    if (rejectLockedRhythm(scoreIndex)) return;
    const previous = latestDraft.current;
    const target = getPracticeScores(previous)[scoreIndex]?.measures[index];
    if (!target) return;
    let remaining = toNumber(measureCapacity(previous.meter)) - target.notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
    if (remaining <= 0) return;
    const rests: NoteEvent[] = [];
    for (const beats of [...PRACTICE_DURATIONS].reverse().map((duration) => duration.beats)) {
      while (remaining >= beats) {
        rests.push({ id: `practice-rest-${Date.now()}-${sequence.current++}`, pitch: null, duration: rational(beats * 4, 4), dotted: beats === 3 || beats === 1.5 });
        remaining -= beats;
      }
    }
    updateMeasure((measure) => ({ ...measure, notes: [...measure.notes, ...rests] }), index, scoreIndex);
  }

  function goToMelody() {
    const previous = latestDraft.current;
    if (!canDraftGoToMelody(previous)) {
      setNotice(previous.mode === "rhythm-melody"
        ? "먼저 모든 마디의 리듬을 채워 주세요. 첫 악보에 소리 나는 음표도 필요해요."
        : "가락을 만들려면 처음에 가락이 있는 모드를 골라 주세요.");
      return;
    }
    const index = Math.max(0, Math.min(selectedMeasure.current, previous.measures.length - 1));
    changeStep("melody");
    activateMeasure(index, 0);
    setSelectedNote(previous.measures[index].notes.find((note) => note.pitch !== null)?.id ?? null);
    setNotice(previous.mode === "melody"
      ? "빈칸을 눌러 음표를 넣고 나만의 가락을 만들어 보세요."
      : "만든 리듬은 그대로예요. 음높이를 골라 나만의 가락을 만들어 보세요.");
  }

  function setStep(next: "rhythm" | "melody") {
    if (next === "melody") {
      goToMelody();
      return;
    }
    if (latestDraft.current.mode === "melody") return;
    changeStep("rhythm");
    setNotice("");
  }

  function selectCreationMode(mode: PracticeCreationMode) {
    const previous = latestDraft.current;
    const index = Math.max(0, Math.min(selectedMeasure.current, previous.measures.length - 1));
    history.update((draft) => ({ ...draft, mode }), previous.mode !== null);
    activateMeasure(index, 0);
    changeStep(mode === "melody" ? "melody" : "rhythm");
    setSelectedNote(previous.measures[index].notes.find((note) => note.pitch !== null)?.id ?? null);
    setNotice("");
  }

  function startNew(): boolean {
    if (!window.confirm("지금 연습한 리듬, 가락, 가사가 모두 지워져요. 새로 시작할까요?")) return false;
    updateDraft(() => emptyPracticeDraft());
    activateMeasure(0, 0);
    changeStep("rhythm");
    setInputMode("grid");
    setSelectedNote(null);
    setNotice("");
    return true;
  }

  function setChord(chord: string, index = selectedMeasure.current, scoreIndex = selectedScore.current) {
    const previous = latestDraft.current;
    const measures = getPracticeScores(previous)[scoreIndex]?.measures;
    if (!measures || !Number.isInteger(index) || index < 0 || index >= measures.length) return;
    if (!isAvailablePracticeChord(chord, measures[index - 1]?.chord)) {
      setNotice("앞 마디와 이어지는 목록에서 화음을 골라 주세요.");
      return;
    }
    const next = normalizePracticeHarmony(measures.map((measure, targetIndex) => targetIndex === index ? { ...measure, chord } : measure));
    const changedLater = next.filter((measure, targetIndex) => targetIndex > index && measure.chord !== measures[targetIndex].chord).length;
    updateDraft((draft) => scoreIndex === 0
      ? { ...draft, measures: next }
      : { ...draft, rhythmLayers: draft.rhythmLayers.map((layer, targetIndex) => targetIndex === scoreIndex - 1 ? { ...layer, measures: next } : layer) });
    setNotice(changedLater > 0
      ? `뒤쪽 ${changedLater}개 마디의 화음도 어울리게 바꿨어요. 리듬과 가락은 그대로예요.`
      : "");
  }

  return {
    draft, active, activeIndex, activeScoreIndex, scores, step, editingStep, inputMode, selectedNoteId, notice, saved, validations, scoreValidations, complete, canGoToMelody,
    setStep, setInputMode, setSelectedNoteId: selectNote, selectMeasure, configure, resize, setMeter,
    selectScore, addRhythmScore, removeRhythmScore, setRhythmInstrument,
    selectCreationMode, startNew,
    addNote, setPitch, setDuration, deleteNote, setLyric, setNoteLyric, generateRhythm, fillRests, goToMelody,
    setChord, undo, redo, canUndo: history.canUndo, canRedo: history.canRedo
  };
}
