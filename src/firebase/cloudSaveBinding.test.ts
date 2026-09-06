import { describe, expect, it } from "vitest";
import {
  CLOUD_SAVE_BINDING_KEY,
  clearCloudSaveBinding,
  readCloudSaveBinding,
  writeCloudSaveBinding
} from "./cloudSaveBinding";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

describe("프로젝트와 계정 저장 대상 연결", () => {
  it("페이지를 다시 열어도 같은 계정과 프로젝트의 작품 번호를 복원한다", () => {
    const storage = memoryStorage();
    expect(writeCloudSaveBinding(storage, { uid: "user-a", projectId: "project-a", scoreId: "score-a" })).toBe(true);
    expect(readCloudSaveBinding(storage, "user-a", "project-a")?.scoreId).toBe("score-a");
  });

  it("다른 계정이나 다른 프로젝트에는 이전 작품 번호를 연결하지 않는다", () => {
    const storage = memoryStorage();
    writeCloudSaveBinding(storage, { uid: "user-a", projectId: "project-a", scoreId: "score-a" });
    expect(readCloudSaveBinding(storage, "user-b", "project-a")).toBeNull();
    expect(readCloudSaveBinding(storage, "user-a", "project-b")).toBeNull();
  });

  it("깨진 데이터와 차단된 기기 저장소에서도 앱을 중단시키지 않는다", () => {
    expect(readCloudSaveBinding({ getItem: () => "{" }, "user-a", "project-a")).toBeNull();
    expect(writeCloudSaveBinding({
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => undefined
    }, { uid: "user-a", projectId: "project-a", scoreId: "score-a" })).toBe(false);
  });

  it("새 프로젝트를 시작하면 저장 대상 연결을 지운다", () => {
    const storage = memoryStorage();
    writeCloudSaveBinding(storage, { uid: "user-a", projectId: "project-a", scoreId: "score-a" });
    clearCloudSaveBinding(storage);
    expect(storage.getItem(CLOUD_SAVE_BINDING_KEY)).toBeNull();
  });
});
