import html2canvas from "html2canvas";
import { runExclusiveAudioExport, type PlaybackMeasure } from "../audio/player";
import { renderPracticeAudio } from "../practice/practiceAudio";
import type { PracticeAudioInput } from "../practice/practiceAudioTypes";
import { buildPracticeVideoPlan } from "../practice/practiceVideoPlan";
import { preparePracticeVideoRenderer } from "../practice/practiceVideoRenderer";
import { practiceVideoPage } from "../practice/practiceVideoLayout";
import { buildLyricVideoPlan } from "../video/lyricVideoPlan";
import { exportLyricMp4 } from "../video/exportLyricMp4";

const TITLE = "건강 비빔밥";
const WIDTH = 1280;
const HEIGHT = 720;
const FONT = '"SUITE", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export function textbookFileName(creator: string, format: "png" | "mp4"): string {
  const name = creator.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().replace(/[. ]+$/, "").slice(0, 60);
  return `${TITLE}-${name || "나의 작품"}.${format}`;
}

function checkCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("파일 만들기를 멈췄어요.", "AbortError");
}

async function waitForSheet(element: HTMLElement, signal?: AbortSignal): Promise<void> {
  checkCanceled(signal);
  if (!element.isConnected) throw new Error("완성 악보가 준비된 뒤 다시 저장해 주세요.");
  await document.fonts?.ready;
  checkCanceled(signal);
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    checkCanceled(signal);
    const scores = [...element.querySelectorAll<HTMLElement>('[data-vex-score="true"]')];
    if (scores.every((score) => score.dataset.vexReady === "true")) {
      const images = [...element.querySelectorAll("img")];
      await Promise.all(images.map(async (image) => {
        if (typeof image.decode === "function") await image.decode();
        if (!image.complete || !image.naturalWidth) throw new Error("악보의 그림을 불러오지 못했어요. 다시 저장해 주세요.");
      }));
      checkCanceled(signal);
      return;
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("악보를 그리는 중이에요. 잠시 뒤 다시 저장해 주세요.");
}

/** Capture the caller's complete, fixed-width score rather than the mobile editor. */
export async function downloadTextbookScore(element: HTMLElement, creator: string, signal?: AbortSignal): Promise<void> {
  await waitForSheet(element, signal);
  checkCanceled(signal);
  const bounds = element.getBoundingClientRect();
  const width = Math.ceil(bounds.width);
  const height = Math.ceil(Math.max(bounds.height, element.scrollHeight));
  if (!width || !height) throw new Error("완성 악보가 준비된 뒤 다시 저장해 주세요.");
  const canvas = await html2canvas(element, {
    scale: 2,
    width,
    height,
    windowWidth: Math.max(1200, width + 80),
    windowHeight: Math.max(900, height + 80),
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false
  });
  checkCanceled(signal);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("악보 이미지를 만들지 못했어요.")), "image/png");
  });
  checkCanceled(signal);
  downloadTextbookBlob(blob, textbookFileName(creator, "png"));
}

export function downloadTextbookBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    link.remove();
  }
  // Give the browser time to take ownership of the download before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Original PCM and the same authored notation are encoded together; no microphone is used. */
export async function createTextbookVideo(
  measures: readonly PlaybackMeasure[], creator: string, bpm: number,
  onProgress: (percent: number) => void, signal: AbortSignal
): Promise<Blob> {
  const checkAbort = () => {
    if (signal.aborted) throw new DOMException("영상 만들기를 멈췄어요.", "AbortError");
  };
  checkAbort();
  const input: PracticeAudioInput = {
    title: TITLE,
    measures: measures.map((measure) => ({ notes: measure.notes.map((note) => ({ ...note, duration: { ...note.duration } })) })),
    meter: { beats: 4, beatUnit: 4 },
    bpm,
    melodyInstrumentId: "piano",
    rhythmInstrumentId: "piano",
    step: "melody",
    mode: "melody",
    videoMode: "score"
  };
  const author = creator.trim() || "어린이 작곡가";
  const result = await runExclusiveAudioExport(async () => {
    checkAbort();
    onProgress(0);
    const rendered = await renderPracticeAudio(input, {
      signal, onProgress: (percent) => onProgress(Math.round(percent * .4))
    });
    checkAbort();
    const scorePlan = buildPracticeVideoPlan(input, rendered);
    const renderer = await preparePracticeVideoRenderer(scorePlan, "score");
    await document.fonts?.ready;
    checkAbort();
    onProgress(45);
    const lyricPlan = buildLyricVideoPlan(TITLE, input.measures, bpm, 0, rendered.buffer.duration);
    const blob = await exportLyricMp4(rendered.buffer, lyricPlan,
      (percent) => onProgress(45 + Math.round(percent * .55)), signal, {
        allowEmptyLyrics: true,
        frameRate: 12,
        drawFrame: (context, _frame, seconds) => {
          renderer.draw(seconds);
          context.fillStyle = "#000000";
          context.fillRect(0, 0, WIDTH, HEIGHT);
          context.drawImage(renderer.canvas, 0, 0);
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillStyle = "#fff8e9";
          context.font = `800 50px ${FONT}`;
          context.fillText(TITLE, WIDTH / 2, 83, WIDTH - 120);
          context.fillStyle = "#c6d9d4";
          context.font = `500 25px ${FONT}`;
          context.fillText(`${author} 작곡`, WIDTH / 2, 139, WIDTH - 120);
          const page = practiceVideoPage(scorePlan, seconds);
          context.font = `600 23px ${FONT}`;
          context.fillText(`${page[0].index + 1}–${page.at(-1)!.index + 1} / ${measures.length}마디`, WIDTH / 2, 590);
          context.fillStyle = "#e7bd69";
          context.font = `500 19px ${FONT}`;
          context.fillText(`4/4박자 · ♩ = ${bpm} · 피아노`, WIDTH / 2, 635);
        }
      });
    checkAbort();
    return blob;
  });
  checkAbort();
  if (!result) throw new Error("다른 연주나 파일 저장이 끝난 뒤 다시 시도해 주세요.");
  return result;
}
