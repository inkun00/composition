import { getSoundfontNames } from "smplr";

export type InstrumentId = string;

export type Instrument = Readonly<{
  id: InstrumentId;
  name: string;
  description: string;
  group: "서양 악기";
  icon: string;
  wave: OscillatorType;
  volume: number;
  attack: number;
  release: number;
  partials: readonly (readonly [ratio: number, gain: number])[];
  vibrato?: Readonly<{ rate: number; depth: number }>;
}>;

const METADATA: Record<string, { name: string; icon: string; description: string }> = {
  acoustic_grand_piano: { name: "그랜드 피아노", icon: "🎹", description: "가장 기본이 되는 맑은 피아노 소리" },
  bright_acoustic_piano: { name: "밝은 피아노", icon: "🎹", description: "또렷하고 반짝이는 피아노 소리" },
  electric_grand_piano: { name: "일렉트릭 그랜드", icon: "🎹", description: "전기 피아노 느낌이 섞인 그랜드 소리" },
  honkytonk_piano: { name: "홍키통크 피아노", icon: "🎹", description: "살짝 오래된 술집 피아노 같은 소리" },
  electric_piano_1: { name: "일렉트릭 피아노 1", icon: "🎹", description: "부드럽고 투명한 전기 피아노" },
  electric_piano_2: { name: "일렉트릭 피아노 2", icon: "🎹", description: "반짝이고 둥근 전기 피아노" },
  harpsichord: { name: "하프시코드", icon: "🎹", description: "줄을 튕기는 고전 악기 소리" },
  clavinet: { name: "클라비넷", icon: "🎹", description: "통통 튀는 건반 악기 소리" },
  xylophone: { name: "실로폰", icon: "🎶", description: "밝고 통통 튀는 나무 건반 소리" },
  glockenspiel: { name: "글로켄슈필", icon: "🔔", description: "반짝이는 금속 건반 소리" },
  marimba: { name: "마림바", icon: "🎶", description: "따뜻하고 둥근 나무 건반 소리" },
  vibraphone: { name: "비브라폰", icon: "🎶", description: "울림이 긴 금속 건반 소리" },
  music_box: { name: "오르골", icon: "🎁", description: "작은 음악 상자 같은 소리" },
  tubular_bells: { name: "관종", icon: "🔔", description: "성당 종처럼 울리는 소리" },
  acoustic_guitar_nylon: { name: "클래식 기타", icon: "🎸", description: "부드러운 나일론 줄 기타" },
  acoustic_guitar_steel: { name: "포크 기타", icon: "🎸", description: "맑고 반짝이는 통기타" },
  electric_guitar_clean: { name: "클린 기타", icon: "🎸", description: "깨끗한 일렉 기타 소리" },
  electric_guitar_jazz: { name: "재즈 기타", icon: "🎸", description: "부드럽고 둥근 기타 소리" },
  electric_guitar_muted: { name: "뮤트 기타", icon: "🎸", description: "짧게 끊어 치는 기타 소리" },
  overdriven_guitar: { name: "오버드라이브 기타", icon: "🎸", description: "살짝 거친 록 기타 소리" },
  distortion_guitar: { name: "디스토션 기타", icon: "🎸", description: "강하고 거친 전기 기타" },
  acoustic_bass: { name: "어쿠스틱 베이스", icon: "🎻", description: "깊고 따뜻한 낮은 줄 소리" },
  electric_bass_finger: { name: "핑거 베이스", icon: "🎸", description: "손가락으로 연주하는 베이스" },
  electric_bass_pick: { name: "피크 베이스", icon: "🎸", description: "선명한 베이스 소리" },
  fretless_bass: { name: "프렛리스 베이스", icon: "🎸", description: "미끄러지는 듯 부드러운 베이스" },
  violin: { name: "바이올린", icon: "🎻", description: "가늘고 선명한 현악기 소리" },
  viola: { name: "비올라", icon: "🎻", description: "바이올린보다 조금 낮고 따뜻한 소리" },
  cello: { name: "첼로", icon: "🎻", description: "깊고 따뜻한 현악기 소리" },
  contrabass: { name: "콘트라베이스", icon: "🎻", description: "가장 낮고 묵직한 현악기" },
  string_ensemble_1: { name: "현악 합주 1", icon: "🎻", description: "풍성한 오케스트라 현악 합주" },
  string_ensemble_2: { name: "현악 합주 2", icon: "🎻", description: "부드럽고 아련한 현악 합주" },
  pizzicato_strings: { name: "피치카토 현악", icon: "🎻", description: "줄을 톡톡 튕기는 현악 소리" },
  tremolo_strings: { name: "트레몰로 현악", icon: "🎻", description: "가늘게 떨리는 긴장감 있는 현악" },
  orchestral_harp: { name: "하프", icon: "🪕", description: "영롱하고 우아하게 퍼지는 하프" },
  trumpet: { name: "트럼펫", icon: "🎺", description: "밝고 힘차게 뻗는 금관악기" },
  trombone: { name: "트롬본", icon: "🎺", description: "묵직하고 부드러운 금관악기" },
  tuba: { name: "튜바", icon: "🎺", description: "가장 낮고 웅장한 금관악기" },
  french_horn: { name: "호른", icon: "📯", description: "둥글고 따뜻한 금관악기" },
  brass_section: { name: "금관 합주", icon: "🎺", description: "여러 금관악기가 함께 울리는 소리" },
  flute: { name: "플루트", icon: "🎼", description: "맑은 바람 같은 높은 목관 소리" },
  piccolo: { name: "피콜로", icon: "🎼", description: "아주 높고 선명한 목관 소리" },
  recorder: { name: "리코더", icon: "🎼", description: "친숙하고 맑은 피리 소리" },
  clarinet: { name: "클라리넷", icon: "🎼", description: "부드럽고 둥근 목관악기" },
  oboe: { name: "오보에", icon: "🎼", description: "또렷하고 살짝 코맹맹한 목관 소리" },
  bassoon: { name: "바순", icon: "🎼", description: "낮고 익살스러운 목관 소리" },
  alto_sax: { name: "알토 색소폰", icon: "🎷", description: "부드럽고 멋진 색소폰" },
  tenor_sax: { name: "테너 색소폰", icon: "🎷", description: "깊고 따뜻한 색소폰" },
  soprano_sax: { name: "소프라노 색소폰", icon: "🎷", description: "높고 맑은 색소폰" },
  baritone_sax: { name: "바리톤 색소폰", icon: "🎷", description: "낮고 묵직한 색소폰" },
  accordion: { name: "아코디언", icon: "🪗", description: "바람 상자를 여닫으며 나는 소리" },
  harmonica: { name: "하모니카", icon: "🎵", description: "입으로 부는 작고 따뜻한 악기" },
  church_organ: { name: "교회 오르간", icon: "🎹", description: "성당처럼 웅장한 오르간" },
  rock_organ: { name: "록 오르간", icon: "🎹", description: "힘 있고 에너지 넘치는 오르간" },
  choir_aahs: { name: "합창 아", icon: "👥", description: "여러 사람이 함께 부르는 듯한 소리" },
  voice_oohs: { name: "합창 우", icon: "👥", description: "둥글게 울리는 목소리 합창" },
  orchestra_hit: { name: "오케스트라 히트", icon: "💥", description: "한 번에 쾅 울리는 오케스트라 소리" },
  timpani: { name: "팀파니", icon: "🥁", description: "웅장하게 울리는 큰 북" },
  agogo: { name: "아고고", icon: "🎵", description: "짧고 밝은 타악기" },
  applause: { name: "박수", icon: "👏", description: "사람들이 박수치는 소리" },
  bird_tweet: { name: "새소리", icon: "🐦", description: "짹짹거리는 새 효과음" },
  seashore: { name: "바닷가", icon: "🌊", description: "파도와 바닷가 느낌의 소리" }
};

function titleCaseSoundFontName(id: string): string {
  return id
    .replace(/fx_/g, "효과음 ")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const soundfontNames = getSoundfontNames();
const westInstruments: Instrument[] = soundfontNames.map((sfName) => {
  const meta = METADATA[sfName] ?? {
    name: titleCaseSoundFontName(sfName),
    icon: "🎧",
    description: "SoundFont 악기 소리"
  };
  return {
    id: sfName,
    name: meta.name,
    description: meta.description,
    group: "서양 악기",
    icon: meta.icon,
    wave: "triangle",
    volume: 0.09,
    attack: 0.01,
    release: 0.2,
    partials: [[1, 1]]
  };
});

export const INSTRUMENTS: readonly Instrument[] = [...westInstruments].sort((a, b) => {
  if (a.id === "acoustic_grand_piano") return -1;
  if (b.id === "acoustic_grand_piano") return 1;
  return a.name.localeCompare(b.name, "ko");
});

const OLD_MAP: Record<string, string> = {
  piano: "acoustic_grand_piano",
  guitar: "acoustic_guitar_nylon",
  violin: "violin",
  flute: "flute",
  trumpet: "trumpet",
  xylophone: "xylophone",
  gayageum: "acoustic_guitar_nylon",
  daegeum: "flute",
  haegeum: "violin",
  piri: "clarinet"
};

export function findInstrument(id: InstrumentId): Instrument {
  const targetId = OLD_MAP[id] ?? id;
  return INSTRUMENTS.find((instrument) => instrument.id === targetId) ?? INSTRUMENTS[0];
}

export function isValidInstrumentId(id: string): boolean {
  const targetId = OLD_MAP[id] ?? id;
  return INSTRUMENTS.some((inst) => inst.id === targetId);
}
