import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import StudioArtwork from "./StudioArtwork";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { createMusicVideoScene, getMusicVideoMeasures, isIntroScene, isMusicVideoScenes, MAX_SCENES, MAX_TOTAL_POINTS,
  validateMusicVideoScenes, type MusicVideoScene } from "../video/musicVideoModel";
import type { MusicVideoFeatureProps } from "./MusicVideoFeature";
import type { useMusicVideoExport } from "./useMusicVideoExport";
import SceneCanvas, { type SceneCanvasHandle } from "./SceneCanvas";
import ScenePaintTools from "./ScenePaintTools";
import SceneSettings from "./SceneSettings";
import SceneStoryboard from "./SceneStoryboard";
import SceneFileActions from "./SceneFileActions";
import { importSceneInto, resetScene } from "./sceneFile";
import { pruneSceneChoreography } from "../video/sceneActionTypes";
import { useSceneSelection } from "./useSceneSelection";
import type { SceneEditorTool, SceneSelectionControls } from "./sceneSelection";
import SceneSelectionStatus from "./SceneSelectionStatus";
import StudioResultPreview from "./StudioResultPreview";
import SceneAutoMotionButton from "./SceneAutoMotionButton";
import { createAutoSceneMotionPlan } from "./autoSceneMotions";
import StudioPlaybackPreview from "./StudioPlaybackPreview";
import "./StudioPlaybackTrigger.css";
import type { MusicVideoExportOptions } from "../video/exportMusicVideoMp4";
import { getStudioIntroSeconds } from "./studioIntro";
import StudioIntroTitleCard from "./StudioIntroTitleCard";
import { appendSceneSlide, deleteSceneSlide, getSceneSlideDeletionIssue, getSceneSlideInsertionIssue,
  insertSceneSlide, type SceneSlideEditResult } from "./sceneSequenceEditing";
import { useSceneClipboard } from "./useSceneClipboard";
import SceneClipboardActions from "./SceneClipboardActions";
import SceneEditorMoreActions from "./SceneEditorMoreActions";
import SceneRangeWarnings from "./SceneRangeWarnings";
import { changeSceneRangeBoundary, getSceneRangeIssue, shiftSceneRangesForward } from "../video/musicVideoSceneRanges";
import { findSceneActionRangeIssues } from "./sceneTimingIssues";

type Props = MusicVideoFeatureProps & Readonly<{
  video: ReturnType<typeof useMusicVideoExport>;
  onClose: () => void;
}>;

export default function MusicVideoStudio(props: Props) {
  const { scenes, onScenesChange, video } = props;
  const latestScenes = useRef(scenes);
  const drawingGesture = useRef<string | null>(null);
  latestScenes.current = scenes;
  const ref = useDialogFocus();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SceneCanvasHandle>(null);
  const previewTriggerRef = useRef<HTMLButtonElement>(null);
  const restorePreviewFocus = useRef(false);
  const [selected, setSelected] = useState(0);
  const [color, setColor] = useState("#1e293b");
  const [width, setWidth] = useState(8);
  const [status, setStatus] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [undo, setUndo] = useState<readonly (readonly MusicVideoScene[])[]>([]);
  const [redo, setRedo] = useState<readonly (readonly MusicVideoScene[])[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [animated, setAnimated] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<"paint" | "settings">("paint");
  const [openedResultUrl, setOpenedResultUrl] = useState<string | null>(null);
  const [previewOptions, setPreviewOptions] = useState<MusicVideoExportOptions | null>(null);
  const [pastedSelection, setPastedSelection] = useState<{ sceneId: string; ids: readonly string[] } | null>(null);
  const previewOpen = previewOptions !== null;
  const resultOpen = Boolean(video.result && video.result.url === openedResultUrl);
  const measures = useMemo(() => getMusicVideoMeasures(props.measures, props.bpm), [props.measures, props.bpm]);
  const introSeconds = getStudioIntroSeconds(props.measures, props.bpm, props.recording);
  const autoMotions = useMemo(() => createAutoSceneMotionPlan({ scenes, measures: props.measures, bpm: props.bpm,
    meter: props.accompaniment.meter }), [scenes, props.measures, props.bpm, props.accompaniment.meter]);
  const autoMotionReason = autoMotions.issue ?? (!autoMotions.assignments.length ? "장면에 그림을 그리면 자동 모션을 적용할 수 있어요." : undefined);
  const index = Math.min(selected, Math.max(0, scenes.length - 1));
  const scene = scenes[index];
  const selection = useSceneSelection(scene);
  const { tool, setTool } = selection;
  const clipboard = useSceneClipboard();
  const insertBeforeReason = useMemo(() => scene && isIntroScene(scene)
    ? "전주는 맨 앞에 있어야 해요. 뒤에 삽입을 눌러 본곡 장면을 추가해 주세요."
    : getSceneSlideInsertionIssue(scenes, measures, index, "before", props.bpm),
    [scenes, measures, index, props.bpm]);
  const insertAfterReason = useMemo(() => getSceneSlideInsertionIssue(scenes, measures, index, "after", props.bpm),
    [scenes, measures, index, props.bpm]);
  const deleteReason = getSceneSlideDeletionIssue(scenes, measures, index, props.bpm);
  const rangeIssue = useMemo(() => getSceneRangeIssue(scenes, measures), [scenes, measures]);
  const actionIssues = useMemo(() => findSceneActionRangeIssues(scenes, measures, props.bpm), [scenes, measures, props.bpm]);
  const shiftPlan = useMemo(() => shiftSceneRangesForward(scenes, measures, props.bpm), [scenes, measures, props.bpm]);
  const selectionControls: SceneSelectionControls = { scope: selection.scope, selectedIds: selection.selectedIds,
    onScopeChange: selection.setScope, onClear: selection.clearSelection, onSelectElement: selection.selectElement,
    onSelectElements: selection.selectElements };
  const unavailable = useMemo(() => !props.complete ? "모든 마디의 박자를 완성하면 영상을 만들 수 있어요."
    : rangeIssue ?? actionIssues[0]?.message ?? validateMusicVideoScenes(scenes, measures, props.bpm),
  [props.complete, rangeIssue, actionIssues, scenes, measures, props.bpm]);

  useEffect(() => {
    if (!pastedSelection) return;
    if (scene?.id === pastedSelection.sceneId) selection.selectElements(pastedSelection.ids);
    setPastedSelection(null);
  }, [pastedSelection, scene]);

  useEffect(() => {
    if (previewOpen || props.busy || !restorePreviewFocus.current) return;
    const frame = requestAnimationFrame(() => {
      const trigger = previewTriggerRef.current;
      if (!trigger || trigger.disabled) return;
      trigger.focus({ preventScroll: true });
      restorePreviewFocus.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [previewOpen, props.busy]);

  function commit(next: readonly MusicVideoScene[], gestureId?: string) {
    if (video.working) return false;
    const known = new Set(latestScenes.current);
    const cleaned = next.map((item) => !known.has(item) && item.choreography ? { ...item,
      choreography: pruneSceneChoreography(item.choreography, item.elements) } : item);
    if (!isMusicVideoScenes(cleaned)) {
      setStatus("그림이 너무 복잡해요. 선이나 장면을 줄여 주세요.");
      return false;
    }
    if (!gestureId || drawingGesture.current !== gestureId) {
      const before = latestScenes.current;
      setUndo((history) => [...history.slice(-24), before]);
      setRedo([]);
    }
    drawingGesture.current = gestureId ?? null;
    latestScenes.current = cleaned;
    onScenesChange(cleaned);
    setStatus("");
    return true;
  }
  function changeScene(next: MusicVideoScene, gestureId?: string) {
    const current = latestScenes.current;
    const existing = current.find((item) => item.id === next.id);
    if (!existing) return;
    if (gestureId && existing.elements.length === next.elements.length &&
      existing.elements.every((element, position) => element === next.elements[position])) return;
    commit(current.map((item) => item.id === next.id ? gestureId ? { ...item, elements: next.elements } : next : item), gestureId);
  }
  function applyAutomaticMotions() {
    if (video.working || props.busy || autoMotionReason) return;
    canvasRef.current?.flush();
    const plan = createAutoSceneMotionPlan({ scenes: latestScenes.current, measures: props.measures,
      bpm: props.bpm, meter: props.accompaniment.meter });
    if (plan.issue) { setStatus(plan.issue); return; }
    if (plan.scenes === latestScenes.current) {
      selection.setScope("whole");
      setStatus("모든 그림에 음악에 맞는 모션이 이미 적용되어 있어요.");
      return;
    }
    if (!commit(plan.scenes)) return;
    selection.setScope("whole");
    const skipped = plan.skippedEmpty ? ` 빈 장면 ${plan.skippedEmpty}개는 그대로 두었어요.` : "";
    setStatus(`${plan.assignments.length}개 장면에 음악 맞춤 모션을 적용했어요.${skipped} 실행 취소로 되돌릴 수 있어요.`);
  }
  function importScene(imported: MusicVideoScene) {
    if (!scene || video.working) throw new Error("영상 만들기가 끝난 뒤 장면을 불러와 주세요.");
    canvasRef.current?.flush();
    const next = latestScenes.current.map((item, i) => i === index ? importSceneInto(item, imported) : item);
    if (!isMusicVideoScenes(next)) throw new Error("이 작품의 그림이 너무 복잡해요. 선이나 장면을 줄인 뒤 다시 불러와 주세요.");
    selection.clearSelection();
    commit(next);
  }
  function resetCurrentScene() {
    if (!scene || video.working) return;
    canvasRef.current?.flush();
    selection.clearSelection();
    changeScene(resetScene(scene));
    setStatus(`장면 ${index + 1}의 그림과 동작을 초기화했어요. 실행 취소로 되돌릴 수 있어요.`);
  }
  function undoChange() {
    if (!undo.length || video.working) return;
    canvasRef.current?.flush();
    selection.clearSelection();
    const completed = latestScenes.current;
    onScenesChange(undo.at(-1)!);
    setRedo((history) => [...history, completed]);
    setUndo(undo.slice(0, -1));
    setStatus("장면 변경을 되돌렸어요.");
  }
  function redoChange() {
    if (!redo.length || video.working) return;
    canvasRef.current?.flush();
    selection.clearSelection();
    const completed = latestScenes.current;
    onScenesChange(redo.at(-1)!);
    setUndo((history) => [...history, completed]);
    setRedo(redo.slice(0, -1));
    setStatus("장면 변경을 다시 적용했어요.");
  }
  function closePlaybackPreview() {
    restorePreviewFocus.current = true;
    setPreviewOptions(null);
  }
  function openPlaybackPreview() {
    canvasRef.current?.flush();
    setPreviewOptions({ measures: props.measures, instrumentId: props.instrumentId, bpm: props.bpm,
      accompaniment: props.accompaniment, scenes: latestScenes.current, animated: true,
      title: props.title, composer: props.composer, recording: props.recording });
  }
  function chooseVideoAnimation() {
    canvasRef.current?.flush();
    setChoosing(true);
  }
  function makeVideo() {
    canvasRef.current?.flush();
    setChoosing(false);
    void video.make({ measures: props.measures, instrumentId: props.instrumentId, bpm: props.bpm,
      accompaniment: props.accompaniment, scenes: latestScenes.current, animated,
      title: props.title, composer: props.composer, recording: props.recording });
  }
  function applySlideEdit(result: SceneSlideEditResult) {
    if (video.working) return;
    if (result.issue) { setStatus(result.issue); return; }
    if (!commit(result.scenes)) return;
    selection.clearSelection();
    setPastedSelection(null);
    setSelected(result.selected);
    setStatus(result.status ?? "장면을 변경했어요. 실행 취소로 되돌릴 수 있어요.");
  }
  function addScene() {
    canvasRef.current?.flush();
    applySlideEdit(appendSceneSlide(latestScenes.current, measures, props.bpm));
  }
  function insertSlide(placement: "before" | "after") {
    canvasRef.current?.flush();
    applySlideEdit(insertSceneSlide(latestScenes.current, measures, index, placement, props.bpm));
  }
  function deleteSlide() {
    canvasRef.current?.flush();
    applySlideEdit(deleteSceneSlide(latestScenes.current, measures, index, props.bpm));
  }
  function changeRange(boundary: "start" | "end", measureIndex: number) {
    if (video.working) return;
    canvasRef.current?.flush();
    const next = changeSceneRangeBoundary(latestScenes.current, measures, index, boundary, measureIndex);
    if (next !== latestScenes.current) commit(next);
  }
  function shiftRangesForward() {
    if (video.working) return;
    canvasRef.current?.flush();
    const result = shiftSceneRangesForward(latestScenes.current, measures, props.bpm);
    if (result.issue) { setStatus(result.issue); return; }
    if (result.scenes === latestScenes.current || !commit(result.scenes)) return;
    setStatus(result.status ?? "겹치는 장면을 뒷마디로 밀었어요. 실행 취소로 되돌릴 수 있어요.");
  }
  function selectScene(next: number) {
    canvasRef.current?.flush();
    selection.clearSelection();
    setSelected(next);
    setStatus("");
  }
  function selectConflictingScene(next: number) {
    selectScene(next);
    showMobilePanel("settings");
    requestAnimationFrame(() => {
      const workspace = workspaceRef.current;
      const inspector = workspace?.querySelector<HTMLElement>(".mv-scene-settings");
      const timing = inspector?.querySelector<HTMLElement>(".mv-range-fields");
      if (!workspace || !inspector || !timing) return;
      const scroller = window.matchMedia?.("(max-width: 820px)").matches ? workspace : inspector;
      scroller.scrollTop += timing.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
    });
  }
  function copySelection() {
    if (!scene || video.working) return;
    const current = latestScenes.current.find((item) => item.id === scene.id);
    if (current) setStatus(clipboard.copy(current, selection.selectedIds).status);
  }
  function pasteSelection() {
    if (!scene || video.working) return;
    canvasRef.current?.flush();
    const current = latestScenes.current.find((item) => item.id === scene.id);
    if (!current) return;
    const remainingPoints = MAX_TOTAL_POINTS - latestScenes.current.reduce((total, item) =>
      total + item.elements.reduce((sum, element) => sum + element.points.length, 0), 0);
    const result = clipboard.preparePaste(current, remainingPoints);
    if (!result.ok) { setStatus(result.status); return; }
    if (!commit(latestScenes.current.map((item) => item.id === current.id ? result.scene : item))) return;
    clipboard.confirmPaste();
    setTool("select");
    setPastedSelection({ sceneId: current.id, ids: result.selectedIds });
    setStatus(result.status);
  }
  function addIntroScene() {
    if (video.working || scenes.length >= MAX_SCENES || scenes.some(isIntroScene)) return;
    canvasRef.current?.flush();
    const { endMeasureIndex: _end, ...created } = createMusicVideoScene(null);
    const intro: MusicVideoScene = { ...created, section: "intro", endLyric: null, motion: "still" };
    if (!commit([intro, ...latestScenes.current])) return;
    selection.clearSelection();
    setSelected(0);
    setStatus("전주 장면을 추가했어요. 비워 두면 제목과 작곡가가 나와요.");
  }
  function closeStudio() {
    canvasRef.current?.flush();
    props.onClose();
  }
  function keyDown(event: KeyboardEvent) {
    if (previewOpen) return;
    if (resultOpen) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpenedResultUrl(null);
      }
      return;
    }
    if (event.key === "Escape") {
      if (video.working) return;
      event.stopPropagation();
      if (!choosing && selection.selectedIds.length) {
        selection.clearSelection();
        return;
      }
      choosing ? setChoosing(false) : closeStudio();
      return;
    }
    if ((event.target as HTMLElement).closest("input, select, textarea, [contenteditable='true']")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redoChange() : undoChange();
      return;
    }
    if (!video.working && !choosing && !event.altKey && (event.ctrlKey || event.metaKey)) {
      const shortcut = event.key.toLowerCase();
      if (shortcut === "c" && selection.selectedIds.length) {
        event.preventDefault();
        copySelection();
        return;
      }
      if (shortcut === "v" && clipboard.clipboardCount) {
        event.preventDefault();
        pasteSelection();
        return;
      }
      if (shortcut === "a" && tool === "select" && scene) {
        event.preventDefault();
        selection.selectElements(scene.elements.map((element) => element.id));
        return;
      }
    }
    if (video.working || choosing || event.ctrlKey || event.metaKey || event.altKey) return;
    const shortcuts: Record<string, SceneEditorTool> = { v: "select", b: "brush", e: "eraser", l: "line", r: "rectangle", o: "ellipse" };
    const nextTool = shortcuts[event.key.toLowerCase()];
    if (nextTool) { event.preventDefault(); setTool(nextTool); }
  }

  function showMobilePanel(panel: "paint" | "settings") {
    setMobilePanel(panel);
    if (workspaceRef.current) workspaceRef.current.scrollTop = 0;
  }

  return <div ref={ref} className="mv-overlay" onKeyDown={keyDown}>
    <section className="mv-studio" role="dialog" aria-modal="true" aria-labelledby="mv-studio-title" tabIndex={-1}
      inert={previewOpen}>
      <header className="mv-header">
        <div className="mv-brand-mark" aria-hidden="true"><StudioArtwork name="video" size={40} /></div>
        <div className="mv-header-title"><span>뮤직비디오 스튜디오</span><h2 id="mv-studio-title">장면 그리기</h2></div>
        <div className="mv-project-name"><span />{props.title.trim() || "나의 노래"}</div>
        <SceneAutoMotionButton disabled={video.working || props.busy || Boolean(autoMotionReason)}
          reason={autoMotionReason} onApply={applyAutomaticMotions} />
        <button type="button" className="mv-icon-button" aria-label="장면 그리기 닫기" disabled={video.working}
          onClick={closeStudio}><StudioArtwork name="close" size={23} /></button>
      </header>
      <div className="mv-scene-toolbar">
        {tool === "select" ? <SceneSelectionStatus count={selection.selectedIds.length} disabled={video.working}
          onClear={selection.clearSelection} /> : <span>그림을 그리고, 장면의 움직임을 골라 주세요</span>}
        <SceneClipboardActions disabled={video.working || !scene} selectedCount={selection.selectedIds.length}
          clipboardCount={clipboard.clipboardCount} onCopy={copySelection} onPaste={pasteSelection} />
        <SceneEditorMoreActions disabled={video.working}>
        {props.onFindLostDrawings && <button type="button" className="mv-secondary" disabled={video.working}
          onClick={props.onFindLostDrawings}>이전 그림 찾기</button>}
        {scene && <SceneFileActions scene={scene} sceneNumber={index + 1} title={props.title} disabled={video.working}
          onImport={importScene} onReset={resetCurrentScene} onStatus={setStatus} />}
        </SceneEditorMoreActions>
      </div>
      <div className="mv-mobile-tabs" role="group" aria-label="장면 편집 보기">
        <button type="button" aria-pressed={mobilePanel === "paint"} onClick={() => showMobilePanel("paint")}>
          <StudioArtwork name="brush" size={22} /> 그림판 보기</button>
        <button type="button" aria-pressed={mobilePanel === "settings"} onClick={() => showMobilePanel("settings")}>
          <StudioArtwork name="video" size={22} /> 장면 설정 보기</button>
      </div>
      <SceneRangeWarnings scenes={scenes} measures={measures} disabled={video.working}
        onSelect={selectConflictingScene}
        onShift={shiftRangesForward} shiftIssue={shiftPlan.issue} actionIssues={actionIssues} />
      <div className="mv-workspace" ref={workspaceRef} data-mobile-panel={mobilePanel} aria-busy={video.working}>
        <div className="mv-paint-area">
          <ScenePaintTools tool={tool} onToolChange={setTool} color={color} onColorChange={setColor}
            width={width} onWidthChange={setWidth} disabled={video.working} canUndo={Boolean(undo.length)}
            canRedo={Boolean(redo.length)} hasDrawing={Boolean(scene?.elements.length)} onUndo={undoChange} onRedo={redoChange}
            onClear={() => { selection.clearSelection(); if (scene) changeScene({ ...scene, elements: [] }); }} />
          <div className="mv-canvas-stage">
            <div className="mv-canvas-label"><span><span /> {scene && isIntroScene(scene) ? "전주" : `장면 ${String(index + 1).padStart(2, "0")}`}</span>
              <small><StudioArtwork name="expand" size={10} /> 16:9</small></div>
            <div className="mv-canvas-surround">{scene && <SceneCanvas ref={canvasRef} key={scene.id} scene={scene} tool={tool}
              color={color} width={width} disabled={video.working} onChange={changeScene} onStatus={setStatus}
              onDrawingChange={setDrawing}
              onGestureChange={changeScene} remainingPoints={MAX_TOTAL_POINTS - scenes.reduce((total, item) =>
                total + item.elements.reduce((sum, element) => sum + element.points.length, 0), 0)}
              selectedIds={selection.selectedIds} onSelectElement={selection.selectElement} />}
              {!scene?.elements.length && <div className="mv-empty-hint" aria-hidden="true">
                {scene && isIntroScene(scene) ? <StudioIntroTitleCard title={props.title} composer={props.composer} />
                  : <><span><StudioArtwork name="brush" size={38} /></span><strong>이 장면을 그려 보세요</strong><small>색을 고르고, 자유롭게 그리기</small></>}
              </div>}
            </div>
            <div className="mv-canvas-caption"><span>{tool === "select" ? "개체를 클릭해 선택 · Shift로 여러 개 선택"
              : tool === "eraser" ? "닿은 선이나 도형 전체를 지워요" : "마우스 · 터치 · 펜으로 자유롭게"}</span>
              <span>{tool === "select" ? "Ctrl+C 복사 · Ctrl+V 붙여넣기" : "V 선택 · B 붓 · E 지우개"}</span></div>
          </div>
        </div>
        {scene && <SceneSettings scene={scene} scenes={scenes} measures={measures} selected={index} bpm={props.bpm}
          title={props.title} composer={props.composer} introSeconds={introSeconds} disabled={video.working} onChange={changeScene}
          autoMotions={autoMotions}
          sourceMeasures={props.measures} onStatus={setStatus} selection={selectionControls}
          drawing={drawing}
          onRangeChange={changeRange}
          onDelete={deleteSlide} deleteReason={deleteReason} />}
      </div>
      <SceneStoryboard scenes={scenes} measures={measures} selected={index} disabled={video.working}
        title={props.title} composer={props.composer} introSeconds={introSeconds}
        onSelect={selectScene} onAdd={addScene} onAddIntro={addIntroScene}
        onInsertBefore={() => insertSlide("before")} onInsertAfter={() => insertSlide("after")} onDelete={deleteSlide}
        insertBeforeReason={insertBeforeReason} insertAfterReason={insertAfterReason} deleteReason={deleteReason} />
      <footer className="mv-footer">
        <div className="mv-footer-status" aria-live="polite"><span className="mv-save-dot"><StudioArtwork name="check" size={16} /></span><div>
          <strong>{video.working ? `뮤직비디오 만드는 중 · ${video.progress}%` : status || video.status || props.saveStatus || "그림과 장면 구간은 작품에 자동으로 저장돼요"}</strong>
          {!video.working && props.saveStatus && <small data-testid="scene-autosave-status" role={props.saveError ? "alert" : "status"}>
            {props.saveStatus} · {props.projectSaveStatus}{props.saveError ? ` · ${props.saveError}` : ""}
          </small>}
          {!video.working && unavailable && <small>{unavailable}</small>}
          {video.working && <progress max={100} value={video.progress} aria-label="뮤직비디오 만들기 진행률" />}
        </div></div>
        <div className="mv-footer-actions">
        {!video.working && <button ref={previewTriggerRef} type="button" className="mv-secondary mv-playback-trigger"
          data-testid="music-video-preview-open" aria-label="음악과 모션 미리보기" title={unavailable ?? "음악과 가사, 모든 장면의 움직임을 함께 재생해요."}
          disabled={Boolean(unavailable) || props.busy} onClick={openPlaybackPreview}>
          <StudioArtwork name="play" size={22} /><span className="mv-playback-label-full">음악·모션 미리보기</span>
          <span className="mv-playback-label-compact" aria-hidden="true">미리보기</span></button>}
        {video.result && !video.working && <button type="button" className="mv-secondary mv-result-trigger"
          data-testid="music-video-result-open" onClick={() => setOpenedResultUrl(video.result!.url)}>
          <StudioArtwork name="play" size={22} /> 완성 영상 보기</button>}
        {video.working ? <button type="button" className="mv-secondary" onClick={video.cancel}>만들기 취소</button>
          : <button type="button" className="mv-primary" data-testid="create-music-video" disabled={Boolean(unavailable) || props.busy}
            title={unavailable ?? undefined}
            onClick={chooseVideoAnimation}><span className="mv-create-play"><StudioArtwork name="play" size={23} /></span> 뮤직비디오 만들기</button>}
        </div>
      </footer>
    </section>
    {choosing && <section className="mv-choice-backdrop"><div className="mv-choice" role="dialog" aria-modal="true"
      aria-labelledby="mv-choice-title" tabIndex={-1}>
      <button type="button" className="mv-icon-button mv-choice-close" aria-label="애니메이션 선택 닫기" onClick={() => setChoosing(false)}><StudioArtwork name="close" size={23} /></button>
      <span className="mv-choice-mark" aria-hidden="true"><StudioArtwork name="video" size={56} /></span>
      <span className="mv-eyebrow">마지막 한 가지</span><h2 id="mv-choice-title">그림에 움직임을 더할까요?</h2>
      <div className="mv-animation-options">
        <label className={animated ? "selected" : ""}><input type="radio" name="mv-animation" checked={animated} onChange={() => setAnimated(true)} />
          <strong>애니메이션 있음</strong><small>선택한 동작을 음악과 가사에 맞춰 영상에 담아요.</small></label>
        <label className={!animated ? "selected" : ""}><input type="radio" name="mv-animation" checked={!animated} onChange={() => setAnimated(false)} />
          <strong>애니메이션 없음</strong><small>그림은 그대로, 노래와 가사가 흘러가요.</small></label>
      </div>
      {unavailable && <p role="alert">{unavailable} 문제를 해결한 뒤 영상을 만들어 주세요.</p>}
      <p>{props.recording ? "녹음한 목소리와 음악을 함께 담아요." : "만든 가락과 반주, 박자에 맞는 가사를 담아요."} 720p MP4로 저장해요.</p>
      <button type="button" className="mv-primary" data-testid="confirm-music-video"
        disabled={Boolean(unavailable) || props.busy}
        onClick={makeVideo}>
        <StudioArtwork name="video" size={27} /> 영상 만들고 MP4 저장</button>
    </div></section>}
    {resultOpen && video.result && <StudioResultPreview result={video.result} onClose={() => setOpenedResultUrl(null)} />}
    {previewOptions && <StudioPlaybackPreview options={previewOptions}
      onBusyChange={props.onBusyChange} onClose={closePlaybackPreview} />}
  </div>;
}
