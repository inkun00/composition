import StudioArtwork from "./StudioArtwork";
import type { MusicVideoMeasureCue, MusicVideoScene } from "../video/musicVideoModel";
import type { MusicVideoMeasure } from "../video/musicVideoMeasures";
import { planSceneActions } from "../video/sceneActionPlan";
import { createSceneAction, createSceneActor, SCENE_ACTION_LABELS,
  type SceneAction, type SceneActionKind } from "../video/sceneActionTypes";
import { assignActorElements, changeSceneActor, sceneChoreography } from "./sceneActionEditing";
import "./SceneActionEditor.css";

type Props = Readonly<{
  scene: MusicVideoScene;
  measures: readonly MusicVideoMeasureCue[];
  sourceMeasures: readonly MusicVideoMeasure[];
  bpm: number;
  selectedActorId: string | null;
  disabled: boolean;
  onChange: (scene: MusicVideoScene) => void;
  onSelectedActorChange: (id: string | null) => void;
  onStatus?: (message: string) => void;
}>;

const ACTOR_NAMES = ["손", "스위치", "전등", "새", "사람", "꽃", "나무", "물체"];

export default function SceneActionEditor({ scene, measures, sourceMeasures, bpm, selectedActorId,
  disabled, onChange, onSelectedActorChange, onStatus }: Props) {
  const choreography = sceneChoreography(scene);
  const actor = choreography.actors.find((item) => item.id === selectedActorId);
  const actions = actor ? choreography.actions.filter((action) => action.actorId === actor.id) : [];
  const hasAssignedDrawing = choreography.actors.some((item) => item.elementIds.length);

  function remainingBeats(measureIndex: number, startBeat: number) {
    const cue = measures.find((measure) => measure.measureIndex === measureIndex);
    if (!cue || !measures.length) return 0;
    return Math.max(0, Math.round(((measures.at(-1)!.endSeconds - cue.startSeconds) * bpm / 60 - startBeat) * 1000) / 1000);
  }

  function addActor(name: string) {
    if (choreography.actors.length >= 12 || disabled) return;
    const next = createSceneActor([], name);
    onChange({ ...scene, choreography: { ...choreography, actors: [...choreography.actors, next] } });
    onSelectedActorChange(next.id);
    onStatus?.(`${name}에 해당하는 선을 그림에서 선택해 주세요.`);
  }

  function removeActor() {
    if (!actor) return;
    const actors = choreography.actors.filter((item) => item.id !== actor.id);
    onChange({ ...scene, choreography: { ...choreography, actors,
      actions: choreography.actions.filter((action) => action.actorId !== actor.id) } });
    onSelectedActorChange(actors[0]?.id ?? null);
  }

  function changeAction(action: SceneAction, patch: Partial<SceneAction>) {
    const candidate = { ...action, ...patch };
    const remaining = remainingBeats(candidate.startMeasureIndex, candidate.startBeat);
    const next = remaining > 0 ? { ...candidate, durationBeats: Math.min(candidate.durationBeats, remaining) } : candidate;
    onChange({ ...scene, choreography: { ...choreography,
      actions: choreography.actions.map((item) => item.id === action.id ? next : item) } });
  }

  function recommend() {
    const proposal = planSceneActions({ scene, measures: sourceMeasures, bpm,
      startMeasureIndex: measures[0]?.measureIndex, endMeasureIndex: measures.at(-1)?.measureIndex });
    const existing = choreography.actions;
    const fresh = proposal.actions.filter((action) => !existing.some((item) => item.actorId === action.actorId &&
      item.kind === action.kind && item.startMeasureIndex === action.startMeasureIndex && item.startBeat === action.startBeat));
    const combined = [...existing, ...fresh].slice(0, 48);
    if (combined.length !== existing.length) {
      onChange({ ...scene, choreography: { ...choreography, actions: combined } });
      onSelectedActorChange(fresh[0]?.actorId ?? selectedActorId);
    }
    onStatus?.(fresh.length ? `${combined.length - existing.length}개 동작을 추가했어요. 대상과 시작 박을 확인해 주세요.`
      : proposal.messages.join(" ") || "새로 추가할 동작이 없어요. 동작을 직접 넣어 주세요.");
  }

  return <section className="mv-action-editor" aria-label="가사에 맞는 동작 연출" data-testid="scene-action-editor">
    <div className="mv-action-heading"><StudioArtwork name="select" size={20} /><h4>대상별 동작 연출</h4><span>브라우저에서 바로</span></div>
    <p className="mv-action-help">움직일 선을 묶고 고정점과 도착점을 정해 주세요. 가사에 맞춰 선의 모양이 변해요.</p>
    <div className="mv-actor-presets" aria-label="동작 대상 추가">
      {ACTOR_NAMES.map((name) => <button type="button" key={name} disabled={disabled || choreography.actors.length >= 12}
        aria-label={`${name} 대상 추가`} onClick={() => addActor(name)}><StudioArtwork name="plus" size={15} />{name}</button>)}
    </div>
    <label className="mv-field"><span>움직일 대상</span><select data-testid="scene-actor-select" aria-label="움직일 대상"
      value={actor?.id ?? ""} disabled={disabled || !choreography.actors.length}
      onChange={(event) => onSelectedActorChange(event.target.value || null)}>
      <option value="">대상을 골라 주세요</option>
      {choreography.actors.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.elementIds.length}개 선</option>)}
    </select></label>
    {actor && <div className="mv-actor-card" data-testid="scene-selected-actor">
      <div className="mv-actor-title"><input key={`${actor.id}:${actor.name}`} type="text" aria-label="대상 이름"
        defaultValue={actor.name} maxLength={40} disabled={disabled} onBlur={(event) => {
          const name = event.target.value.trim() || "대상";
          if (name !== actor.name) onChange(changeSceneActor(scene, actor.id, { name }));
        }} /><button type="button" className="mv-action-icon" aria-label="선택한 대상 삭제" disabled={disabled}
          onClick={removeActor}><StudioArtwork name="delete" size={18} /></button></div>
      <p className="mv-action-help">그림의 선을 누르거나 영역을 드래그해 선택해요. 다른 대상의 선을 선택하면 이 대상으로 옮겨요.</p>
      <details className="mv-stroke-picker"><summary>포함할 선 선택 · {actor.elementIds.length}/{scene.elements.length}</summary>
        <div className="mv-stroke-buttons"><button type="button" disabled={disabled || !scene.elements.length}
          onClick={() => onChange(assignActorElements(scene, actor.id, scene.elements.map((element) => element.id)))}>모든 선</button>
          <button type="button" disabled={disabled || !actor.elementIds.length}
            onClick={() => onChange(assignActorElements(scene, actor.id, []))}>선택 해제</button></div>
        <div className="mv-stroke-list">{scene.elements.map((element, index) => {
          const owner = choreography.actors.find((item) => item.id !== actor.id && item.elementIds.includes(element.id));
          const checked = actor.elementIds.includes(element.id);
          return <label key={element.id}><input type="checkbox" aria-label={`${index + 1}번 선 포함`} checked={checked}
            disabled={disabled} onChange={() => onChange(assignActorElements(scene, actor.id,
              checked ? actor.elementIds.filter((id) => id !== element.id) : [...actor.elementIds, element.id]))} />
            <span style={{ background: element.color }} />{index + 1}번 선{owner && <small>{owner.name}</small>}</label>;
        })}</div>
      </details>
      {actor.elementIds.length > 0 && <details className="mv-coordinate-picker"><summary>고정점·도착점 좌표</summary>
        <p className="mv-action-help">그림의 점을 드래그하거나 좌표를 입력해 위치를 조정해요.</p>
        {([{ key: "fixedPoint", label: "고정점" }, { key: "movingPoint", label: "움직일 점" },
          { key: "endPoint", label: "도착점" }] as const).map(({ key, label }) => <div className="mv-coordinate-row" key={key}>
          <span>{label}</span>{(["X", "Y"] as const).map((axis, axisIndex) => <label key={axis}>
            <span>{axis}</span><input type="number" aria-label={`${label} ${axis} 좌표`} min={0} max={axisIndex === 0 ? 960 : 540}
              value={actor[key][axisIndex]} disabled={disabled} onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value) || value < 0 || value > (axisIndex === 0 ? 960 : 540)) return;
                const point = [...actor[key]] as [number, number];
                point[axisIndex] = value;
                onChange(changeSceneActor(scene, actor.id, { [key]: point }));
              }} /></label>)}</div>)}
      </details>}
      {!actor.elementIds.length && <p className="mv-action-notice">이 대상에 해당하는 선을 먼저 선택해 주세요.</p>}
      {actor.elementIds.length > 0 && Math.hypot(actor.fixedPoint[0] - actor.movingPoint[0],
        actor.fixedPoint[1] - actor.movingPoint[1]) < 6 && <p className="mv-action-notice">고정점과 움직일 점을 벌려 주세요. 두 점 사이의 선이 자연스럽게 굽혀져요.</p>}
    </div>}
    <label className="mv-field mv-action-description"><span>연출 메모</span>
      <textarea key={`${scene.id}:${choreography.description}`} aria-label="장면 동작 설명" rows={2} maxLength={1000}
        defaultValue={choreography.description} placeholder="동작을 어떻게 표현할지 적어두세요" disabled={disabled}
        onBlur={(event) => { if (event.target.value !== choreography.description)
          onChange({ ...scene, choreography: { ...choreography, description: event.target.value } }); }} />
    </label>
    <button type="button" className="mv-recommend-actions" data-testid="scene-recommend-actions"
      disabled={disabled || !hasAssignedDrawing || !measures.length || choreography.actions.length >= 48} onClick={recommend}>
      <StudioArtwork name="sparkles" size={20} /> 가사에서 동작 추천</button>
    <p className="mv-action-help">누르기·굽히기·뛰기·날갯짓·켜기·끄기 등 지원하는 가사 표현을 찾아 동작을 추가해요. 기존 동작은 유지돼요.</p>
    {actor && <div className="mv-actor-actions"><div className="mv-action-list-heading"><strong>{actor.name}의 동작</strong>
      <button type="button" data-testid="scene-add-action" disabled={disabled || !actor.elementIds.length ||
        !measures.length || choreography.actions.length >= 48} onClick={() => {
          const action = createSceneAction(actor.id, "move", measures[0]?.measureIndex ?? 0);
          const durationBeats = Math.min(action.durationBeats, remainingBeats(action.startMeasureIndex, 0));
          if (durationBeats > 0) onChange({ ...scene, choreography: { ...choreography,
            actions: [...choreography.actions, { ...action, durationBeats }] } });
        }}><StudioArtwork name="plus" size={18} /> 동작 추가</button></div>
      {!actions.length && <p className="mv-action-help">가사에서 추천받거나 동작을 직접 추가해 주세요.</p>}
      {actions.map((action, index) => {
        const cue = measures.find((measure) => measure.measureIndex === action.startMeasureIndex);
        const beatCount = cue ? (cue.endSeconds - cue.startSeconds) * bpm / 60 : 16;
        const remaining = remainingBeats(action.startMeasureIndex, action.startBeat);
        return <div className="mv-action-card" key={action.id} data-testid="scene-action-card">
          <div className="mv-action-card-heading"><span>동작 {index + 1}</span><button type="button" className="mv-action-icon"
            aria-label={`${index + 1}번 동작 삭제`} disabled={disabled} onClick={() => onChange({ ...scene,
              choreography: { ...choreography, actions: choreography.actions.filter((item) => item.id !== action.id) } })}>
            <StudioArtwork name="delete" size={17} /></button></div>
          <label className="mv-field"><span>어떤 동작인가요?</span><select aria-label={`${index + 1}번 동작 종류`}
            value={action.kind} disabled={disabled} onChange={(event) => changeAction(action, { kind: event.target.value as SceneActionKind })}>
            {Object.entries(SCENE_ACTION_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
          </select></label>
          <label className="mv-field"><span>시작 마디</span><select aria-label={`${index + 1}번 동작 시작 마디`}
            value={action.startMeasureIndex} disabled={disabled} onChange={(event) => changeAction(action,
              { startMeasureIndex: Number(event.target.value), startBeat: 0 })}>
            {!cue && <option value={action.startMeasureIndex}>{action.startMeasureIndex + 1}마디 · 장면 밖</option>}
            {measures.map((measure) => <option key={measure.key} value={measure.measureIndex}>{measure.label}</option>)}
          </select></label>
          <div className="mv-action-time"><label className="mv-field"><span>시작 박</span><input type="number"
            aria-label={`${index + 1}번 동작 시작 박`} min={1} max={Math.max(1, beatCount)} step={.25} value={action.startBeat + 1}
            disabled={disabled} onChange={(event) => { const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 1 && value <= beatCount) changeAction(action, { startBeat: value - 1 }); }} /></label>
            <label className="mv-field"><span>길이 · 박</span><input type="number" aria-label={`${index + 1}번 동작 길이`}
              min={.01} max={remaining > 0 ? Math.min(64, remaining) : 64} step={.25} value={action.durationBeats} disabled={disabled} onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0 && value <= 64) changeAction(action, { durationBeats: value });
              }} /></label></div>
          <label className="mv-action-strength"><span>움직임 크기 <output>{Math.round(action.strength * 100)}%</output></span>
            <input type="range" aria-label={`${index + 1}번 동작 크기`} min={.1} max={2} step={.05} value={action.strength}
              disabled={disabled} onChange={(event) => changeAction(action, { strength: Number(event.target.value) })} /></label>
          {!cue && <p className="mv-action-notice">현재 장면의 마디를 다시 선택해 주세요.</p>}
          {cue && action.durationBeats > remaining + .001 && <p className="mv-action-notice">동작이 장면보다 길어요. 시작 박이나 길이를 줄여 주세요.</p>}
        </div>;
      })}
    </div>}
  </section>;
}
