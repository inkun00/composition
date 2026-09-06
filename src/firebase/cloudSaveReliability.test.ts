// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  CloudSaveAvailabilityError,
  cloudScoreIdForSave,
  cloudSaveErrorMessage,
  saveCloudScoreReliably
} from "./cloudSaveReliability";

describe("계정 프로젝트 저장 시뮬레이션", () => {
  it("오프라인 기기에서는 요청을 무한 대기시키지 않는다", async () => {
    const save = vi.fn().mockResolvedValue("score-1");
    await expect(saveCloudScoreReliably({
      online: false,
      save,
      refresh: vi.fn()
    })).rejects.toMatchObject({ code: "cloud-save-offline" });
    expect(save).not.toHaveBeenCalled();
  });

  it("느린 네트워크에서는 제한 시간이 지나면 버튼을 다시 사용할 수 있게 오류를 반환한다", async () => {
    vi.useFakeTimers();
    const pending = saveCloudScoreReliably({
      online: true,
      save: () => new Promise(() => undefined),
      refresh: vi.fn(),
      timeoutMs: 500
    });
    const timedOut = expect(pending).rejects.toBeInstanceOf(CloudSaveAvailabilityError);
    await vi.advanceTimersByTimeAsync(500);
    await timedOut;
    vi.useRealTimers();
  });

  it("제한 시간 안에 연결이 회복되면 정상 저장한다", async () => {
    vi.useFakeTimers();
    const pending = saveCloudScoreReliably({
      online: true,
      save: () => new Promise((resolve) => window.setTimeout(() => resolve("recovered-score"), 300)),
      refresh: vi.fn().mockResolvedValue(undefined),
      timeoutMs: 500
    });
    const completed = expect(pending).resolves.toEqual({ scoreId: "recovered-score", refreshFailed: false });
    await vi.advanceTimersByTimeAsync(300);
    await completed;
    vi.useRealTimers();
  });

  it("저장은 성공하고 목록 갱신만 실패한 경우 저장 성공으로 구분한다", async () => {
    const result = await saveCloudScoreReliably({
      online: true,
      save: vi.fn().mockResolvedValue("score-2"),
      refresh: vi.fn().mockRejectedValue(new Error("refresh failed"))
    });
    expect(result).toEqual({ scoreId: "score-2", refreshFailed: true });
  });

  it("계정 권한 오류는 저장 실패로 반환하고 목록을 갱신하지 않는다", async () => {
    const refresh = vi.fn();
    await expect(saveCloudScoreReliably({
      online: true,
      save: vi.fn().mockRejectedValue({ code: "permission-denied" }),
      refresh
    })).rejects.toMatchObject({ code: "permission-denied" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("저장 응답이 끊겨 재시도해도 같은 작품 번호를 사용해 중복을 막는다", () => {
    const createScoreId = vi.fn(() => "new-score");
    expect(cloudScoreIdForSave({
      asCopy: false,
      activeScoreId: null,
      pendingScoreId: "pending-score",
      createScoreId
    })).toBe("pending-score");
    expect(createScoreId).not.toHaveBeenCalled();
  });

  it("새 악보로 저장할 때는 현재 악보 번호 대신 새 번호를 사용한다", () => {
    expect(cloudScoreIdForSave({
      asCopy: true,
      activeScoreId: "active-score",
      pendingScoreId: null,
      createScoreId: () => "copied-score"
    })).toBe("copied-score");
  });

  it.each([
    { activeScoreId: null, pendingScoreId: null, expected: "created-score" },
    { activeScoreId: "active-score", pendingScoreId: null, expected: "active-score" },
    { activeScoreId: null, pendingScoreId: "pending-score", expected: "pending-score" }
  ])("일반 저장 대상 선택: $expected", ({ activeScoreId, pendingScoreId, expected }) => {
    expect(cloudScoreIdForSave({
      asCopy: false,
      activeScoreId,
      pendingScoreId,
      createScoreId: () => "created-score"
    })).toBe(expected);
  });

  it("저장 후 목록 응답이 멈춰도 제한 시간 뒤 저장 성공으로 마친다", async () => {
    vi.useFakeTimers();
    const pending = saveCloudScoreReliably({
      online: true,
      save: vi.fn().mockResolvedValue("score-3"),
      refresh: () => new Promise(() => undefined),
      timeoutMs: 500
    });
    const completed = expect(pending).resolves.toEqual({ scoreId: "score-3", refreshFailed: true });
    await vi.advanceTimersByTimeAsync(500);
    await completed;
    vi.useRealTimers();
  });

  it("계정·네트워크·기기 보존 상태를 구분해 안내한다", () => {
    expect(cloudSaveErrorMessage({ code: "permission-denied" }, true)).toContain("저장 권한");
    expect(cloudSaveErrorMessage({ code: "unavailable" }, true)).toContain("인터넷 연결");
    expect(cloudSaveErrorMessage(new CloudSaveAvailabilityError("cloud-save-timeout"), true))
      .toContain("이 기기에는 안전하게 저장");
    expect(cloudSaveErrorMessage(new CloudSaveAvailabilityError("cloud-save-timeout"), false))
      .toContain("이 기기의 저장소도 사용할 수 없으니");
  });

  it.each([
    ["unauthenticated", "로그인이 풀렸어요"],
    ["permission-denied", "저장 권한"],
    ["unavailable", "인터넷 연결"],
    ["deadline-exceeded", "인터넷 연결"],
    ["resource-exhausted", "저장 공간"]
  ])("서버 오류 %s를 알맞게 설명한다", (code, message) => {
    expect(cloudSaveErrorMessage({ code }, true)).toContain(message);
  });
});
