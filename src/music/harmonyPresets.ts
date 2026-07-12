import type { HarmonyStory } from "./types";
import { HARMONY_THEORY } from "./harmonyTheory.generated";

export type HarmonyPreset = Readonly<{
  id: string;
  childName: string;
  mood: string;
  category: string;
  difficulty: "쉬움" | "보통" | "도전";
  roles: readonly [HarmonyStory, HarmonyStory, HarmonyStory, HarmonyStory];
  teacherName: string;
  original: string;
  bars: readonly (readonly string[])[];
}>;

const childNames = [
  "당당한 마침표", "포근한 인사", "예상 밖의 도착", "이어지는 추억 여행", "뜨거운 노을길",
  "어둠 끝 햇살", "빙글빙글 화음 여행", "낯선 나라의 눈물", "날카로운 출발선", "신비한 유리 계단",
  "우르릉 커다란 문", "살짝 열린 결말", "다음 편을 기다려", "옛 성의 물음표", "따뜻하게 안녕",
  "사뿐사뿐 내려가기", "어둠 뒤 열린 햇살 문", "흔들리지 않는 뿌리", "비 오기 전 고요함", "하늘로 오르는 노래",
  "천천히 가라앉는 마음", "꿈빛으로 돌아오기", "세 화음 돌림노래", "혼자 걷는 저녁길", "물 흐르는 발걸음",
  "희망을 안고 달려", "교실 창가의 꿈", "주인공의 성장 여행", "추억이 울컥한 순간", "이별 뒤 작은 위로",
  "별빛 마법 엔딩", "옛날 영화의 뒷문", "기다렸다 활짝", "조마조마 비밀 계단", "따뜻한 리듬 계단",
  "노을 속 남은 마음", "아침 햇살 축제", "슬픔 속 작은 희망", "바람 가르는 청춘", "바닷가 노을 편지",
  "영웅이 깨어나는 순간", "어둠 속 주인공", "마음껏 외치는 후렴", "장면 바꾸는 반짝 문", "슬픔을 딛고 점프",
  "나른한 카페 창가", "네온빛 밤 산책", "어두운 무대의 춤", "마지막 눈물 한 방울", "교실 밖 신나는 달리기",
  "반짝이는 밤거리", "비 오는 밤의 위로", "반 칸 미끄럼틀", "구름 위 리듬 산책", "비밀 요원의 발걸음",
  "점점 자라는 용기", "다음 장면 밀어주기", "꼬리를 무는 긴장", "달빛 춤 돌림", "우주를 가르는 삼각길",
  "빙글 도는 네 걸음", "차가운 도시의 밤", "새벽빛 느린 춤", "사르르 내려가는 계단", "깜짝 반음 점프",
  "자유로운 파란 기차", "질주하는 큰 악단", "기대를 뒤집는 문", "낯선 별의 색깔", "구름 위 네 걸음",
  "안개 속 물음표", "화려한 밤의 인사", "슬픔 뒤 따뜻한 손", "부풀어 오르는 마음", "세련된 밤의 주인공",
  "옛 신화의 발걸음", "꿈속 공간 여행", "그림자 도시의 긴장", "장난꾸러기 우주선", "신비한 영웅의 산책",
  "무중력 별빛 여행", "나른한 오후의 낙서", "묵직한 비밀 작전", "꼬불꼬불 반음 계단", "검은 제국의 행진",
  "요정 숲의 오래된 문", "점점 커지는 우주 문", "거꾸로 흐르는 시간", "마지막 관문의 모험", "거친 바람 두 음",
  "번개처럼 달리는 기사", "차가운 미래 골목", "다섯 음 자연 산책", "끝없이 도는 명상", "미지의 대륙 첫걸음",
  "오래된 성의 으스스한 문", "안개 속 꿈결 산책", "오락실 불빛 질주", "눈부신 사랑의 결말", "일부러 길 잃은 꿈"
] as const;

const childMoodOverrides: Readonly<Record<string, string>> = {
  H014: "오래된 성에서 들리는 슬픈 질문",
  H019: "비가 오기 직전처럼 커지는 긴장",
  H035: "포근한 조명처럼 부드럽고 따뜻함",
  H038: "슬픔 속에서도 발견하는 작은 희망",
  H048: "어둡고 힘이 넘치는 노래의 중심",
  H052: "비 오는 밤처럼 애틋하고 차분함",
  H054: "꿈결처럼 부드럽고 리듬이 살아남",
  H059: "달빛 아래서 가볍게 춤추는 느낌",
  H060: "우주 길이 크게 방향을 바꾸는 느낌",
  H061: "네 걸음이 자연스럽게 빙글빙글 이어짐",
  H063: "새벽빛처럼 느리고 부드러운 분위기",
  H065: "반 칸씩 움직여 예상 밖의 문을 여는 느낌",
  H067: "큰 악단이 힘차게 달리는 듯한 느낌",
  H070: "구름 위를 걷듯 가볍고 꿈같은 움직임",
  H075: "도시의 밤처럼 차분하고 멋진 분위기",
  H078: "그림자 도시를 걷는 듯 조마조마한 긴장",
  H079: "장난꾸러기 우주선처럼 기발하고 신비로움",
  H082: "나른한 오후에 낙서하는 듯 편안함",
  H083: "묵직하고 조마조마한 비밀 작전",
  H085: "크고 무거운 발걸음이 이어지는 행진",
  H087: "처음 보는 우주 문처럼 낯설고 으스스함",
  H089: "모험의 마지막 관문을 만난 듯한 긴장",
  H096: "오래된 성을 탐험하는 듯 으스스하고 아름다움",
  H100: "일부러 길을 잃은 꿈처럼 예측하기 어려움"
};

const groups = [
  {
    ending: "집으로",
    category: "편안하게 끝나요",
    difficulty: "쉬움" as const,
    moods: ["당당하고 또렷해요", "포근하고 평화로워요", "반전 뒤에 여운이 남아요", "천천히 마음이 놓여요"],
    roles: [
      ["home", "journey", "wonder", "home"],
      ["home", "journey", "home", "home"],
      ["home", "wonder", "journey", "home"]
    ] as const
  },
  {
    ending: "산책길",
    category: "귀에 쏙 들어와요",
    difficulty: "쉬움" as const,
    moods: ["밝고 신나게 달려가요", "조금 아련하지만 따뜻해요", "상쾌하고 힘이 나요", "노을처럼 부드러워요"],
    roles: [
      ["journey", "wonder", "home", "home"],
      ["home", "journey", "journey", "home"],
      ["journey", "home", "wonder", "home"]
    ] as const
  },
  {
    ending: "밤거리",
    category: "부드럽고 멋져요",
    difficulty: "보통" as const,
    moods: ["반짝이고 부드러워요", "살짝 어둡고 멋져요", "빙글빙글 이어져요", "도시의 불빛처럼 빛나요"],
    roles: [
      ["journey", "wonder", "journey", "home"],
      ["wonder", "journey", "home", "home"],
      ["home", "wonder", "wonder", "home"]
    ] as const
  },
  {
    ending: "꿈속으로",
    category: "신기하고 조마조마해요",
    difficulty: "도전" as const,
    moods: ["낯설고 신비로워요", "조마조마한 모험 같아요", "우주를 떠다니는 느낌이에요", "예상 밖의 길로 움직여요"],
    roles: [
      ["wonder", "journey", "wonder", "home"],
      ["wonder", "wonder", "journey", "home"],
      ["home", "wonder", "journey", "wonder"]
    ] as const
  }
] as const;

// A four-bar chord story should also have its own melodic character.  The old
// version reused only twelve home/journey/wonder patterns for all 100 presets.
// These 25 palettes spread the 12 listening characters across the catalogue;
// the group offset prevents the same sequence being recycled in every genre.
const rolePalettes = [
  ["home", "journey", "wonder", "home"],
  ["tender", "tender", "journey", "home"],
  ["brave", "brave", "journey", "home"],
  ["shadow", "wonder", "shadow", "home"],
  ["sparkle", "journey", "sparkle", "home"],
  ["bounce", "bounce", "journey", "home"],
  ["floating", "tender", "floating", "home"],
  ["swing", "swing", "journey", "home"],
  ["march", "brave", "march", "home"],
  ["folk", "folk", "journey", "home"],
  ["wonder", "shadow", "wonder", "home"],
  ["journey", "brave", "journey", "home"],
  ["home", "tender", "home", "home"],
  ["bounce", "sparkle", "bounce", "home"],
  ["floating", "wonder", "floating", "home"],
  ["swing", "shadow", "swing", "home"],
  ["march", "shadow", "brave", "home"],
  ["folk", "tender", "folk", "home"],
  ["shadow", "brave", "shadow", "home"],
  ["sparkle", "wonder", "journey", "home"],
  ["tender", "floating", "tender", "home"],
  ["brave", "march", "brave", "home"],
  ["wonder", "sparkle", "wonder", "home"],
  ["journey", "bounce", "journey", "home"],
  ["home", "folk", "tender", "home"]
] as const satisfies readonly (readonly [HarmonyStory, HarmonyStory, HarmonyStory, HarmonyStory])[];

export const HARMONY_PRESETS: readonly HarmonyPreset[] = HARMONY_THEORY.map((theory, index) => {
  const group = groups[Math.floor(index / 25)];
  const position = index % 25;
  return {
    id: theory.id,
    childName: childNames[index],
    mood: childMoodOverrides[theory.id] ?? theory.mood,
    category: group.category,
    difficulty: group.difficulty,
    roles: rolePalettes[(position + Math.floor(index / 25) * 7) % rolePalettes.length],
    teacherName: theory.teacherName,
    original: theory.original,
    bars: theory.bars
  };
});

export function findHarmonyPreset(id: string): HarmonyPreset {
  return HARMONY_PRESETS.find((preset) => preset.id === id) ?? HARMONY_PRESETS[0];
}
