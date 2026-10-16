import { addInstrumentTone, addTone, chordPitches, createProtectedMaster, melodyPlaybackEvents } from "./accompanimentScore";
import { chordMidiPitches } from "../music/chord";
import { findInstrument, type InstrumentId } from "../music/instruments";
import { toNumber } from "../music/rational";
import { isSoundEffectId } from "../music/soundEffects";
import type { HarmonyStory, NoteEvent, SoundEffectEvent } from "../music/types";
import { loadSampleWithTimeout } from "./accompanimentRuntime";
import { loadSampleInstrument, queueSampleNote } from "./samplePlayer";
import { queueSoundEffect } from "./soundEffects";

export async function renderMelodyPreview(
  context: AudioContext,
  isCurrent: () => boolean,
  notes: readonly NoteEvent[],
  harmony: HarmonyStory,
  chords: readonly string[] = [],
  instrumentId: InstrumentId = "piano",
  bpm = 96,
  effects: readonly SoundEffectEvent[] = [],
  playAccompaniment = false
): Promise<number | null> {
  const master = createProtectedMaster(context, context.destination, 0.72);
  const secondsPerBeat = 60 / bpm;
  const instrument = findInstrument(instrumentId);
  let sampledInstrument: Awaited<ReturnType<typeof loadSampleInstrument>> | null = null;
  try {
    sampledInstrument = await loadSampleWithTimeout(context, master, instrumentId);
  } catch (error) {
    console.warn("악기 샘플을 불러오지 못해 합성 음색을 사용합니다.", error);
  }
  if (!isCurrent() || context.state === "closed") return null;
  const start = context.currentTime + 0.06;

  const totalBeats = notes.reduce((total, note) => total + toNumber(note.duration), 0);
  if (playAccompaniment) {
    const accompaniment = chords.length > 0 ? chords : [""];
    const chordBeats = totalBeats / accompaniment.length;
    accompaniment.forEach((chord, chordIndex) => {
      const pitches = chord ? chordMidiPitches(chord) : chordPitches[harmony];
      pitches.forEach((pitch) => {
        addTone(context, master, pitch, start + chordIndex * chordBeats * secondsPerBeat,
          chordBeats * secondsPerBeat, 0.035, "sine");
      });
    });
  }

  melodyPlaybackEvents(notes, secondsPerBeat).forEach((event) => {
    if (sampledInstrument) {
      queueSampleNote(sampledInstrument, context, master, event.pitch,
        start + event.start, event.duration * .92, instrument.volume);
    } else {
      addInstrumentTone(context, master, event.pitch, start + event.start, event.duration * 0.92, instrument);
    }
  });
  const cursor = totalBeats * secondsPerBeat;

  effects.forEach((effect) => {
    if (isSoundEffectId(effect.effectId)) {
      queueSoundEffect(context, master, effect.effectId, start + effect.offsetBeats * secondsPerBeat);
    }
  });

  return cursor + 0.5;
}
