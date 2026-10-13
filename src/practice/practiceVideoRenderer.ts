import { drawPracticeVideoBars } from "./practiceVideoBars";
import { PRACTICE_VIDEO_HEIGHT, PRACTICE_VIDEO_WIDTH, practiceVideoPage } from "./practiceVideoLayout";
import type { PracticeVideoMode, PracticeVideoPlan, PracticeVideoRenderer } from "./practiceVideoTypes";

/** One renderer is shared by the saving-panel preview and every encoded MP4 frame. */
export async function preparePracticeVideoRenderer(
  plan: PracticeVideoPlan, mode: PracticeVideoMode = "bars"
): Promise<PracticeVideoRenderer> {
  const canvas = document.createElement("canvas");
  canvas.width = PRACTICE_VIDEO_WIDTH;
  canvas.height = PRACTICE_VIDEO_HEIGHT;
  canvas.setAttribute("aria-label", mode === "score" ? "저장할 악보 영상 미리보기" : "저장할 막대 영상 미리보기");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("영상 화면을 만들 수 없어요.");
  const drawScore = mode === "score"
    ? await import("./practiceVideoScore").then((module) => module.preparePracticeVideoScore(plan)) : null;

  function draw(seconds: number): void {
    const time = Math.max(0, Math.min(plan.durationSeconds - 0.000001, seconds));
    context!.fillStyle = "#000";
    context!.fillRect(0, 0, PRACTICE_VIDEO_WIDTH, PRACTICE_VIDEO_HEIGHT);
    context!.textAlign = "left";
    const page = practiceVideoPage(plan, time);
    if (drawScore) drawScore(context!, page, time);
    else drawPracticeVideoBars(context!, plan, page, time);
  }

  draw(0);
  return { canvas, draw };
}
