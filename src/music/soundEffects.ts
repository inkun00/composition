import { OPEN_SOUND_EFFECTS } from "./openSoundEffects";

export type SoundEffectId = string;

export type SoundEffectCategory =
  | "nature" | "animal" | "home" | "school" | "city"
  | "body" | "weather" | "magic" | "vehicle" | "percussion";

export type SoundEffectDefinition = Readonly<{
  id: SoundEffectId;
  name: string;
  icon: string;
  description: string;
  category: SoundEffectCategory;
  source?: string;
  license?: string;
  credit?: string;
}>;

const legacyEffectAliases: Readonly<Record<string, SoundEffectDefinition>> = {
  bird: {
    id: "bird",
    name: "새소리",
    icon: "🐦",
    description: "예전 악보와 호환하기 위한 새소리 효과음",
    category: "animal",
    source: "/sound-effects/cc0/sfx100v2_loop_ambient_01.ogg",
    license: "CC0",
    credit: "rubberduck / OpenGameArt"
  },
  bell: {
    id: "bell",
    name: "종소리",
    icon: "🔔",
    description: "예전 악보와 호환하기 위한 종소리 효과음",
    category: "school",
    source: "/sound-effects/cc0/bell_01.ogg",
    license: "CC0",
    credit: "rubberduck / OpenGameArt"
  },
  clap: {
    id: "clap",
    name: "박수",
    icon: "👏",
    description: "예전 악보와 호환하기 위한 박수 느낌 효과음",
    category: "body",
    source: "/sound-effects/cc0/hit_01.ogg",
    license: "CC0",
    credit: "rubberduck / OpenGameArt"
  },
  clock: {
    id: "clock",
    name: "시계",
    icon: "⏰",
    description: "예전 악보와 호환하기 위한 짧은 딸깍 소리",
    category: "home",
    source: "/sound-effects/cc0/switch_01.ogg",
    license: "CC0",
    credit: "rubberduck / OpenGameArt"
  },
  footstep: {
    id: "footstep",
    name: "발걸음",
    icon: "👣",
    description: "예전 악보와 호환하기 위한 발걸음 효과음",
    category: "body",
    source: "/sound-effects/cc0/sfx100v2_footstep_01.ogg",
    license: "CC0",
    credit: "rubberduck / OpenGameArt"
  },
  rain: {
    id: "rain",
    name: "물소리",
    icon: "💧",
    description: "예전 악보와 호환하기 위한 물 흐르는 효과음",
    category: "weather",
    source: "/sound-effects/cc0/sfx100v2_loop_water_01.ogg",
    license: "CC0",
    credit: "rubberduck / OpenGameArt"
  }
};

export const SOUND_EFFECTS: readonly SoundEffectDefinition[] = OPEN_SOUND_EFFECTS;

export function isSoundEffectId(value: string): value is SoundEffectId {
  return SOUND_EFFECTS.some((effect) => effect.id === value) || value in legacyEffectAliases;
}

export function findSoundEffect(id: string): SoundEffectDefinition {
  return SOUND_EFFECTS.find((effect) => effect.id === id) ?? legacyEffectAliases[id] ?? SOUND_EFFECTS[0];
}
