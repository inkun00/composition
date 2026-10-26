import type { MusicVideoScene, SceneMotion } from "../video/musicVideoModel";

type PresetId = Exclude<SceneMotion, "auto" | "sway">;
export type SceneMotionCategory = "entrance" | "transition" | "travel" | "atmosphere";
export type SceneMotionPreset = Readonly<{
  id: PresetId;
  label: string;
  description: string;
  category: SceneMotionCategory;
}>;

export const SCENE_MOTION_CATEGORIES: readonly Readonly<{ id: SceneMotionCategory; label: string }>[] = [
  { id: "entrance", label: "등장" },
  { id: "transition", label: "전환" },
  { id: "travel", label: "이동" },
  { id: "atmosphere", label: "분위기" }
];

/** Explicit choices apply to the entire drawing; no object or lyric inference is performed. */
export const SCENE_MOTION_PRESETS: readonly SceneMotionPreset[] = [
  { id: "still", label: "움직임 없음", description: "그린 모습 그대로", category: "atmosphere" },
  { id: "draw-on", label: "한 획씩 그리기", description: "그린 순서대로 차례차례", category: "entrance" },
  { id: "fade", label: "서서히 나타나기", description: "그림이 부드럽게 등장", category: "entrance" },
  { id: "slide", label: "옆에서 들어오기", description: "왼쪽에서 제자리로", category: "entrance" },
  { id: "zoom", label: "천천히 확대", description: "조금씩 가까워지는 그림", category: "transition" },
  { id: "float", label: "둥실둥실", description: "가볍게 위아래로 둥실", category: "atmosphere" },
  { id: "bounce", label: "통통 뛰기", description: "음악 박자에 맞춰 통통", category: "atmosphere" },
  { id: "pulse", label: "박자에 맞춰 팡팡", description: "박자마다 커졌다 작아져요", category: "atmosphere" },
  { id: "pop-in", label: "팝업 등장", description: "작게 시작해 톡 나타나요", category: "entrance" },
  { id: "iris", label: "원형 펼침", description: "동그랗게 그림이 펼쳐져요", category: "transition" },
  { id: "curtain", label: "커튼 열기", description: "가운데부터 양쪽으로 열려요", category: "transition" },
  { id: "assemble", label: "조각 모으기", description: "네모 조각이 모여 한 장면으로", category: "entrance" },
  { id: "sparkle", label: "별빛 반짝이", description: "그림 위에 작은 별이 반짝", category: "atmosphere" },
  { id: "confetti", label: "색종이 축하", description: "알록달록 색종이가 내려와요", category: "atmosphere" },
  { id: "rotate-in", label: "회전 등장", description: "빙글 돌며 제자리에 나타나요", category: "entrance" },
  { id: "flip-in", label: "카드 뒤집기", description: "카드처럼 뒤집혀 나타나요", category: "entrance" },
  { id: "diagonal-reveal", label: "사선으로 나타나기", description: "모서리부터 비스듬히 펼쳐져요", category: "transition" },
  { id: "zoom-out", label: "천천히 멀어지기", description: "가까이서 점점 멀어지는 그림", category: "transition" },
  { id: "snow", label: "눈 내리기", description: "하얀 눈송이가 사르르 내려요", category: "atmosphere" },
  { id: "spotlight", label: "스포트라이트", description: "그림 위를 조명이 비춰요", category: "atmosphere" },
  { id: "move-left", label: "왼쪽으로 이동", description: "왼쪽으로 천천히", category: "travel" },
  { id: "move-right", label: "오른쪽으로 이동", description: "오른쪽으로 천천히", category: "travel" },
  { id: "move-up", label: "위로 이동", description: "위쪽으로 천천히", category: "travel" },
  { id: "move-down", label: "아래로 이동", description: "아래쪽으로 천천히", category: "travel" },
  { id: "move-up-left", label: "왼쪽 위로 이동", description: "왼쪽 위 대각선으로", category: "travel" },
  { id: "move-up-right", label: "오른쪽 위로 이동", description: "오른쪽 위 대각선으로", category: "travel" },
  { id: "move-down-left", label: "왼쪽 아래로 이동", description: "왼쪽 아래 대각선으로", category: "travel" },
  { id: "move-down-right", label: "오른쪽 아래로 이동", description: "오른쪽 아래 대각선으로", category: "travel" },
  { id: "bounce-left", label: "통통 왼쪽으로", description: "박자에 맞춰 왼쪽으로 통통", category: "travel" },
  { id: "bounce-right", label: "통통 오른쪽으로", description: "박자에 맞춰 오른쪽으로 통통", category: "travel" }
];

export function getSceneMotionLabel(scene: MusicVideoScene): string {
  if (scene.elements.some((element) => element.motion !== undefined)) return "개체별 움직임";
  if (scene.choreography?.actions.length) return "이전 움직임";
  return SCENE_MOTION_PRESETS.find((preset) => preset.id === scene.motion)?.label ??
    (scene.motion === "sway" ? "살랑살랑" : "움직임 없음");
}
