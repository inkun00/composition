export const CLOUD_SAVE_BINDING_KEY = "maeum-melody:cloud-save-binding:v1";

export type CloudSaveBinding = Readonly<{
  uid: string;
  projectId: string;
  scoreId: string;
}>;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

export function createLocalProjectId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readCloudSaveBinding(
  storage: ReadableStorage,
  uid: string,
  projectId: string
): CloudSaveBinding | null {
  try {
    const raw = storage.getItem(CLOUD_SAVE_BINDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CloudSaveBinding>;
    if (parsed.uid !== uid || parsed.projectId !== projectId) return null;
    if (typeof parsed.scoreId !== "string" || parsed.scoreId.length === 0 || parsed.scoreId.length > 200) return null;
    return { uid, projectId, scoreId: parsed.scoreId };
  } catch {
    return null;
  }
}

export function writeCloudSaveBinding(storage: WritableStorage, binding: CloudSaveBinding): boolean {
  try {
    storage.setItem(CLOUD_SAVE_BINDING_KEY, JSON.stringify(binding));
    return true;
  } catch {
    return false;
  }
}

export function clearCloudSaveBinding(storage: WritableStorage): void {
  try {
    storage.removeItem(CLOUD_SAVE_BINDING_KEY);
  } catch {
    // 기기 저장소가 차단되어도 새 프로젝트는 계속 시작할 수 있어요.
  }
}
