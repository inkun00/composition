import { drawPracticeVideoBars } from "./practiceVideoBars";
import {
  drawVideoText, PRACTICE_VIDEO_HEIGHT, PRACTICE_VIDEO_WIDTH,
  practiceVideoPage, practiceVideoTrackBounds, roundedVideoRect
} from "./practiceVideoLayout";
import { practiceVideoMeasureAtTime } from "./practiceVideoPlan";
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
    const active = practiceVideoMeasureAtTime(plan.measures, time);
    context!.fillStyle = "#edf5f1";
    context!.fillRect(0, 0, PRACTICE_VIDEO_WIDTH, PRACTICE_VIDEO_HEIGHT);
    context!.textAlign = "left";
    drawVideoText(context!, plan.title, 36, 40, 915, 34, "#24483c", 700);
    drawVideoText(context!, `${plan.meter.beats}/${plan.meter.beatUnit} 박자 · 빠르기 ${plan.bpm} BPM · ${mode === "score" ? "악보 모드" : "막대 모드"}`,
      38, 77, 1020, 20, "#5c756b");
    context!.textAlign = "right";
    drawVideoText(context!, `${active.index + 1} / ${plan.measures.at(-1)!.index + 1}마디`, 1242, 42, 240, 24, "#247458", 700);
    context!.textAlign = "left";
    for (const [trackIndex] of plan.tracks.entries()) {
      const bounds = practiceVideoTrackBounds(trackIndex, plan.tracks.length);
      context!.fillStyle = "#fff";
      roundedVideoRect(context!, bounds.x, bounds.y, bounds.width, bounds.height);
      context!.fill();
    }
    const page = practiceVideoPage(plan, time);
    if (drawScore) drawScore(context!, page, time);
    else drawPracticeVideoBars(context!, plan, page, time);
    const fraction = time / plan.durationSeconds;
    context!.fillStyle = "#ccded4";
    roundedVideoRect(context!, 38, 674, 1135, 8, 4);
    context!.fill();
    context!.fillStyle = "#3b9678";
    roundedVideoRect(context!, 38, 674, Math.max(1, fraction * 1135), 8, 4);
    context!.fill();
    context!.textAlign = "right";
    drawVideoText(context!, `${Math.floor(time)}초 / ${Math.ceil(plan.durationSeconds)}초`, 1242, 678, 130, 16, "#5b756a");
    context!.textAlign = "left";
  }

  draw(0);
  return { canvas, draw };
}
