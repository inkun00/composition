import { OPEN_SOUND_EFFECTS } from "./openSoundEffects";
import { DIVERSE_SOUND_EFFECTS } from "./diverseSoundEffects";

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
  sourcePage?: string;
}>;

const soundEffectIconRules: readonly (readonly [needle: string, icon: string])[] = [
  ["전자레인지", "♨️"],
  ["자물쇠", "🔓"],
  ["열쇠", "🔑"],
  ["물 내리기", "🚽"],
  ["물튀김", "💦"],
  ["이어지는 물", "🌊"],
  ["이어지는 배경", "🎧"],
  ["나무 상자", "📦"],
  ["발걸음", "👣"],
  ["공사장", "🚧"],
  ["도로", "🛣️"],
  ["기계", "⚙️"],
  ["그릇", "🍽️"],
  ["냄비", "🍲"],
  ["스위치", "🔘"],
  ["종이", "📄"],
  ["문", "🚪"],
  ["놀이 소리", "🪀"],
  ["신기한 소리", "✨"],
  ["잡음", "📻"],
  ["재미있는 소리", "🎉"],
  ["금속", "🔩"],
  ["나무", "🪵"],
  ["도구", "🛠️"],
  ["돌멩이", "🪨"],
  ["물건", "📦"],
  ["유리", "🪟"],
  ["쾅", "💥"],
  ["톡 치기", "👆"],
  ["통통 튀기", "🟠"],
  ["폭발", "💣"],
  ["펑", "💥"],
  ["퐁당", "💧"],
  ["새소리", "🐦"],
  ["박수", "👏"],
  ["시계", "⏰"],
  ["물소리", "💧"],
  ["천둥", "⚡"],
  ["바람", "🌬️"],
  ["종", "🔔"],
  ["징", "🥁"]
];

export function soundEffectIconForName(name: string, fallback: string): string {
  return soundEffectIconRules.find(([needle]) => name.includes(needle))?.[1] ?? fallback;
}

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

function effectFamily(name: string): string {
  return name.replace(/\s+\d+$/, "");
}

const familyCounts = new Map<string, number>();
const retainedNames = new Set<string>();
const retainedOpenEffects = OPEN_SOUND_EFFECTS.filter((effect) => {
  const family = `${effect.category}|${effectFamily(effect.name)}`;
  const nameKey = `${effect.category}|${effect.name}`;
  if (retainedNames.has(nameKey)) return false;
  const count = familyCounts.get(family) ?? 0;
  if (count >= (effectFamily(effect.name) === "놀이 소리" ? 4 : 3)) return false;
  retainedNames.add(nameKey);
  familyCounts.set(family, count + 1);
  return true;
});
const retainedFamilyEffect = new Map<string, SoundEffectDefinition>(retainedOpenEffects.map((effect) => [
  `${effect.category}|${effectFamily(effect.name)}`, effect
]));
const retiredEffectAliases = new Map<string, SoundEffectDefinition>(OPEN_SOUND_EFFECTS
  .filter((effect) => !retainedOpenEffects.includes(effect))
  .map((effect) => [effect.id, retainedFamilyEffect.get(`${effect.category}|${effectFamily(effect.name)}`)!]));

export const SOUND_EFFECTS: readonly SoundEffectDefinition[] = [
  ...retainedOpenEffects,
  ...DIVERSE_SOUND_EFFECTS
].map((effect) => ({
  ...effect,
  icon: soundEffectIconForName(effect.name, effect.icon)
}));

export function isSoundEffectId(value: string): value is SoundEffectId {
  return SOUND_EFFECTS.some((effect) => effect.id === value) ||
    retiredEffectAliases.has(value) || value in legacyEffectAliases;
}

export function findSoundEffect(id: string): SoundEffectDefinition {
  return SOUND_EFFECTS.find((effect) => effect.id === id) ??
    retiredEffectAliases.get(id) ?? legacyEffectAliases[id] ?? SOUND_EFFECTS[0];
}
