import { describe, expect, it } from "vitest";
import { calculateVocalMakeupGain, karaokeBackingGainForRms, vocalCaptureProfile } from "./vocalCapture";

describe("녹음 입력 프로필", () => {
  it("개인 녹음은 가창 왜곡을 방지하기 위해 통화용 잡음 제거를 끄고 노이즈 게이트와 머드컷을 적용한다", () => {
    const profile = vocalCaptureProfile("personal");
    expect(profile.useNoiseGate).toBe(true);
    expect(profile.constraints.noiseSuppression).toBe(false);
    expect(profile.mudCutDb).toBeLessThanOrEqual(-4.0);
    expect(profile.highPassHz).toBeGreaterThanOrEqual(100);
    expect(profile.reverbSend).toBeGreaterThan(vocalCaptureProfile("choir").reverbSend);
    expect(profile.vocalBusGain).toBeGreaterThanOrEqual(2.5);
    expect(profile.presenceDb).toBeGreaterThanOrEqual(3.0);
  });

  it("합창 녹음은 먼 여러 목소리를 자르지 않고 완만하게 압축한다", () => {
    const choir = vocalCaptureProfile("choir");
    const personal = vocalCaptureProfile("personal");
    expect(choir.useNoiseGate).toBe(false);
    expect(choir.constraints.noiseSuppression).toBe(false);
    expect(choir.compressorRatio).toBeLessThan(personal.compressorRatio);
    expect(choir.highPassHz).toBeLessThanOrEqual(personal.highPassHz);
  });

  it("개인 녹음에서 목소리가 들어오면 반주를 조금만 낮춘다", () => {
    expect(karaokeBackingGainForRms(0)).toBe(1.06);
    expect(karaokeBackingGainForRms(0.04)).toBe(0.96);
  });

  it("작은 목소리 녹음 버퍼에 적절한 메이크업 게인을 계산한다", () => {
    const length = 48000 * 5;
    const sampleRate = 48000;
    const channelData = new Float32Array(length);
    channelData[48000 * 2] = 0.04;
    const mockBuffer = {
      length,
      sampleRate,
      getChannelData: () => channelData
    } as unknown as AudioBuffer;

    const gain = calculateVocalMakeupGain(mockBuffer);
    expect(gain).toBeCloseTo(18.0, 1);
  });

  it("이미 충분히 큰 목소리는 1.0배 근처로 유지한다", () => {
    const length = 48000 * 5;
    const sampleRate = 48000;
    const channelData = new Float32Array(length);
    channelData[48000 * 2] = 0.76;
    const mockBuffer = {
      length,
      sampleRate,
      getChannelData: () => channelData
    } as unknown as AudioBuffer;

    const gain = calculateVocalMakeupGain(mockBuffer);
    expect(gain).toBeCloseTo(1.0, 1);
  });
});
