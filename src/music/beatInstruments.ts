export type BeatInstrumentRole = "low" | "middle" | "high";

export type BeatInstrumentId =
  | "kick" | "soft-kick"
  | "snare" | "clap" | "woodblock"
  | "shaker" | "tambourine" | "hihat"
  | "floor-tom" | "djembe" | "conga" | "cowbell" | "triangle"
  | "timpani" | "cajon" | "bongo" | "claves" | "ride" | "guiro";

export type BeatInstrumentDefinition = Readonly<{
  id: BeatInstrumentId;
  name: string;
  icon: string;
  description: string;
  role: BeatInstrumentRole;
  roleLabel: string;
}>;

export const MAX_BEAT_INSTRUMENTS = 3;
export const DEFAULT_BEAT_VOLUME = 100;
export const MIN_BEAT_VOLUME = 0;
export const MAX_BEAT_VOLUME = 160;

export function normalizeBeatVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_BEAT_VOLUME;
  return Math.round(Math.max(MIN_BEAT_VOLUME, Math.min(MAX_BEAT_VOLUME, value)) / 5) * 5;
}

export function isValidBeatVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= MIN_BEAT_VOLUME && value <= MAX_BEAT_VOLUME && value % 5 === 0;
}

export const BEAT_INSTRUMENTS: readonly BeatInstrumentDefinition[] = [
  {
    id: "kick", name: "큰북", icon: "🥁", role: "low", roleLabel: "낮은 쿵",
    description: "중요한 박자를 힘차게 쿵 하고 알려 줘요."
  },
  {
    id: "soft-kick", name: "포근한 북", icon: "🪘", role: "low", roleLabel: "낮은 쿵",
    description: "둥글고 부드러운 소리로 박자를 받쳐 줘요."
  },
  {
    id: "snare", name: "작은북", icon: "🥁", role: "middle", roleLabel: "가운데 짝",
    description: "또렷한 짝 소리로 박자의 중심을 잡아 줘요."
  },
  {
    id: "clap", name: "손뼉", icon: "👏", role: "middle", roleLabel: "가운데 짝",
    description: "함께 손뼉을 치는 것처럼 신나는 느낌을 줘요."
  },
  {
    id: "woodblock", name: "나무블록", icon: "🪵", role: "middle", roleLabel: "가운데 짝",
    description: "딱딱 맑은 나무 소리로 가볍게 박자를 표시해요."
  },
  {
    id: "shaker", name: "셰이커", icon: "🪇", role: "high", roleLabel: "잔박자 찰찰",
    description: "찰찰 이어지는 소리로 노래가 계속 움직이게 해요."
  },
  {
    id: "tambourine", name: "탬버린", icon: "🪘", role: "high", roleLabel: "잔박자 찰찰",
    description: "반짝이는 금속 소리로 밝고 신나게 꾸며 줘요."
  },
  {
    id: "hihat", name: "하이햇", icon: "✨", role: "high", roleLabel: "잔박자 찰찰",
    description: "짧은 칫 소리로 빠르고 또렷한 움직임을 만들어요."
  },
  {
    id: "floor-tom", name: "큰 톰", icon: "🥁", role: "low", roleLabel: "낮은 쿵",
    description: "깊게 울리는 둥 소리로 힘찬 행진 느낌을 만들어요."
  },
  {
    id: "djembe", name: "젬베", icon: "🪘", role: "low", roleLabel: "낮은 쿵",
    description: "손으로 두드리는 통통 소리로 신나는 움직임을 만들어요."
  },
  {
    id: "conga", name: "콩가", icon: "🪘", role: "middle", roleLabel: "가운데 짝",
    description: "따뜻하고 탄력 있는 손북 소리로 춤추는 느낌을 줘요."
  },
  {
    id: "cowbell", name: "카우벨", icon: "🔔", role: "middle", roleLabel: "가운데 짝",
    description: "또랑또랑한 금속 소리로 박자를 눈에 띄게 알려 줘요."
  },
  {
    id: "triangle", name: "트라이앵글", icon: "🔺", role: "high", roleLabel: "잔박자 찰찰",
    description: "맑게 울리는 땡 소리로 반짝이는 순간을 꾸며 줘요."
  },
  {
    id: "timpani", name: "팀파니", icon: "🥁", role: "low", roleLabel: "낮은 쿵",
    description: "웅장하게 울리는 북소리로 중요한 장면에 힘을 실어요."
  },
  {
    id: "cajon", name: "카혼", icon: "🪘", role: "middle", roleLabel: "가운데 짝",
    description: "나무 상자를 두드리는 따뜻한 소리로 편안한 박자를 만들어요."
  },
  {
    id: "bongo", name: "봉고", icon: "🪘", role: "middle", roleLabel: "가운데 짝",
    description: "작은 손북의 통통 튀는 소리로 춤추는 느낌을 더해요."
  },
  {
    id: "claves", name: "클라베스", icon: "🥢", role: "middle", roleLabel: "가운데 짝",
    description: "나무 막대의 또각 소리로 리듬을 또렷하게 알려 줘요."
  },
  {
    id: "ride", name: "라이드 심벌", icon: "💿", role: "high", roleLabel: "잔박자 찰찰",
    description: "맑은 금속 울림으로 반주가 앞으로 나아가게 해요."
  },
  {
    id: "guiro", name: "귀로", icon: "🪵", role: "high", roleLabel: "잔박자 찰찰",
    description: "홈을 긁는 사각사각 소리로 재미있는 움직임을 만들어요."
  }
];

const beatInstrumentById = new Map(BEAT_INSTRUMENTS.map((instrument) => [instrument.id, instrument]));
const roleOrder: readonly BeatInstrumentRole[] = ["low", "middle", "high"];

export function isBeatInstrumentId(value: unknown): value is BeatInstrumentId {
  return typeof value === "string" && beatInstrumentById.has(value as BeatInstrumentId);
}

export function findBeatInstrument(id: BeatInstrumentId): BeatInstrumentDefinition {
  return beatInstrumentById.get(id) ?? BEAT_INSTRUMENTS[0];
}

export function normalizeBeatInstrumentIds(ids: readonly unknown[]): BeatInstrumentId[] {
  const byRole = new Map<BeatInstrumentRole, BeatInstrumentId>();
  ids.forEach((id) => {
    if (!isBeatInstrumentId(id)) return;
    const instrument = findBeatInstrument(id);
    if (!byRole.has(instrument.role)) byRole.set(instrument.role, id);
  });
  return roleOrder.flatMap((role) => {
    const id = byRole.get(role);
    return id ? [id] : [];
  }).slice(0, MAX_BEAT_INSTRUMENTS);
}

export function isValidBeatInstrumentSelection(value: unknown): value is readonly BeatInstrumentId[] {
  if (!Array.isArray(value) || value.length > MAX_BEAT_INSTRUMENTS || !value.every(isBeatInstrumentId)) return false;
  return normalizeBeatInstrumentIds(value).length === value.length;
}
