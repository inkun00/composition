import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PCM_CAPTURE_WORKLET_CODE, startPcmStreamCapture } from "./pcmRecorder";

type Packet = { type: string; samples?: Float32Array };
type Processor = {
  port: { onmessage: ((event: { data: string }) => void) | null };
  process: (inputs: readonly (readonly Float32Array[])[]) => boolean;
};

function processorFixture() {
  const messages: { packet: Packet; transfer: ArrayBuffer[] }[] = [];
  let ProcessorClass!: new () => Processor;
  class WorkletBase {
    port = {
      onmessage: null,
      postMessage: (packet: Packet, transfer: ArrayBuffer[] = []) => {
        messages.push({ packet, transfer });
      }
    };
  }
  new Function("AudioWorkletProcessor", "registerProcessor", PCM_CAPTURE_WORKLET_CODE)(
    WorkletBase, (_name: string, constructor: typeof ProcessorClass) => { ProcessorClass = constructor; }
  );
  return { processor: new ProcessorClass(), messages };
}

class NodeMock {
  gain = { value: 1 };
  connect = vi.fn((destination: NodeMock) => destination);
  disconnect = vi.fn();
}

class WorkletMock extends NodeMock {
  static instances: WorkletMock[] = [];
  port = {
    onmessage: null as ((event: { data: Packet }) => void) | null,
    postMessage: vi.fn(),
    close: vi.fn()
  };
  constructor() {
    super();
    WorkletMock.instances.push(this);
  }
  send(packet: Packet) { this.port.onmessage?.({ data: packet }); }
}

class ContextMock extends EventTarget {
  state = "running";
  destination = new NodeMock();
  audioWorklet = { addModule: vi.fn(async () => undefined) };
  gains: NodeMock[] = [];
  script = Object.assign(new NodeMock(), {
    onaudioprocess: null as ((event: { inputBuffer: { getChannelData: (channel: number) => Float32Array } }) => void) | null
  });
  createGain = vi.fn(() => {
    const node = new NodeMock();
    this.gains.push(node);
    return node;
  });
  createScriptProcessor = vi.fn(() => this.script);
  close() {
    this.state = "closed";
    this.dispatchEvent(new Event("statechange"));
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  WorkletMock.instances = [];
  vi.stubGlobal("AudioWorkletNode", WorkletMock);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:pcm-worklet");
    static revokeObjectURL = vi.fn();
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PCM worklet batching", () => {
  it("sends one transferred block for sixteen render quanta instead of sixteen cloned messages", () => {
    const { processor, messages } = processorFixture();
    const expected = Float32Array.from({ length: 2048 }, (_, index) => index / 2048);
    for (let block = 0; block < 16; block += 1) {
      expect(processor.process([[expected.subarray(block * 128, (block + 1) * 128)]])).toBe(true);
    }
    expect(messages).toHaveLength(1);
    expect(messages[0].packet.samples).toEqual(expected);
    expect(messages[0].transfer).toEqual([messages[0].packet.samples!.buffer]);
  });

  it("flushes the short final block before acknowledging stop without changing sample order", () => {
    const { processor, messages } = processorFixture();
    const expected = Float32Array.from({ length: 2307 }, (_, index) => Math.sin(index));
    processor.process([[expected.subarray(0, 2100)]]);
    processor.process([[expected.subarray(2100)]]);
    processor.port.onmessage?.({ data: "stop" });
    expect(messages.map(({ packet }) => packet.type)).toEqual(["chunk", "chunk", "stopped"]);
    expect(messages[0].packet.samples).toEqual(expected.subarray(0, 2048));
    expect(messages[1].packet.samples).toEqual(expected.subarray(2048));
    expect(messages[1].transfer).toEqual([messages[1].packet.samples!.buffer]);
    expect(processor.process([[new Float32Array(128)]])).toBe(false);
    processor.port.onmessage?.({ data: "stop" });
    expect(messages).toHaveLength(3);
  });

  it("does not create empty audio blocks for disconnected input or an empty recording", () => {
    const { processor, messages } = processorFixture();
    processor.process([]);
    processor.process([[]]);
    processor.port.onmessage?.({ data: "stop" });
    expect(messages.map(({ packet }) => packet.type)).toEqual(["stopped"]);
  });
});

describe("PCM capture lifetime", () => {
  it("keeps accepting pending full and tail blocks until stop acknowledgement, then disconnects once", async () => {
    const context = new ContextMock();
    const source = new NodeMock();
    const capture = await startPcmStreamCapture(context as unknown as AudioContext, source as unknown as AudioNode);
    const node = WorkletMock.instances[0];
    node.send({ type: "chunk", samples: new Float32Array([1, 2]) });
    const stopping = capture.stop();
    expect(capture.stop()).toBe(stopping);
    expect(node.port.postMessage).toHaveBeenCalledExactlyOnceWith("stop");
    expect(source.disconnect).not.toHaveBeenCalled();
    node.send({ type: "chunk", samples: new Float32Array([3, 4, 5]) });
    node.send({ type: "stopped" });
    expect(await stopping).toEqual(new Float32Array([1, 2, 3, 4, 5]));
    expect(source.disconnect).toHaveBeenCalledExactlyOnceWith(node);
    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(context.gains[0].disconnect).toHaveBeenCalledOnce();
    expect(node.port.close).toHaveBeenCalledOnce();
    expect(node.port.onmessage).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(capture.stop()).toBe(stopping);
  });

  it("does not hang if cancellation closes the context before the worklet can acknowledge", async () => {
    const context = new ContextMock();
    const capture = await startPcmStreamCapture(context as unknown as AudioContext, new NodeMock() as unknown as AudioNode);
    const node = WorkletMock.instances[0];
    node.send({ type: "chunk", samples: new Float32Array([.25]) });
    const stopping = capture.stop();
    context.close();
    expect(await stopping).toEqual(new Float32Array([.25]));
    expect(node.port.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops an already closed context without waiting or messaging its processor", async () => {
    const context = new ContextMock();
    const capture = await startPcmStreamCapture(context as unknown as AudioContext, new NodeMock() as unknown as AudioNode);
    context.close();
    expect(await capture.stop()).toEqual(new Float32Array());
    expect(WorkletMock.instances[0].port.postMessage).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds shutdown for an unresponsive suspended processor", async () => {
    const context = new ContextMock();
    const capture = await startPcmStreamCapture(context as unknown as AudioContext, new NodeMock() as unknown as AudioNode);
    context.state = "suspended";
    const stopping = capture.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await stopping).toEqual(new Float32Array());
    expect(WorkletMock.instances[0].port.close).toHaveBeenCalledOnce();
  });

  it("registers the worklet only once for simultaneous vocal and backing captures", async () => {
    const context = new ContextMock();
    const captures = await Promise.all([0, 1].map(() =>
      startPcmStreamCapture(context as unknown as AudioContext, new NodeMock() as unknown as AudioNode)));
    expect(context.audioWorklet.addModule).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:pcm-worklet");
    const stopping = captures.map((capture) => capture.stop());
    WorkletMock.instances.forEach((node) => node.send({ type: "stopped" }));
    await Promise.all(stopping);
  });

  it("revokes a failed worklet URL and preserves copied samples with the ScriptProcessor fallback", async () => {
    const context = new ContextMock();
    context.audioWorklet.addModule.mockRejectedValueOnce(new Error("unsupported"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const source = new NodeMock();
    const capture = await startPcmStreamCapture(context as unknown as AudioContext, source as unknown as AudioNode);
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:pcm-worklet");
    expect(context.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
    const data = new Float32Array([.1, .2, .3]);
    context.script.onaudioprocess?.({ inputBuffer: { getChannelData: () => data } });
    data.fill(0);
    const stopping = capture.stop();
    expect(capture.stop()).toBe(stopping);
    expect(await stopping).toEqual(new Float32Array([.1, .2, .3]));
    expect(context.script.onaudioprocess).toBeNull();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(context.script.disconnect).toHaveBeenCalledOnce();
    expect(context.gains[0].disconnect).toHaveBeenCalledOnce();
  });
});
