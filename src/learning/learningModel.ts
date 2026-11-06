export type NoteId = "whole" | "half" | "quarter" | "eighth" | "quarter-rest";
export type DynamicId = "pp" | "p" | "mp" | "mf" | "f" | "ff";
export type LessonId = "notes" | "meter" | "tempo" | "dynamics" | "symbols";

export type LearningNote = {
  id: NoteId;
  name: string;
  beats: number;
  duration: "w" | "h" | "q" | "8" | "qr";
  rest: boolean;
};

export const NOTES: LearningNote[] = [
  { id: "whole", name: "온음표", beats: 4, duration: "w", rest: false },
  { id: "half", name: "2분음표", beats: 2, duration: "h", rest: false },
  { id: "quarter", name: "4분음표", beats: 1, duration: "q", rest: false },
  { id: "eighth", name: "8분음표", beats: 0.5, duration: "8", rest: false },
  { id: "quarter-rest", name: "4분쉼표", beats: 1, duration: "qr", rest: true }
];

export const DYNAMICS: { id: DynamicId; name: string; description: string; gain: number }[] = [
  { id: "pp", name: "피아니시모", description: "매우 여리게", gain: 0.035 },
  { id: "p", name: "피아노", description: "여리게", gain: 0.055 },
  { id: "mp", name: "메조피아노", description: "조금 여리게", gain: 0.08 },
  { id: "mf", name: "메조포르테", description: "조금 세게", gain: 0.115 },
  { id: "f", name: "포르테", description: "세게", gain: 0.16 },
  { id: "ff", name: "포르티시모", description: "매우 세게", gain: 0.21 }
];

export const LESSONS: { id: LessonId; title: string; subtitle: string; description: string }[] = [
  { id: "notes", title: "음표의 길이", subtitle: "길게, 짧게 소리를 이어요", description: "음표와 쉼표의 길이를 듣고 한 박을 나누어 봐요." },
  { id: "meter", title: "박자와 한 마디", subtitle: "하나 둘, 하나 둘!", description: "2/4, 3/4, 4/4박자를 골라 한 마디를 채워요." },
  { id: "tempo", title: "음악의 빠르기", subtitle: "같은 리듬도 다르게 들려요", description: "빠르기를 바꾸고 일정한 박에 맞춰 두드려 봐요." },
  { id: "dynamics", title: "소리의 세기", subtitle: "여리게, 세게 표현해요", description: "p, mf, f를 듣고 셈여림 기호를 익혀요." },
  { id: "symbols", title: "악보 기호 탐험", subtitle: "악보가 보내는 작은 약속", description: "높은음자리표, 세로줄, 도돌이표의 뜻을 알아봐요." }
];

export function getNote(id: NoteId): LearningNote {
  const note = NOTES.find((item) => item.id === id);
  if (!note) throw new Error(`알 수 없는 음표: ${id}`);
  return note;
}

export function totalBeats(noteIds: readonly NoteId[]): number {
  return noteIds.reduce((sum, id) => sum + getNote(id).beats, 0);
}

export function measureFeedback(noteIds: readonly NoteId[], beatsPerBar: number) {
  const remaining = beatsPerBar - totalBeats(noteIds);
  if (!noteIds.length) return { state: "empty" as const, remaining, message: `음표를 골라 ${beatsPerBar}박을 채워 봐요.` };
  if (remaining > 0) return { state: "incomplete" as const, remaining, message: `${remaining}박을 더 넣으면 한 마디가 완성돼요.` };
  if (remaining < 0) return { state: "overflow" as const, remaining, message: `${-remaining}박이 넘쳤어요. 마지막 음표를 빼 볼까요?` };
  return { state: "exact" as const, remaining, message: "한 마디 완성! 첫 박을 느끼며 들어 봐요." };
}

export function secondsForBeats(beats: number, bpm: number): number {
  if (!Number.isFinite(beats) || beats < 0) throw new RangeError("박의 길이는 0 이상이어야 해요.");
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError("빠르기는 0보다 커야 해요.");
  return beats * 60 / bpm;
}

export type LearningQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

export const QUIZZES: Record<LessonId, LearningQuestion[]> = {
  notes: [
    { id: "half-length", prompt: "4분음표가 1박일 때, 2분음표는 몇 박일까요?", options: ["1박", "2박", "4박"], answer: 1,
      explanation: "2분음표는 4분음표 두 개만큼 길어요. 소리를 한 번 내고 2박 동안 이어 가요." },
    { id: "eighth-pair", prompt: "4분음표 1개와 길이가 같은 것은?", options: ["8분음표 2개", "2분음표 2개", "온음표 1개"], answer: 0,
      explanation: "8분음표는 4분음표의 절반 길이예요. 반 박 + 반 박 = 한 박이에요." },
    { id: "rest-length", prompt: "4분음표가 1박일 때, 4분쉼표에서는 어떻게 할까요?", options: ["빨리 소리를 내요", "2박 쉬어요", "1박 소리 없이 쉬어요"], answer: 2,
      explanation: "쉼표도 길이가 있어요. 4분쉼표는 1박을 세면서 소리를 내지 않아요." },
    { id: "whole-length", prompt: "4분음표가 1박일 때, 온음표는 몇 박일까요?", options: ["4박", "2박", "반 박"], answer: 0,
      explanation: "온음표는 4분음표 네 개만큼 길어요. 하나, 둘, 셋, 넷 동안 소리를 이어 가요." }
  ],
  meter: [
    { id: "two-four", prompt: "2/4박자의 뜻은 무엇일까요?", options: ["한 마디에 4박", "4분음표를 1박으로, 한 마디에 2박", "2분음표를 1박으로, 한 마디에 4박"], answer: 1,
      explanation: "아래 숫자 4는 4분음표가 한 박이라는 뜻, 위 숫자 2는 한 마디에 두 박이라는 뜻이에요." },
    { id: "fill-two", prompt: "2/4박자 한 마디를 딱 채우는 것은?", options: ["온음표 1개", "4분음표 3개", "2분음표 1개"], answer: 2,
      explanation: "2분음표 1개는 2박이에요. 2/4박자의 한 마디를 딱 채워요." },
    { id: "three-four", prompt: "3/4박자에서는 한 마디를 어떻게 셀까요?", options: ["하나 둘 셋", "하나 둘", "하나 둘 셋 넷"], answer: 0,
      explanation: "4분음표를 한 박으로 세어 하나, 둘, 셋! 한 마디에 세 박이 들어가요." },
    { id: "barline", prompt: "악보의 세로줄은 무엇을 나누나요?", options: ["악기의 종류", "마디", "노래 제목"], answer: 1,
      explanation: "세로줄은 마디와 마디 사이의 경계예요. 일정한 박을 한 묶음씩 나누어 읽게 도와줘요." }
  ],
  tempo: [
    { id: "bpm-meaning", prompt: "4분음표 = 60은 어떤 빠르기일까요?", options: ["한 마디를 60번 연주해요", "1초에 60박이에요", "1분 동안 4분음표 박이 60번 가요"], answer: 2,
      explanation: "4분음표 = 60에서는 4분음표 한 박이 1초예요. 1분 동안 60박이 지나가요." },
    { id: "tempo-compare", prompt: "같은 리듬을 더 빠르게 연주하는 것은?", options: ["4분음표 = 120", "4분음표 = 60", "둘 다 같아요"], answer: 0,
      explanation: "숫자가 클수록 1분에 더 많은 박이 지나가요. 120은 60보다 두 배 빠른 박이에요." },
    { id: "tempo-duration", prompt: "빠르기가 바뀌면 2분음표는 어떻게 될까요? (4분음표가 1박)", options: ["항상 2초예요", "2박 길이는 같고, 실제 초 수가 달라져요", "4박으로 바뀌어요"], answer: 1,
      explanation: "2분음표는 여전히 2박이에요. 느린 박에서는 더 오래, 빠른 박에서는 더 짧은 시간 동안 들려요." }
  ],
  dynamics: [
    { id: "mf-meaning", prompt: "mf(메조포르테)는 무슨 뜻일까요?", options: ["아주 빠르게", "조금 세게", "매우 여리게"], answer: 1,
      explanation: "mf는 메조포르테, ‘조금 세게’예요. 빠르기가 아니라 소리의 세기를 알려 줘요." },
    { id: "p-f", prompt: "p와 f 중 더 여리게 연주하는 기호는?", options: ["f", "둘 다 같아요", "p"], answer: 2,
      explanation: "p(피아노)는 여리게, f(포르테)는 세게예요. 실제 크기는 곡과 악기, 주변 소리에 따라 달라요." },
    { id: "crescendo", prompt: "크레셴도(<) 기호는 어떻게 연주하라는 뜻일까요?", options: ["점점 세게", "점점 빠르게", "갑자기 멈추기"], answer: 0,
      explanation: "크레셴도는 점점 세게 연주해요. 빠르기는 그대로 두고 소리의 세기를 키워요." },
    { id: "decrescendo", prompt: "데크레셴도(>)는 어떻게 연주할까요?", options: ["점점 높게", "점점 여리게", "점점 빠르게"], answer: 1,
      explanation: "데크레셴도는 점점 여리게 연주하라는 뜻이에요. 음의 높이나 빠르기를 바꾸는 기호가 아니에요." }
  ],
  symbols: [
    { id: "treble", prompt: "높은음자리표는 어떤 약속일까요?", options: ["무조건 크게 연주해요", "노래를 끝내요", "오선의 둘째 줄이 ‘솔’이에요"], answer: 2,
      explanation: "높은음자리표는 오선의 아래에서 둘째 줄을 ‘솔’로 정해요. 이것을 기준으로 음의 높이를 읽어요." },
    { id: "repeat", prompt: "도돌이표를 만나면 어떻게 할까요?", options: ["시작 도돌이표로 돌아가 한 번 더 연주해요", "무조건 더 빠르게 연주해요", "다음 곡으로 넘어가요"], answer: 0,
      explanation: "끝 도돌이표에서는 짝을 이룬 시작 도돌이표로 돌아가요. 시작 도돌이표가 없으면 곡의 처음으로 돌아가요." },
    { id: "double-bar", prompt: "끝세로줄(가는 줄과 굵은 줄)은 무엇을 알려 줄까요?", options: ["더 크게 연주해요", "곡이 끝나요", "한 박을 쉬어요"], answer: 1,
      explanation: "가는 줄 옆에 굵은 줄이 있는 끝세로줄은 곡의 끝을 알려 줘요. 마디를 나누는 세로줄과 구별해 봐요." }
  ]
};
