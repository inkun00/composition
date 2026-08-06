import type { AccompanimentStyleId } from "../music/accompaniment";

export type ArrangementPlan = Readonly<{ layerCount: number; energy: number }>;

function standardSongArrangementPlan(
  measureIndex: number,
  measureCount: number,
  availableLayers: number
): ArrangementPlan {
  if (availableLayers <= 2 || measureCount <= 3) return { layerCount: availableLayers, energy: 1 };
  const phraseIndex = Math.floor(measureIndex / 4);
  const phrasePosition = measureIndex % 4;
  const lastMeasure = measureIndex === measureCount - 1;
  const baseLayers = phraseIndex === 0 ? Math.min(2, availableLayers)
    : Math.min(3 + Math.max(0, phraseIndex - 1), availableLayers);
  if (lastMeasure) return { layerCount: availableLayers, energy: 1.04 };
  if (phrasePosition === 0) {
    return { layerCount: Math.max(1, baseLayers - 1), energy: .82 + phraseIndex * .06 };
  }
  if (phrasePosition === 3) {
    return { layerCount: Math.min(baseLayers + 1, availableLayers), energy: .98 + phraseIndex * .04 };
  }
  return { layerCount: baseLayers, energy: .9 + phraseIndex * .06 };
}

type AnimeRockSection = "intro" | "verse" | "build" | "chorus" | "bridge" | "finale";

function animeRockSection(phraseIndex: number, phraseCount: number): AnimeRockSection {
  const lastPhrase = phraseCount - 1;
  if (phraseIndex === 0) return "intro";
  if (phraseIndex === lastPhrase) return "finale";
  if (phraseCount >= 7 && phraseIndex === lastPhrase - 1) return "bridge";
  const buildPhrase = phraseCount <= 3 ? 1 : phraseCount <= 5 ? 2 : 3;
  if (phraseIndex === buildPhrase) return "build";
  if (phraseIndex > buildPhrase) return "chorus";
  return "verse";
}

function animeRockArrangementPlan(
  measureIndex: number,
  measureCount: number,
  availableLayers: number
): ArrangementPlan {
  if (availableLayers === 0) return { layerCount: 0, energy: 1 };
  const phraseIndex = Math.floor(measureIndex / 4);
  const phrasePosition = measureIndex % 4;
  const phraseCount = Math.max(1, Math.ceil(measureCount / 4));
  const section = animeRockSection(phraseIndex, phraseCount);
  const presets: Readonly<Record<AnimeRockSection, ArrangementPlan>> = {
    intro: { layerCount: Math.min(2, availableLayers), energy: .9 },
    verse: { layerCount: Math.min(2, availableLayers), energy: .88 },
    build: { layerCount: Math.min(3, availableLayers), energy: 1.02 },
    chorus: { layerCount: availableLayers, energy: 1.12 },
    bridge: { layerCount: Math.min(2, availableLayers), energy: .82 },
    finale: { layerCount: availableLayers, energy: 1.18 }
  };
  const plan = presets[section];
  const fillBoost = phrasePosition === 3 ? .06 : phrasePosition === 0 ? -.02 : 0;
  return {
    layerCount: phrasePosition === 3 ? Math.min(availableLayers, plan.layerCount + 1) : plan.layerCount,
    energy: plan.energy + fillBoost
  };
}

export function songArrangementPlan(
  measureIndex: number,
  measureCount: number,
  availableLayers: number,
  styleId?: AccompanimentStyleId
): ArrangementPlan {
  return styleId === "anime_rock"
    ? animeRockArrangementPlan(measureIndex, measureCount, availableLayers)
    : standardSongArrangementPlan(measureIndex, measureCount, availableLayers);
}

export function recordingArrangementPlan(
  measureIndex: number,
  measureCount: number,
  availableLayers: number,
  styleId?: AccompanimentStyleId
): ArrangementPlan {
  const plan = songArrangementPlan(measureIndex, measureCount, availableLayers, styleId);
  return {
    layerCount: Math.min(availableLayers, Math.max(Math.min(2, availableLayers), plan.layerCount + 1)),
    energy: Math.max(.98, plan.energy * 1.08)
  };
}
