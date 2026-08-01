export type HomrStatus = Readonly<{
  available: boolean;
  runner: "homr" | "uvx" | null;
  platform: string;
  detail: string;
}>;

type HomrErrorPayload = Readonly<{
  code?: string;
  message?: string;
}>;

export class HomrLocalError extends Error {
  readonly code: string;

  constructor(message: string, code = "HOMR_ERROR") {
    super(message);
    this.name = "HomrLocalError";
    this.code = code;
  }
}

async function errorFromResponse(response: Response): Promise<HomrLocalError> {
  let payload: HomrErrorPayload = {};
  try {
    payload = await response.json() as HomrErrorPayload;
  } catch {
    // The local helper may not be running, in which case Vite can return an HTML error page.
  }
  return new HomrLocalError(
    payload.message || "악보 읽기 기능에 연결하지 못했어요. 앱을 다시 열어 주세요.",
    payload.code || (response.status === 404 ? "LOCAL_SERVER_MISSING" : "HOMR_ERROR")
  );
}

async function localFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch {
    throw new HomrLocalError(
      "악보 읽기 기능을 시작하지 못했어요. 앱을 다시 실행해 주세요.",
      "LOCAL_SERVER_MISSING"
    );
  }
}

export async function getHomrStatus(): Promise<HomrStatus> {
  const response = await localFetch("/api/homr/status", {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw await errorFromResponse(response);
  return response.json() as Promise<HomrStatus>;
}

export async function installHomrRuntime(): Promise<HomrStatus> {
  const response = await localFetch("/api/homr/install", {
    method: "POST",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw await errorFromResponse(response);
  return response.json() as Promise<HomrStatus>;
}

export async function recognizeWithHomr(file: File): Promise<File> {
  const response = await localFetch("/api/homr/recognize", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Score-Filename": encodeURIComponent(file.name)
    },
    body: file
  });
  if (!response.ok) throw await errorFromResponse(response);
  const musicXml = await response.arrayBuffer();
  const title = file.name.replace(/\.[^.]+$/, "") || "homr-score";
  return new File([musicXml], `${title}.musicxml`, { type: "application/xml" });
}
