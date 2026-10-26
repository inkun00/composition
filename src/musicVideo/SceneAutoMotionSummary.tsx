import StudioArtwork from "./StudioArtwork";
import type { MusicVideoScene, SceneMotion } from "../video/musicVideoModel";
import { SCENE_MOTION_PRESETS } from "./sceneMotionPresets";
import "./SceneAutoMotions.css";

type Props = Readonly<{
  assignments: readonly Readonly<{ sceneId: string; motion: SceneMotion; reason: string }>[];
  scenes: readonly MusicVideoScene[];
  issue: string | null;
}>;

export default function SceneAutoMotionSummary({ assignments, scenes, issue }: Props) {
  const recommendations = assignments.flatMap((assignment) => {
    const index = scenes.findIndex((scene) => scene.id === assignment.sceneId);
    if (index < 0) return [];
    const scene = scenes[index];
    const applied = scene.motion === assignment.motion && scene.choreography === undefined &&
      scene.elements.every((element) => element.motion === undefined);
    const label = SCENE_MOTION_PRESETS.find((preset) => preset.id === assignment.motion)?.label ??
      (assignment.motion === "sway" ? "살랑살랑" : "움직임 없음");
    return [{ ...assignment, index, section: scene.section, applied, label }];
  });

  return <details className="mv-auto-motion-summary" data-testid="scene-auto-motions-summary">
    <summary aria-label="음악에 맞춘 자동 모션">
      <StudioArtwork name="music" size={20} />
      <span>음악에 맞춘 자동 모션</span>
      <StudioArtwork name="chevron-down" size={17} className="mv-auto-summary-chevron" />
    </summary>
    {issue ? <p className="mv-auto-summary-message" data-testid="scene-auto-motions-issue">{issue}</p>
      : recommendations.length ? <div className="mv-auto-summary-body">
        <p className="mv-auto-summary-message">현재 악보를 기준으로 고른 추천이에요.</p>
        <div className="mv-auto-summary-scroll" data-testid="scene-auto-motions-recommendations"
          role="region" aria-label="자동 모션 추천 목록" tabIndex={0}>
          <ul>
            {recommendations.map((item) => <li key={item.sceneId}
              data-testid={`scene-auto-motion-recommendation-${item.sceneId}`} data-motion={item.motion}>
              <div className="mv-auto-summary-copy">
                <span>{item.section === "intro" ? "전주" : `장면 ${item.index + 1}`}</span>
                <strong>{item.label}</strong>
                <p>{item.reason}</p>
              </div>
              <span className={`mv-auto-summary-status${item.applied ? " is-applied" : ""}`}
                data-testid={`scene-auto-motion-status-${item.sceneId}`} data-applied={item.applied}>
                {item.applied ? "적용됨" : "추천"}</span>
            </li>)}
          </ul>
        </div>
      </div> : <p className="mv-auto-summary-message">장면과 음악을 준비하면 추천을 확인할 수 있어요.</p>}
  </details>;
}
