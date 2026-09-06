export const CLOUD_SAVE_TIMEOUT_MS = 10_000;

type CloudSaveReliabilityOptions = Readonly<{
  online: boolean;
  save: () => Promise<string>;
  refresh: () => Promise<void>;
  timeoutMs?: number;
}>;

export type CloudSaveResult = Readonly<{
  scoreId: string;
  refreshFailed: boolean;
}>;

export function cloudScoreIdForSave(options: Readonly<{
  asCopy: boolean;
  activeScoreId: string | null;
  pendingScoreId: string | null;
  createScoreId: () => string;
}>): string {
  if (options.asCopy) return options.pendingScoreId ?? options.createScoreId();
  return options.activeScoreId ?? options.pendingScoreId ?? options.createScoreId();
}

export class CloudSaveAvailabilityError extends Error {
  readonly code: "cloud-save-offline" | "cloud-save-timeout";

  constructor(code: "cloud-save-offline" | "cloud-save-timeout") {
    super(code);
    this.name = "CloudSaveAvailabilityError";
    this.code = code;
  }
}

async function withinTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new CloudSaveAvailabilityError("cloud-save-timeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

export async function saveCloudScoreReliably({
  online,
  save,
  refresh,
  timeoutMs = CLOUD_SAVE_TIMEOUT_MS
}: CloudSaveReliabilityOptions): Promise<CloudSaveResult> {
  if (!online) throw new CloudSaveAvailabilityError("cloud-save-offline");
  const scoreId = await withinTimeout(save(), timeoutMs);
  try {
    await withinTimeout(refresh(), timeoutMs);
    return { scoreId, refreshFailed: false };
  } catch {
    return { scoreId, refreshFailed: true };
  }
}

export function cloudSaveErrorMessage(error: unknown, locallySaved: boolean): string {
  const localSuffix = locallySaved
    ? " 이 기기에는 안전하게 저장해 두었어요."
    : " 이 기기의 저장소도 사용할 수 없으니 창을 닫지 말고 다시 시도해 주세요.";
  if (error instanceof CloudSaveAvailabilityError) {
    if (error.code === "cloud-save-offline") {
      return `인터넷이 연결되지 않아 계정에 저장하지 못했어요.${localSuffix}`;
    }
    return `계정 저장 응답이 늦어 중단했어요. 인터넷을 확인한 뒤 다시 눌러 주세요.${localSuffix}`;
  }
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code).replace("firestore/", "")
    : "";
  if (code === "unauthenticated") return `로그인이 풀렸어요. 다시 로그인한 뒤 저장해 주세요.${localSuffix}`;
  if (code === "permission-denied") return `이 계정에는 저장 권한이 없어요. 다시 로그인해 주세요.${localSuffix}`;
  if (code === "unavailable" || code === "deadline-exceeded") {
    return `인터넷 연결이 불안정해요. 연결을 확인하고 다시 저장해 주세요.${localSuffix}`;
  }
  if (code === "resource-exhausted") return `클라우드 저장 공간을 확인해 주세요.${localSuffix}`;
  return `클라우드 저장에 실패했어요. 잠시 뒤 다시 시도해 주세요.${localSuffix}`;
}
