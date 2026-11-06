import { dynamicsGainAt, MELODY, type DynamicsMarking } from "./dynamicsPerformanceModel";

export type DynamicsPerformanceFrame = {
  progress: number;
  activeIndex: number;
  /** The actual master gain, including a live change's 60 ms transition. */
  gain: number;
};

export type DynamicsPerformanceCallbacks = {
  onFrame: (frame: DynamicsPerformanceFrame) => void;
  onEnd: () => void;
};

type GainPoint = { time: number; gain: number };
const NOTE_SECONDS = MELODY.beats * 60 / MELODY.bpm;
const PHRASE_SECONDS = MELODY.midi.length * NOTE_SECONDS;
const CHANGE_SECONDS = .06;

/** Pitch and timing stay fixed; only the shared master envelope follows the conductor. */
export class DynamicsPerformanceAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private oscillators = new Set<OscillatorNode>();
  private envelopes = new Set<GainNode>();
  private generation = 0;
  private frame: number | null = null;
  private marking: DynamicsMarking = "mf";
  private callbacks: DynamicsPerformanceCallbacks | null = null;
  private gainPoints: GainPoint[] = [];
  private startAt = 0;
  private endAt = 0;

  async play(marking: DynamicsMarking, callbacks: DynamicsPerformanceCallbacks): Promise<void> {
    this.stop();
    this.marking = marking;
    const generation = this.generation;
    try {
      const Context = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) throw new Error("이 브라우저에서 소리를 켤 수 없어요.");
      if (!this.context || this.context.state === "closed") this.context = new Context();
      const context = this.context;
      if (context.state === "suspended") await context.resume();
      if (generation !== this.generation) return;
      if (context.state !== "running") throw new Error("소리를 켜지 못했어요. 다시 눌러 주세요.");

      this.startAt = context.currentTime + .035;
      this.endAt = this.startAt + PHRASE_SECONDS;
      this.callbacks = callbacks;
      this.master = context.createGain();
      this.master.connect(context.destination);
      const first = dynamicsGainAt(this.marking, 0);
      const last = dynamicsGainAt(this.marking, 1);
      this.gainPoints = [{ time: this.startAt, gain: first }, { time: this.endAt, gain: last }];
      this.master.gain.setValueAtTime(first, this.startAt);
      if (first !== last) this.master.gain.linearRampToValueAtTime(last, this.endAt);
      MELODY.midi.forEach((pitch, index) => this.scheduleNote(pitch, this.startAt + index * NOTE_SECONDS));
      this.paint(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      throw error;
    }
  }

  setMarking(marking: DynamicsMarking): void {
    if (marking === this.marking) return;
    this.marking = marking;
    if (!this.context || !this.master || !this.callbacks) return;
    const now = this.context.currentTime;
    if (now >= this.endAt) return;
    const current = this.gainAt(now);
    const blendAt = Math.min(now + CHANGE_SECONDS, this.endAt);
    const first = dynamicsGainAt(marking, 0);
    const last = dynamicsGainAt(marking, 1);
    const blendGain = blendAt < this.endAt ? first : last;

    // Cancel the old future ramp, then anchor its computed value. AudioParam.value
    // does not reliably describe an in-flight ramp across Web Audio implementations.
    const parameter = this.master.gain;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(current, now);
    parameter.linearRampToValueAtTime(blendGain, blendAt);
    if (blendAt < this.endAt && blendGain !== last) parameter.linearRampToValueAtTime(last, this.endAt);
    this.gainPoints = [{ time: now, gain: current }, { time: blendAt, gain: blendGain }];
    if (blendAt < this.endAt) this.gainPoints.push({ time: this.endAt, gain: last });
  }

  stop(): void {
    this.generation += 1;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.callbacks = null;
    for (const oscillator of this.oscillators) {
      oscillator.onended = null;
      try { oscillator.stop(); } catch { /* A scheduled note may already have ended. */ }
      oscillator.disconnect();
    }
    this.oscillators.clear();
    for (const envelope of this.envelopes) envelope.disconnect();
    this.envelopes.clear();
    this.master?.disconnect();
    this.master = null;
    this.gainPoints = [];
  }

  dispose(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }

  private gainAt(time: number): number {
    if (!this.gainPoints.length) return 0;
    let previous = this.gainPoints[0];
    if (time <= previous.time) return previous.gain;
    for (const next of this.gainPoints.slice(1)) {
      if (time <= next.time) {
        const progress = (time - previous.time) / (next.time - previous.time);
        return previous.gain + (next.gain - previous.gain) * progress;
      }
      previous = next;
    }
    return previous.gain;
  }

  private paint(generation: number): void {
    if (generation !== this.generation || !this.context || !this.callbacks) return;
    this.frame = null;
    const now = this.context.currentTime;
    const progress = Math.max(0, Math.min(1, (now - this.startAt) / PHRASE_SECONDS));
    const activeIndex = now < this.startAt || now >= this.endAt ? -1 :
      Math.min(MELODY.midi.length - 1, Math.floor((now - this.startAt) / NOTE_SECONDS));
    this.callbacks.onFrame({ progress, activeIndex, gain: this.gainAt(now) });
    if (generation !== this.generation) return;
    if (now >= this.endAt) {
      const onEnd = this.callbacks?.onEnd;
      this.stop();
      onEnd?.();
      return;
    }
    this.frame = requestAnimationFrame(() => this.paint(generation));
  }

  private scheduleNote(pitch: number, start: number): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    this.oscillators.add(oscillator);
    const envelope = context.createGain();
    this.envelopes.add(envelope);
    const end = start + NOTE_SECONDS;
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(440 * 2 ** ((pitch - 69) / 12), start);
    // A soft attack and a decaying triangle's harmonics make a warm, plucked tone.
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(.85, start + .012);
    envelope.gain.linearRampToValueAtTime(.36, start + .12);
    envelope.gain.linearRampToValueAtTime(.18, start + NOTE_SECONDS * .62);
    envelope.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(envelope);
    envelope.connect(this.master!);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.oscillators.delete(oscillator);
      this.envelopes.delete(envelope);
    };
    oscillator.start(start);
    oscillator.stop(end);
  }
}
