import { describe, expect, it } from "vitest";
import { BEAT_INSTRUMENTS } from "../music/beatInstruments";
import {
  BEAT_SAMPLE_MIX_PROFILES,
  BEAT_SAMPLE_URLS
} from "./beatSamples";

describe("실제 비트 악기 보정", () => {
  it("모든 비트 악기에 서로 알맞은 보정값이 있다", () => {
    const instrumentIds = BEAT_INSTRUMENTS.map((instrument) => instrument.id);
    expect(Object.keys(BEAT_SAMPLE_MIX_PROFILES)).toHaveLength(instrumentIds.length);

    instrumentIds.forEach((instrumentId) => {
      const profile = BEAT_SAMPLE_MIX_PROFILES[instrumentId];
      expect(profile.outputGain).toBeGreaterThan(0);
      expect(profile.outputGain).toBeLessThanOrEqual(4);
      expect(profile.frequency).toBeGreaterThanOrEqual(80);
      expect(profile.frequency).toBeLessThanOrEqual(7000);
      expect(profile.filterGain).toBeGreaterThan(0);
      expect(BEAT_SAMPLE_URLS[instrumentId]).toBeTruthy();
    });
  });

  it("북·손타악기·금속 악기는 서로 다른 음역을 강조한다", () => {
    expect(BEAT_SAMPLE_MIX_PROFILES.kick.filterType).toBe("lowshelf");
    expect(BEAT_SAMPLE_MIX_PROFILES["floor-tom"].filterType).toBe("lowshelf");
    expect(BEAT_SAMPLE_MIX_PROFILES.conga.filterType).toBe("peaking");
    expect(BEAT_SAMPLE_MIX_PROFILES.hihat.filterType).toBe("highshelf");
    expect(BEAT_SAMPLE_MIX_PROFILES.ride.filterType).toBe("highshelf");
  });

  it("작게 녹음된 악기는 출력 보정을 더하고 전자식 드럼은 어쿠스틱 WAV로 교체한다", () => {
    expect(BEAT_SAMPLE_MIX_PROFILES.shaker.outputGain).toBeGreaterThan(3);
    expect(BEAT_SAMPLE_MIX_PROFILES["floor-tom"].outputGain).toBeGreaterThan(3);
    expect(BEAT_SAMPLE_MIX_PROFILES.timpani.outputGain).toBeGreaterThanOrEqual(3);
    expect(BEAT_SAMPLE_MIX_PROFILES.ride.outputGain).toBeGreaterThan(2);
    expect(BEAT_SAMPLE_URLS["soft-kick"]).toBe("/beat-samples/soft-kick.wav");
    expect(BEAT_SAMPLE_URLS.hihat).toBe("/beat-samples/hihat.wav");
  });

  it("추가한 밴드 드럼도 어쿠스틱 WAV와 전용 보정값을 사용한다", () => {
    expect(BEAT_SAMPLE_URLS["rack-tom"]).toBe("/beat-samples/rack-tom.wav");
    expect(BEAT_SAMPLE_URLS["open-hihat"]).toBe("/beat-samples/open-hihat.wav");
    expect(BEAT_SAMPLE_URLS.crash).toBe("/beat-samples/crash.wav");
    expect(BEAT_SAMPLE_MIX_PROFILES["rack-tom"].filterType).toBe("peaking");
    expect(BEAT_SAMPLE_MIX_PROFILES["open-hihat"].filterType).toBe("highshelf");
    expect(BEAT_SAMPLE_MIX_PROFILES.crash.filterType).toBe("highshelf");
  });
});
