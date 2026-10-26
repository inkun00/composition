import { useId, useState } from "react";
import { findSceneRangeConflicts, getSceneRangeIssue } from "../video/musicVideoSceneRanges";
import type { MusicVideoMeasureCue, MusicVideoScene } from "../video/musicVideoModel";
import type { SceneActionRangeIssue } from "./sceneTimingIssues";
import "./SceneRangeWarnings.css";

type Props = Readonly<{
  scenes: readonly MusicVideoScene[];
  measures: readonly MusicVideoMeasureCue[];
  disabled: boolean;
  onSelect: (index: number) => void;
  onShift: () => void;
  shiftIssue?: string;
  actionIssues?: readonly SceneActionRangeIssue[];
}>;

function measureLabel(startIndex: number, endIndex: number, measures: readonly MusicVideoMeasureCue[]) {
  const start = (measures[startIndex]?.measureIndex ?? startIndex) + 1;
  const end = (measures[endIndex]?.measureIndex ?? endIndex) + 1;
  return start === end ? `${start}마디` : `${start}–${end}마디`;
}

export default function SceneRangeWarnings({ scenes, measures, disabled, onSelect, onShift, shiftIssue,
  actionIssues = [] }: Props) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const conflicts = findSceneRangeConflicts(scenes, measures);
  const issue = getSceneRangeIssue(scenes, measures);
  if (!conflicts.length && !issue && !actionIssues.length) return null;
  const compactLabel = conflicts.length
    ? `${measureLabel(conflicts[0].startIndex, conflicts[0].endIndex, measures)} 겹침`
    : issue ? "장면 구간 문제" : "장면 동작 문제";

  function selectProblem(index: number) {
    setExpanded(false);
    onSelect(index);
  }

  return <section className="mv-range-warning" data-testid="scene-range-warning" aria-label="장면 구간 확인">
    <button type="button" className="mv-range-warning-toggle" data-testid="scene-range-warning-toggle"
      aria-expanded={expanded} aria-controls={detailsId} disabled={disabled} onClick={() => setExpanded((value) => !value)}>
      <strong>{compactLabel} · 영상 제작 제한</strong><span>{expanded ? "접기" : "자세히 보기"}</span>
    </button>
    <div id={detailsId} className="mv-range-warning-content" data-expanded={expanded}>
      <div className="mv-range-warning-heading">
        <div><strong>{conflicts.length ? "겹치는 마디를 정리해 주세요"
          : issue ? "장면 구간을 확인해 주세요" : "장면 동작을 확인해 주세요"}</strong>
          <p role="status">{conflicts.length ? "겹친 구간이 있으면 뮤직비디오를 만들 수 없어요."
            : issue ?? "동작의 마디·박자 문제를 해결하기 전에는 뮤직비디오를 만들 수 없어요."}</p></div>
        {conflicts.length > 0 && <button type="button" data-testid="scene-range-shift-forward"
          disabled={disabled || Boolean(shiftIssue)} title={shiftIssue}
          onClick={onShift}>겹친 장면부터 뒤로 밀기</button>}
      </div>
      {conflicts.length > 0 && <>
        <ul className="mv-range-conflict-list">
          {conflicts.map((conflict) => <li key={`${conflict.startIndex}:${conflict.endIndex}:${conflict.sceneIndices.join(",")}`}
            data-testid="scene-range-conflict-row">
            <strong>{measureLabel(conflict.startIndex, conflict.endIndex, measures)} 겹침</strong>
            <div>{conflict.sceneIndices.map((index) => <button type="button" key={scenes[index]?.id ?? index}
              disabled={disabled} onClick={() => selectProblem(index)} aria-label={`겹친 장면 ${index + 1} 선택`}>
              장면 {index + 1} 보기</button>)}</div>
          </li>)}
        </ul>
        {shiftIssue && <p className="mv-range-shift-issue">{shiftIssue}</p>}
        <p className="mv-range-resolution-help">장면을 선택해 시작·마지막 마디를 앞뒤로 바꾸거나, 필요 없는 장면을 삭제하세요.
          뒤로 밀기는 겹친 장면과 그 뒤 장면의 길이를 유지해 이동해요. 노래 끝에 공간이 없으면 구간을 줄이거나 장면을 삭제해 주세요.</p>
      </>}
      {!conflicts.length && issue && <p className="mv-range-resolution-help">장면 설정의 시작·마지막 마디를 바꿔 빈 마디 없이 연결해 주세요.
        타임라인에서 장면을 선택해 수정하거나 필요 없는 장면을 삭제할 수 있어요.</p>}
      {actionIssues.length > 0 && <>
        <ul className="mv-range-conflict-list" aria-label="장면 동작 문제">
          {actionIssues.map((actionIssue) => <li key={scenes[actionIssue.sceneIndex]?.id ?? actionIssue.sceneIndex}
            data-testid="scene-action-conflict-row">
            <strong>{actionIssue.message}</strong>
            <button type="button" disabled={disabled} onClick={() => selectProblem(actionIssue.sceneIndex)}
              aria-label={`동작 문제 장면 ${actionIssue.sceneIndex + 1} 선택`}>장면 {actionIssue.sceneIndex + 1} 보기</button>
          </li>)}
        </ul>
        <p className="mv-range-resolution-help">해당 장면의 시작·마지막 마디를 조절하거나, 모션그래픽에서 전체 그림의 움직임을 다시 골라 주세요.
          애니메이션 없음으로 만들 때도 문제를 먼저 해결해야 해요.</p>
      </>}
    </div>
  </section>;
}
