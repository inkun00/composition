import { describe, expect, it } from "vitest";
import { calculateVocalMakeupGain, karaokeBackingGainForRms, vocalCaptureProfile } from "./vocalCapture";

describe("녹음 입력 프로필", () => {
  it("개인 녹음은 바람소리와 잡음을 억제하기 위해 noiseSuppression을 활성화하고 머드컷을 적용한다", () => {
    const profile = vocalCaptureProfile("personal");
    expect(profile.useNoiseGate).toBe(true);
    expect(profile.constraints.noiseSuppression).toBe(true);
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
      duration: 5,
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

  it("인트로 구간에 발생한 큰 터치 팝 노이즈를 무시하고 실제 가창 음량을 부스트한다", () => {
    const sampleRate = 48000;
    const length = sampleRate * 30;
    const channelData = new Float32Array(length);
    // 1.0초 인트로에 팝 노이즈 피크 0.8
    channelData[Math.floor(sampleRate * 1.0)] = 0.8;
    // 10초~20초 실제 노래 구간에 작은 목소리 피크 0.08
    for (let sec = 10; sec <= 20; sec += 1) {
      for (let i = 0; i < 2000; i += 1) {
        channelData[sampleRate * sec + i] = 0.08 * Math.sin(i * 0.1);
      }
    }
    const mockBuffer = {
      length,
      sampleRate,
      duration: 30,
      getChannelData: () => channelData
    } as unknown as AudioBuffer;

    const gain = calculateVocalMakeupGain(mockBuffer, 8.0, 4.0);
    expect(gain).toBeGreaterThanOrEqual(7.0);
    expect(gain).toBeLessThanOrEqual(12.0);
  });
});
