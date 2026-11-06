import { getNote, type NoteId } from "../learningModel";

type TrainSchedule = { playAt: number; endAt: number };

/** Every timestamp is derived from the same AudioContext clock as the actual pulse. */
export class TrainAudio {
  private context: AudioContext | null = null;
  private nodes = new Set<OscillatorNode>();
  private envelopes = new Set<GainNode>();
  private generation = 0;

  async start(notes: readonly NoteId[], bpm: number, demo: boolean): Promise<TrainSchedule | null> {
    this.stop();
    const generation = this.generation;
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) throw new Error("이 브라우저에서 소리를 켤 수 없어요.");
    this.context ??= new Context();
    const context = this.context;
    if (context.state === "suspended") await context.resume();
    if (generation !== this.generation) return null;
    if (context.state !== "running") throw new Error("소리를 켜지 못했어요. 다시 눌러 주세요.");
    const beatSeconds = 60 / bpm;
    const start = context.currentTime + 0.08;
    const countIn = demo ? 0 : 4;
    const origin = start + countIn * beatSeconds;
    let cursor = 0;
    for (const id of notes) {
      const note = getNote(id);
      if (demo && !note.rest) this.tone(origin + cursor * beatSeconds, note.beats * beatSeconds, 392, 0.12, "triangle");
      cursor += note.beats;
    }
    for (let beat = 0; beat < countIn + cursor; beat++) {
      this.tone(start + beat * beatSeconds, 0.045, beat % 4 === 0 ? 1200 : 800,
        beat < countIn ? 0.07 : 0.035, "sine");
    }
    // getOutputTimestamp ties the performance clock to sound leaving the device when supported.
    const output = context.getOutputTimestamp?.();
    const performanceOrigin = output && typeof output.performanceTime === "number" && output.performanceTime > 0 && typeof output.contextTime === "number"
      ? output.performanceTime + (origin - output.contextTime) * 1000
      : performance.now() + (origin - context.currentTime) * 1000;
    return { playAt: performanceOrigin, endAt: performanceOrigin + cursor * beatSeconds * 1000 };
  }

  tap(): void {
    if (this.context?.state === "running") this.tone(this.context.currentTime, 0.10, 392, 0.12, "triangle");
  }

  stop(): void {
    this.generation++;
    for (const node of this.nodes) {
      try { node.stop(); } catch { /* Already ended. */ }
      node.disconnect();
    }
    for (const gain of this.envelopes) gain.disconnect();
    this.nodes.clear();
    this.envelopes.clear();
  }

  dispose(): void {
    this.stop();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined);
    this.context = null;
  }

  private tone(start: number, duration: number, frequency: number, volume: number, type: OscillatorType): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + 0.008);
    envelope.gain.setValueAtTime(volume, start + Math.max(0.01, duration - 0.04));
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    this.nodes.add(oscillator);
    this.envelopes.add(envelope);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.nodes.delete(oscillator);
      this.envelopes.delete(envelope);
    };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}
