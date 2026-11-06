import { DYNAMICS, getNote, secondsForBeats, totalBeats, type DynamicId, type NoteId } from "./learningModel";

export type LearningPlayback = {
  notes: readonly NoteId[];
  bpm: number;
  beatsPerBar?: number;
  dynamic?: DynamicId;
  crescendo?: boolean;
  decrescendo?: boolean;
  onStep?: (index: number, beat: number) => void;
  onEnd?: () => void;
};

type AudioContextConstructor = new () => AudioContext;

export class LearningAudio {
  private context: AudioContext | null = null;
  private nodes = new Set<OscillatorNode>();
  private gains = new Set<GainNode>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private generation = 0;

  async play(options: LearningPlayback): Promise<void> {
    this.stop();
    const generation = this.generation;
    const { notes, bpm, beatsPerBar, onStep, onEnd } = options;
    if (!notes.length) {
      onEnd?.();
      return;
    }
    if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240) {
      throw new RangeError("30~240 사이의 빠르기를 골라 주세요.");
    }
    const beats = totalBeats(notes);
    if (beats > 128) throw new RangeError("한 번에 128박까지 들어 볼 수 있어요.");
    if (beatsPerBar !== undefined && (!Number.isInteger(beatsPerBar) || beatsPerBar < 1 || beatsPerBar > 16)) {
      throw new RangeError("한 마디의 박 수를 확인해 주세요.");
    }
    const Context = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!Context) throw new Error("이 브라우저에서는 소리를 재생할 수 없어요.");
    if (!this.context || this.context.state === "closed") this.context = new Context();
    const context = this.context;
    if (context.state === "suspended") await context.resume();
    if (generation !== this.generation) return;
    if (context.state !== "running") throw new Error("소리를 켜지 못했어요. 다시 듣기를 눌러 주세요.");

    const start = context.currentTime + 0.04;
    const duration = secondsForBeats(beats, bpm);
    const dynamic = DYNAMICS.find((item) => item.id === options.dynamic) ?? DYNAMICS[3];
    let cursor = 0;
    const noteStarts: number[] = [];
    try {
      notes.forEach((id) => {
        const note = getNote(id);
        noteStarts.push(cursor);
        if (!note.rest) {
          const progress = beats <= note.beats ? 0.5 : cursor / (beats - note.beats);
          const scale = options.crescendo ? 0.3 + progress * 0.7 : options.decrescendo ? 1 - progress * 0.7 : 1;
          this.tone(context, start + secondsForBeats(cursor, bpm), secondsForBeats(note.beats, bpm),
            392, dynamic.gain * scale, "triangle");
        }
        cursor += note.beats;
      });
      // Pulse clicks belong to the meter/tempo lab. A plain rest stays silent.
      if (beatsPerBar !== undefined) {
        for (let beat = 0; beat < beats; beat++) {
          const accent = beat % beatsPerBar === 0;
          this.tone(context, start + secondsForBeats(beat, bpm), 0.055, accent ? 1200 : 800,
            accent ? 0.045 : 0.025, "sine");
        }
      }
      if (onStep) {
        let index = 0;
        for (let beat = 0; beat < beats; beat += 0.5) {
          while (index + 1 < noteStarts.length && noteStarts[index + 1] <= beat) index++;
          const activeIndex = index;
          const activeBeat = beat;
          this.later(() => onStep(activeIndex, activeBeat),
            (start - context.currentTime + secondsForBeats(beat, bpm)) * 1000, generation);
        }
      }
      this.later(() => {
        this.stop();
        onEnd?.();
      }, (start - context.currentTime + duration) * 1000, generation);
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop(): void {
    this.generation++;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.nodes.forEach((node) => {
      try { node.stop(); } catch { /* Already ended. */ }
      node.disconnect();
    });
    this.nodes.clear();
    this.gains.forEach((gain) => gain.disconnect());
    this.gains.clear();
  }

  dispose(): void {
    this.stop();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined);
    this.context = null;
  }

  private later(callback: () => void, milliseconds: number, generation: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (generation === this.generation) callback();
    }, Math.max(0, milliseconds));
    this.timers.add(timer);
  }

  private tone(context: AudioContext, start: number, duration: number, frequency: number,
    volume: number, type: OscillatorType): void {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    const release = Math.min(0.055, duration * 0.2);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + Math.min(0.012, duration / 4));
    envelope.gain.setValueAtTime(volume, start + duration - release);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    this.nodes.add(oscillator);
    this.gains.add(envelope);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.nodes.delete(oscillator);
      this.gains.delete(envelope);
    };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}
