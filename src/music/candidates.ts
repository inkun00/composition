import type { Meter } from "./meter";
import { meterKey } from "./meter";
import { chordSequenceKey, nearestChordTone } from "./chord";
import { rational, toNumber, type Rational } from "./rational";
import type { HarmonyStory, MelodyCandidate, NoteEvent } from "./types";

type CandidateShape = Readonly<{
  name: string;
  hint: string;
  contour: readonly number[];
}>;

type BaseStory = "home" | "journey" | "wonder";

type MelodyProfile = Readonly<{
  family: BaseStory;
  basePitch: number;
  rhythmOffset: number;
  motion: readonly number[];
}>;

// Each listening character gets its own register, rhythm starting point and
// step/leap pattern. Chords still choose the final safe note.
const melodyProfiles: Record<HarmonyStory, MelodyProfile> = {
  home: { family: "home", basePitch: 60, rhythmOffset: 0, motion: [0, 0, 0, 0] },
  journey: { family: "journey", basePitch: 65, rhythmOffset: 1, motion: [0, 1, 2, 1] },
  wonder: { family: "wonder", basePitch: 67, rhythmOffset: 2, motion: [0, 2, -1, 3] },
  bounce: { family: "journey", basePitch: 64, rhythmOffset: 4, motion: [0, 3, 0, 2, -1] },
  tender: { family: "home", basePitch: 62, rhythmOffset: 5, motion: [0, -1, 1, 0] },
  brave: { family: "journey", basePitch: 68, rhythmOffset: 6, motion: [0, 4, 2, 5] },
  shadow: { family: "wonder", basePitch: 57, rhythmOffset: 7, motion: [0, -2, 1, -3] },
  sparkle: { family: "wonder", basePitch: 71, rhythmOffset: 8, motion: [0, 2, 4, 1] },
  swing: { family: "journey", basePitch: 63, rhythmOffset: 9, motion: [0, 2, -1, 2, 0] },
  floating: { family: "wonder", basePitch: 69, rhythmOffset: 10, motion: [0, 3, 1, 4, 2] },
  march: { family: "journey", basePitch: 60, rhythmOffset: 11, motion: [0, 0, 3, 3] },
  folk: { family: "home", basePitch: 65, rhythmOffset: 3, motion: [0, 2, 0, -1, 1] }
};

export const MELODY_CANDIDATE_COUNT = 30;

export const MELODY_FEELING_GROUPS = [
  { id: "gentle", label: "차분하게", description: "천천히, 포근하게 시작해요" },
  { id: "bouncy", label: "통통하게", description: "리듬을 또렷하고 신나게 만들어요" },
  { id: "flowing", label: "부드럽게 이어서", description: "노래말을 자연스럽게 이어 가요" },
  { id: "highlight", label: "높이 빛나게", description: "중요한 말과 클라이맥스를 돋보이게 해요" }
] as const;

function feelingIdForIndex(index: number): string {
  if (index < 8) return "gentle";
  if (index < 16) return "bouncy";
  if (index < 24) return "flowing";
  return "highlight";
}

const shapes: Record<BaseStory, readonly CandidateShape[]> = {
  home: [
    { name: "햇살 계단", hint: "차근차근 올라가요", contour: [0, 2, 4, 0, 2, 4, 2, 0] },
    { name: "통통 인사", hint: "짧게 뛰고 돌아와요", contour: [0, 4, 7, 4, 0, 4, 2, 0] },
    { name: "느린 구름", hint: "길고 편안하게", contour: [4, 2, 0, 2, 0, 4] },
    { name: "숨 쉬고 시작", hint: "한 번 쉬고 노래해요", contour: [-99, 0, 4, 7, 4, 0] },
    { name: "반짝 물결", hint: "음이 흐르듯 움직여요", contour: [0, 2, 4, 7, 4, 2, 0, 4] },
    { name: "저녁 종", hint: "천천히 울려요", contour: [7, 0, 4, 0] }
  ],
  journey: [
    { name: "산책 걸음", hint: "한 발씩 앞으로", contour: [0, -1, -3, 0, 2, 0, -1, 0] },
    { name: "창문 너머", hint: "살짝 높이 바라봐요", contour: [0, 4, 2, 0, -1, 0, 2, 0] },
    { name: "바람 한 줄", hint: "부드럽게 내려와요", contour: [4, 2, 0, -1, 0, 2] },
    { name: "건너뛰는 돌", hint: "쉬었다가 폴짝", contour: [-99, 0, 2, 4, 0, 2] },
    { name: "여행 물결", hint: "빠르게 이어져요", contour: [0, 2, 4, 2, 0, -1, -3, 0] },
    { name: "긴 다리", hint: "큰 두 걸음으로 가요", contour: [0, 4, 2, 0] }
  ],
  wonder: [
    { name: "궁금한 발끝", hint: "마지막에 물음표", contour: [0, 2, 4, 0, 2, 4, 2, 0] },
    { name: "별빛 톡톡", hint: "짧게 반짝여요", contour: [0, 4, 2, 0, 4, 2, 0, 4] },
    { name: "비밀의 문", hint: "기다리며 길게", contour: [4, 2, 0, 4, 2, 0] },
    { name: "쉿, 누구지?", hint: "쉬었다가 대답해요", contour: [-99, 0, 4, 2, 0, 4] },
    { name: "유리 빗방울", hint: "여섯 음이 톡톡", contour: [0, 2, 4, 7, 4, 2, 0, 4] },
    { name: "달을 향해", hint: "두 걸음 크게", contour: [0, 4, 2, 4] }
  ]
};

const extraShapes: Record<BaseStory, readonly CandidateShape[]> = {
  home: [
    { name: "아침 햇살", hint: "밝게 올라갔다 돌아와요", contour: [0, 2, 4, 7, 4, 2, 0] },
    { name: "빙글 인사", hint: "가볍게 돌며 인사해요", contour: [0, 4, 2, 4, 0, 2, 0] },
    { name: "포근한 쉼", hint: "천천히 기대어 쉬어요", contour: [4, 2, 0, 0, 2, 0] },
    { name: "반짝 마침", hint: "반짝 올라갔다 또렷하게 끝나요", contour: [0, 4, 7, 4, 2, 0] },
    { name: "햇살 한 바퀴", hint: "둥글게 돌고 편안히 돌아와요", contour: [0, 2, 4, 2, 0, 4, 0] },
    { name: "다정한 인사", hint: "부드럽게 손을 흔들어요", contour: [4, 2, 0, 2, 4, 2, 0] }
  ],
  journey: [
    { name: "깡충 발걸음", hint: "가볍게 뛰며 앞으로 가요", contour: [0, 2, 5, 2, 0, -1, 0] },
    { name: "구름 사다리", hint: "한 칸씩 높이 올라가요", contour: [0, 2, 4, 5, 4, 2, 0] },
    { name: "신나는 모험", hint: "씩씩하게 길을 나서요", contour: [0, 4, 2, 5, 2, 0, -1] },
    { name: "멀리 점프", hint: "힘차게 뛰고 가볍게 내려와요", contour: [0, 5, 4, 2, 0, -1, 0] },
    { name: "폴짝 건너기", hint: "작은 돌을 하나씩 건너가요", contour: [0, 2, 0, 4, 2, 5, 2] },
    { name: "바람을 타고", hint: "시원하게 멀리 나아가요", contour: [0, 4, 5, 2, 4, 0, -1] }
  ],
  wonder: [
    { name: "별빛 질문", hint: "마지막에 살짝 물어봐요", contour: [0, 2, 4, 2, 4, 5] },
    { name: "비밀 계단", hint: "조심조심 위로 올라가요", contour: [0, 1, 2, 4, 5, 4] },
    { name: "달빛 숨바꼭질", hint: "나타났다 사라지듯 움직여요", contour: [0, 4, -99, 2, 5, -99, 4] },
    { name: "두근두근 기다림", hint: "조금 떨리게 다음을 기다려요", contour: [0, 2, 0, 4, 2, 5] },
    { name: "별똥별", hint: "높이 빛나다가 살며시 내려와요", contour: [7, 5, 4, 2, 0, 2, 4] },
    { name: "숨은 문 찾기", hint: "조심스럽게 비밀을 찾아가요", contour: [0, 1, 4, 2, 5, 4, 2] }
  ]
};

// Every chord receives a few clearly higher options as well.  These are for a
// chorus, an important word, or any moment a child wants to make stand out.
const highImpactShapes: readonly CandidateShape[] = [
  { name: "높이 뛰기", hint: "중요한 곳에서 힘차게 위로 뛰어올라요", contour: [4, 7, 12, 7, 14, 12, 7] },
  { name: "빛나는 끝", hint: "높은 소리로 반짝이며 길게 마무리해요", contour: [7, 12, 9, 14, 12, 16] },
  { name: "하늘 높이", hint: "높은 음으로 힘차게 올라가요", contour: [0, 4, 7, 12, 7, 4, 7, 12] },
  { name: "별빛 점프", hint: "큰 걸음으로 반짝 뛰어올라요", contour: [0, 7, 4, 11, 7, 12] },
  { name: "힘찬 외침", hint: "중요한 말을 크게 들려줘요", contour: [4, 7, 12, 7, 9, 12, 7] },
  { name: "마지막 햇살", hint: "높은 음을 길게 빛내요", contour: [7, 9, 12, 12, 7, 9] }
];

const rhythmTemplates: Record<string, readonly (readonly Rational[])[]> = {
  "2/4": [
    [rational(1), rational(1)],
    [rational(1,2), rational(1,2), rational(1)],
    [rational(1,2), rational(1,2), rational(1,2), rational(1,2)],
    [rational(2)],
    [rational(1), rational(1,2), rational(1,2)],
    [rational(1,2), rational(1), rational(1,2)],
    [rational(1,2), rational(3,2)],
    [rational(3,2), rational(1,2)],
    [rational(1,2), rational(1,2), rational(1,2), rational(1,2)],
    [rational(1), rational(1)],
    [rational(1,2), rational(1,2), rational(1)],
    [rational(1), rational(1,2), rational(1,2)]
  ],
  "3/4": [
    [rational(1), rational(1), rational(1)],
    [rational(1,2), rational(1,2), rational(1), rational(1)],
    [rational(2), rational(1)],
    [rational(1), rational(2)],
    [rational(1,2), rational(1,2), rational(1,2), rational(1,2), rational(1,2), rational(1,2)],
    [rational(1,2), rational(1), rational(1,2), rational(1)],
    [rational(3,2), rational(3,2)],
    [rational(1,2), rational(1,2), rational(2)],
    [rational(2), rational(1,2), rational(1,2)],
    [rational(1,2), rational(1), rational(1,2), rational(1)],
    [rational(1,2), rational(1,2), rational(1,2), rational(3,2)],
    [rational(3,2), rational(1,2), rational(1,2), rational(1,2)]
  ],
  "4/4": [
    [rational(1), rational(1), rational(1), rational(1)],
    [rational(1,2), rational(1,2), rational(1), rational(1), rational(1)],
    [rational(2), rational(1), rational(1)],
    [rational(1), rational(1), rational(2)],
    [rational(1,2), rational(1,2), rational(1,2), rational(1,2), rational(1,2), rational(1,2), rational(1,2), rational(1,2)],
    [rational(2), rational(2)],
    [rational(3,2), rational(1,2), rational(1), rational(1)],
    [rational(1), rational(3,2), rational(1,2), rational(1)],
    [rational(1,2), rational(1,2), rational(2), rational(1)],
    [rational(3), rational(1)],
    [rational(1,2), rational(1,2), rational(1), rational(2)],
    [rational(2), rational(1), rational(1,2), rational(1,2)]
  ],
  "6/8": [
    [rational(3,2), rational(3,2)],
    [rational(1,2), rational(1,2), rational(1,2), rational(1,2), rational(1,2), rational(1,2)],
    [rational(1), rational(1,2), rational(1), rational(1,2)],
    [rational(1,2), rational(1), rational(3,2)],
    [rational(3,2), rational(1,2), rational(1,2), rational(1,2)],
    [rational(1,2), rational(1,2), rational(1,2), rational(3,2)],
    [rational(1,2), rational(1), rational(1,2), rational(1)],
    [rational(3,2), rational(1,2), rational(1)],
    [rational(1,2), rational(1), rational(1), rational(1,2)],
    [rational(1), rational(1), rational(1)],
    [rational(1), rational(1,2), rational(1), rational(1,2)],
    [rational(2), rational(1,2), rational(1,2)]
  ]
};

function buildNotes(
  candidateId: string,
  story: HarmonyStory,
  durations: readonly Rational[],
  contour: readonly number[],
  chords: readonly string[]
): NoteEvent[] {
  const totalDuration = durations.reduce((total, duration) => total + toNumber(duration), 0);
  const chordDuration = chords.length > 0 ? totalDuration / chords.length : totalDuration;
  let onset = 0;
  const profile = melodyProfiles[story];
  return durations.map((duration, index) => {
    const offset = contour[index % contour.length];
    const chordIndex = Math.min(Math.floor(onset / chordDuration), Math.max(chords.length - 1, 0));
    const targetPitch = profile.basePitch + offset + profile.motion[index % profile.motion.length];
    const pitch = offset === -99 ? null
      : chords.length > 0 ? nearestChordTone(targetPitch, chords[chordIndex]) : targetPitch;
    const note = {
      id: `${candidateId}-${index}`,
      pitch,
      duration
    };
    onset += toNumber(duration);
    return note;
  });
}

function varyContour(contour: readonly number[], variation: number): readonly number[] {
  if (variation === 0) return contour;

  return contour.map((offset, index) => {
    if (offset === -99) return offset;
    const direction = index % 2 === 0 ? 1 : -1;
    return offset + direction * (variation + 1);
  });
}

function addRestVariation(notes: readonly NoteEvent[], candidateIndex: number): NoteEvent[] {
  const shouldAddRest = candidateIndex % 5 === 3 || candidateIndex % 5 === 4;
  if (!shouldAddRest || notes.some((note) => note.pitch === null)) return [...notes];

  const targetIndex = candidateIndex % 5 === 3 ? 0 : notes.length - 1;
  return notes.map((note, index) => index === targetIndex ? { ...note, pitch: null } : note);
}

export function getCandidates(
  story: HarmonyStory,
  meter: Meter = { beats: 4, beatUnit: 4 },
  chords: readonly string[] = []
): readonly MelodyCandidate[] {
  const key = meterKey(meter);
  const rhythms = rhythmTemplates[key];
  if (!rhythms) throw new Error(`지원하지 않는 박자입니다: ${key}`);

  const profile = melodyProfiles[story];
  const availableShapes = [...shapes[profile.family], ...extraShapes[profile.family]];
  const highImpactStart = MELODY_CANDIDATE_COUNT - highImpactShapes.length;

  return Array.from({ length: MELODY_CANDIDATE_COUNT }, (_, index) => {
    const isHighImpact = index >= highImpactStart;
    const shape = isHighImpact ? highImpactShapes[index - highImpactStart] : availableShapes[index % availableShapes.length];
    const variation = Math.floor(index / availableShapes.length);
    const chordKey = chords.length > 0 ? `-${chordSequenceKey(chords)}` : "";
    const id = `${story}-${key.replace("/", "-")}${chordKey}-${index + 1}`;
    return {
      id,
      name: isHighImpact || variation === 0 ? shape.name : `${shape.name} 새 리듬`,
      hint: isHighImpact || variation === 0 ? shape.hint : `${shape.hint} 음의 흐름도 새롭게 바꿨어요.`,
      feelingId: feelingIdForIndex(index),
      harmony: story,
      notes: isHighImpact ? buildNotes(
        id,
        "sparkle",
        rhythms[(index + melodyProfiles.sparkle.rhythmOffset) % rhythms.length],
        shape.contour,
        chords
      ) : addRestVariation(
        buildNotes(
          id,
          story,
          rhythms[(index + profile.rhythmOffset) % rhythms.length],
          varyContour(shape.contour, variation),
          chords
        ),
        index
      )
    };
  });
}
