import { describe, expect, it, vi } from "vitest";
import { createAudioBufferFromPcm, encodeAudioBufferToWav, findBuiltInMicrophoneDeviceId, forceBuiltInMicrophoneStream } from "./pcmRecorder";

describe("pcmRecorder 모듈", () => {
  it("PCM 데이터로부터 AudioBuffer를 정확한 길이와 샘플값으로 생성한다", () => {
    const mockAudioContext = {
      sampleRate: 48000,
      createBuffer: (channels: number, length: number, sampleRate: number) => {
        const data = [new Float32Array(length), new Float32Array(length)];
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          getChannelData: (ch: number) => data[ch]
        } as unknown as AudioBuffer;
      }
    } as unknown as BaseAudioContext;

    const pcm = new Float32Array([0.1, -0.2, 0.5, -0.8]);
    const buffer = createAudioBufferFromPcm(mockAudioContext, pcm, 1);

    expect(buffer.length).toBe(4);
    expect(buffer.sampleRate).toBe(48000);
    expect(buffer.numberOfChannels).toBe(1);
    expect(buffer.getChannelData(0)[0]).toBeCloseTo(0.1);
    expect(buffer.getChannelData(0)[3]).toBeCloseTo(-0.8);
  });

  it("AudioBuffer를 표준 무손실 RIFF 16-bit WAV Blob으로 인코딩한다", async () => {
    const length = 100;
    const sampleRate = 44100;
    const channel0 = new Float32Array(length);
    for (let i = 0; i < length; i += 1) channel0[i] = Math.sin(i * 0.1);

    const mockBuffer = {
      numberOfChannels: 1,
      length,
      sampleRate,
      getChannelData: () => channel0
    } as unknown as AudioBuffer;

    const wavBlob = encodeAudioBufferToWav(mockBuffer);
    expect(wavBlob.type).toBe("audio/wav");
    expect(wavBlob.size).toBe(44 + length * 2);

    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(wavBlob);
    });
    const view = new DataView(arrayBuffer);

    // RIFF 헤더 검증
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(riff).toBe("RIFF");
    expect(wave).toBe("WAVE");

    // fmt 청크 및 샘플레이트 검증
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // 1채널
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16); // 16-bit
  });

  it("블루투스 이어폰이 연결되어 있을 때 스마트폰 본체 내장 마이크를 우선 선택한다", async () => {
    const mockDevices: MediaDeviceInfo[] = [
      {
        deviceId: "buds-mic-1",
        kind: "audioinput",
        label: "Galaxy Buds Pro (Bluetooth Hands-Free)",
        groupId: "1",
        toJSON: () => ({})
      },
      {
        deviceId: "internal-mic-1",
        kind: "audioinput",
        label: "Internal Built-in Microphone",
        groupId: "2",
        toJSON: () => ({})
      },
      {
        deviceId: "speaker-out-1",
        kind: "audiooutput",
        label: "Phone Speaker",
        groupId: "2",
        toJSON: () => ({})
      }
    ];

    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue(mockDevices)
      }
    });

    const selectedId = await findBuiltInMicrophoneDeviceId();
    expect(selectedId).toBe("internal-mic-1");

    vi.unstubAllGlobals();
  });

  it("현재 트랙이 블루투스 마이크일 때 forceBuiltInMicrophoneStream이 본체 마이크로 강제 전환한다", async () => {
    const mockStop = vi.fn();
    const mockOldTrack = {
      label: "Galaxy Buds Pro (Bluetooth Hands-Free)",
      getSettings: () => ({ deviceId: "buds-mic-1" }),
      stop: mockStop
    };
    const mockOldStream = {
      getAudioTracks: () => [mockOldTrack],
      getTracks: () => [mockOldTrack]
    } as unknown as MediaStream;

    const mockNewTrack = {
      label: "Internal Built-in Microphone",
      getSettings: () => ({ deviceId: "internal-mic-1" }),
      stop: vi.fn()
    };
    const mockNewStream = {
      getAudioTracks: () => [mockNewTrack],
      getTracks: () => [mockNewTrack]
    } as unknown as MediaStream;

    const mockDevices: MediaDeviceInfo[] = [
      {
        deviceId: "buds-mic-1",
        kind: "audioinput",
        label: "Galaxy Buds Pro (Bluetooth Hands-Free)",
        groupId: "1",
        toJSON: () => ({})
      },
      {
        deviceId: "internal-mic-1",
        kind: "audioinput",
        label: "Internal Built-in Microphone",
        groupId: "2",
        toJSON: () => ({})
      }
    ];

    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
        getUserMedia: vi.fn().mockResolvedValue(mockNewStream)
      }
    });

    const result = await forceBuiltInMicrophoneStream(mockOldStream, { echoCancellation: false });
    expect(result.switched).toBe(true);
    expect(result.label).toBe("Internal Built-in Microphone");
    expect(mockStop).toHaveBeenCalled();
    expect(result.stream).toBe(mockNewStream);

    vi.unstubAllGlobals();
  });
});

