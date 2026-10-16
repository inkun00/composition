import { describe, expect, it } from "vitest";
import type { SmplrPreset } from "smplr";
import { smoothSoundfontLoops } from "./soundfontSustain";

function fixture() {
  const channels = [
    Float32Array.from({ length: 200 }, (_, index) => Math.sin(index * .17) + (index >= 140 ? .7 : 0)),
    Float32Array.from({ length: 200 }, (_, index) => Math.cos(index * .13) + (index >= 140 ? -.7 : 0))
  ];
  const buffer = {
    sampleRate: 10000, length: 200, numberOfChannels: 2,
    getChannelData: (channel: number) => channels[channel]
  } as AudioBuffer;
  const preset: SmplrPreset = {
    samples: { baseUrl: "", formats: ["ogg"] },
    groups: [{ regions: [{ sample: "G4", loop: true, loopStart: .008, loopEnd: .016 }] }]
  };
  return { channels, preset, buffers: new Map([["G4", buffer]]) };
}

describe("샘플 sustain 루프 경계", () => {
  it("스테레오 샘플의 어택을 보존하고 루프 끝을 시작 직전 파형에 연결한다", () => {
    const { channels, preset, buffers } = fixture();
    const originals = channels.map((channel) => channel.slice());
    const jumps = channels.map((channel) => Math.abs(channel[159] - channel[80]));
    smoothSoundfontLoops(preset, buffers);
    for (let channel = 0; channel < channels.length; channel += 1) {
      expect(channels[channel].slice(0, 140)).toEqual(originals[channel].slice(0, 140));
      expect(channels[channel].slice(160)).toEqual(originals[channel].slice(160));
      expect(channels[channel][159]).toBe(originals[channel][79]);
      expect(Math.abs(channels[channel][159] - channels[channel][80])).toBeLessThan(jumps[channel]);
    }
  });

  it("루프가 없거나 샘플 범위 밖인 메타데이터는 원본을 훼손하지 않는다", () => {
    const { channels, preset, buffers } = fixture();
    const originals = channels.map((channel) => channel.slice());
    preset.groups[0].regions = [
      { sample: "G4" },
      { sample: "G4", loop: true, loopStart: .02, loopEnd: .025 },
      { sample: "G4", loop: true, loopStart: 0, loopEnd: .01 },
      { sample: "missing", loop: true, loopStart: .008, loopEnd: .016 }
    ];
    smoothSoundfontLoops(preset, buffers);
    expect(channels).toEqual(originals);
  });

  it("같은 샘플 루프를 여러 region이 공유해도 crossfade를 중첩하지 않는다", () => {
    const once = fixture();
    const twice = fixture();
    twice.preset.groups[0].regions.push({ ...twice.preset.groups[0].regions[0] });
    smoothSoundfontLoops(once.preset, once.buffers);
    smoothSoundfontLoops(twice.preset, twice.buffers);
    expect(twice.channels).toEqual(once.channels);
  });
});
