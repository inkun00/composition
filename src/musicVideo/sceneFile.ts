import { isMusicVideoScenes, type MusicVideoScene, SCENE_HEIGHT, SCENE_WIDTH } from "../video/musicVideoModel";
import { drawSceneElements } from "../video/musicVideoRenderer";

export const MAX_SCENE_FILE_BYTES = 2 * 1024 * 1024;
const FORMAT = "maeum-melody-scene";
const invalidFile = () => new Error("올바른 장면 파일이 아니에요. 장면 저장으로 만든 JSON 파일을 선택해 주세요.");

export function serializeSceneFile(scene: MusicVideoScene): string {
  if (!isMusicVideoScenes([scene])) throw invalidFile();
  const text = JSON.stringify({ format: FORMAT, version: 1, scene }, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_SCENE_FILE_BYTES) {
    throw new Error("장면 파일은 2MB까지 저장할 수 있어요. 선이나 동작을 줄여 주세요.");
  }
  return text;
}

export function parseSceneFile(text: string): MusicVideoScene {
  if (new TextEncoder().encode(text).byteLength > MAX_SCENE_FILE_BYTES) {
    throw new Error("장면 파일은 2MB까지 불러올 수 있어요.");
  }
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw invalidFile(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidFile();
  const file = value as Record<string, unknown>;
  if (file.format !== FORMAT || file.version !== 1 || !isMusicVideoScenes([file.scene])) throw invalidFile();
  return file.scene as MusicVideoScene;
}

export async function readSceneFile(file: File): Promise<MusicVideoScene> {
  if (file.size > MAX_SCENE_FILE_BYTES) throw new Error("장면 파일은 2MB까지 불러올 수 있어요.");
  let text: string;
  try { text = await file.text(); }
  catch { throw new Error("장면 파일을 읽지 못했어요. 파일을 다시 선택해 주세요."); }
  return parseSceneFile(text);
}

/** Reset only the selected drawing. Song timing and the scene identity remain stable. */
export function resetScene(scene: MusicVideoScene): MusicVideoScene {
  return { id: scene.id, background: "#ffffff", elements: [], motion: "still", endLyric: scene.endLyric,
    ...(scene.section === "intro" ? { section: "intro" } : {}),
    ...(scene.startMeasureIndex !== undefined ? { startMeasureIndex: scene.startMeasureIndex } : {}),
    ...(scene.endMeasureIndex !== undefined ? { endMeasureIndex: scene.endMeasureIndex } : {}) };
}

/** Imported actions keep their authored bars so the editor can flag any needed timing adjustments. */
export function importSceneInto(current: MusicVideoScene, imported: MusicVideoScene): MusicVideoScene {
  const { section: _section, startMeasureIndex: _start, ...drawing } = imported;
  return { ...drawing, id: current.id, endLyric: current.endLyric, endMeasureIndex: current.endMeasureIndex,
    ...(current.startMeasureIndex !== undefined ? { startMeasureIndex: current.startMeasureIndex } : {}),
    ...(current.section === "intro" ? { section: "intro" } : {}) };
}

function fileName(title: string, sceneNumber: number, extension: string): string {
  const safe = title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 40) || "나의노래";
  return `${safe}-장면${String(sceneNumber).padStart(2, "0")}.${extension}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  try { link.click(); }
  finally { window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}

export function saveSceneFile(scene: MusicVideoScene, title: string, sceneNumber: number): void {
  const blob = new Blob([serializeSceneFile(scene)], { type: "application/json;charset=utf-8" });
  download(blob, fileName(title, sceneNumber, "scene.json"));
}

export async function saveScenePng(scene: MusicVideoScene, title: string, sceneNumber: number): Promise<void> {
  if (!isMusicVideoScenes([scene])) throw invalidFile();
  const canvas = document.createElement("canvas");
  canvas.width = SCENE_WIDTH;
  canvas.height = SCENE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("장면 이미지를 만들 수 없어요. 다른 브라우저에서 다시 시도해 주세요.");
  drawSceneElements(context, scene);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((image) => {
    if (image) resolve(image);
    else reject(new Error("PNG 이미지를 만들지 못했어요. 다시 시도해 주세요."));
  }, "image/png"));
  download(blob, fileName(title, sceneNumber, "png"));
}
