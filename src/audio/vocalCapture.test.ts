import { describe, expect, it } from "vitest";
import { karaokeBackingGainForRms, vocalCaptureProfile } from "./vocalCapture";

describe("녹음 입력 프로필", () => {
  it("개인 녹음은 가까운 한 사람의 잡음을 부드럽게 줄인다", () => {
    const profile = vocalCaptureProfile("personal");
    expect(profile.useNoiseGate).toBe(true);
    expect(profile.constraints.noiseSuppression).toBe(true);
    expect(profile.reverbSend).toBeGreaterThan(vocalCaptureProfile("choir").reverbSend);
  });

  it("합창 녹음은 먼 여러 목소리를 자르지 않고 완만하게 압축한다", () => {
    const choir = vocalCaptureProfile("choir");
    const personal = vocalCaptureProfile("personal");
    expect(choir.useNoiseGate).toBe(false);
    expect(choir.constraints.noiseSuppression).toBe(false);
    expect(choir.compressorRatio).toBeLessThan(personal.compressorRatio);
    expect(choir.highPassHz).toBeLessThan(personal.highPassHz);
  });

  it("개인 녹음에서 목소리가 들어오면 반주를 조금만 낮춘다", () => {
    expect(karaokeBackingGainForRms(0)).toBe(1.06);
    expect(karaokeBackingGainForRms(0.04)).toBe(0.96);
  });
});
