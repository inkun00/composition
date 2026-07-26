export type HarmonyAuditFamily =
  | "기능화성"
  | "팝 스키마"
  | "순차진행·성부진행"
  | "선법·블루스·오음계"
  | "차용·반음계 색채"
  | "재즈 확장"
  | "실험적 화성";

export const HARMONY_RESEARCH_SOURCES = [
  {
    id: "function-cadence",
    title: "Introduction to Harmony, Cadences, and Phrase Endings",
    url: "https://viva.pressbooks.pub/openmusictheory/chapter/intro-to-harmony/",
    concepts: ["으뜸-버금딸림-딸림-으뜸", "정격종지", "반종지"]
  },
  {
    id: "pop-schemas",
    title: "Four-Chord Schemas",
    url: "https://viva.pressbooks.pub/openmusictheory/chapter/4-chord-schemas/",
    concepts: ["두왑", "싱어송라이터", "홉스코치", "회전형은 같은 스키마 계열"]
  },
  {
    id: "modal-schemas",
    title: "Modal Schemas",
    url: "https://viva.pressbooks.pub/openmusictheory/chapter/modal-schemas/",
    concepts: ["믹솔리디안", "에올리안", "도리안", "리디안"]
  },
  {
    id: "diatonic-sequences",
    title: "Diatonic Sequences in Middles",
    url: "https://viva.pressbooks.pub/openmusictheory/chapter/diatonic-sequences/",
    concepts: ["5도 하행", "3도 하행", "상행 5-6"]
  },
  {
    id: "blues",
    title: "Blues Harmony",
    url: "https://viva.pressbooks.pub/openmusictheory/chapter/blues-harmony/",
    concepts: ["I7-IV7-V7", "블루스의 장·단3도 혼합"]
  },
  {
    id: "pentatonic",
    title: "Pentatonic Harmony",
    url: "https://viva.pressbooks.pub/openmusictheory/chapter/pentatonic-harmony/",
    concepts: ["오음계 화성", "팝·록의 비기능적 색채"]
  },
  {
    id: "rock-corpus",
    title: "A Corpus Analysis of Rock Harmony",
    url: "https://rockcorpus.midside.com/2011_paper/declercq_temperley_2011.pdf",
    concepts: ["대중음악 화음 빈도", "근음 이동", "코퍼스 기반 비교"]
  }
] as const;

export const HARMONY_AUDIT_CRITERIA = [
  {
    family: "기능화성",
    question: "집-여행-기대-도착의 방향과 열린·닫힌 끝맺음이 모두 있는가?",
    examples: ["I-IV-V-I", "I-iii-IV-V", "i-♭II-V-i"]
  },
  {
    family: "팝 스키마",
    question: "대표 스키마는 담되 단순 회전형을 서로 다른 작품처럼 세지 않았는가?",
    examples: ["I-vi-IV-V", "I-vi-ii-V", "I-V-vi-IV", "IV-V-vi-I"]
  },
  {
    family: "순차진행·성부진행",
    question: "5도권·하행 베이스·페달·전위처럼 실제로 다른 움직임이 있는가?",
    examples: ["5도 하행", "파헬벨", "라멘트 베이스"]
  },
  {
    family: "선법·블루스·오음계",
    question: "장·단조 밖의 밝기와 리듬감을 쉽게 들을 수 있는가?",
    examples: ["I-♭VII-IV-I", "i-IV", "I-♭III-IV-I"]
  },
  {
    family: "차용·반음계 색채",
    question: "단조 버금딸림·나폴리·크로매틱 미디언트가 서로 다른 감정을 내는가?",
    examples: ["I-IV-iv-I", "i-♭II-V-i", "I-♭VI-III-I"]
  },
  {
    family: "재즈 확장",
    question: "같은 ii-V-I에 7·9·13음을 붙인 것만으로 목록 수를 늘리지 않았는가?",
    examples: ["ii7-V7-Imaj7", "트라이톤 대리", "백도어 진행"]
  },
  {
    family: "실험적 화성",
    question: "특수 화음은 소리 차이가 분명하고 어린이의 표현 주제로 설명 가능한가?",
    examples: ["온음계", "대칭 감7화음", "증화음", "역방향 기능"]
  }
] as const satisfies readonly {
  family: HarmonyAuditFamily;
  question: string;
  examples: readonly string[];
}[];

export const HARMONY_REPLACEMENTS = [
  {
    id: "H009",
    removed: "이탈리아 증6도 진행 · It+6-G",
    removedBars: [["It+6"], ["It+6"], ["G"], ["G"]],
    reason: "H010·H011과 같은 증6도-딸림음 골격이며 초등 창작용으로 셋을 따로 둘 필요가 작음",
    added: "3도 화음이 여는 반종지 · C-Em-F-G",
    addedBars: [["C"], ["Em"], ["F"], ["G"]],
    family: "기능화성",
    sourceConcept: "으뜸-약한 버금딸림-버금딸림-딸림의 열린 질문"
  },
  {
    id: "H010",
    removed: "프랑스 증6도 진행 · Fr+6-G",
    removedBars: [["Fr+6"], ["Fr+6"], ["G"], ["G"]],
    reason: "H009·H011과 기능과 도착점이 같아 귀로 구별하기 어려운 전문 변형",
    added: "버금딸림 두 겹 반종지 · C-Dm-F-G",
    addedBars: [["C"], ["Dm"], ["F"], ["G"]],
    family: "기능화성",
    sourceConcept: "두 버금딸림 기능을 거쳐 딸림에서 멈추는 반종지"
  },
  {
    id: "H027",
    removed: "저스틴 비버 진행 · Fmaj7-G-Em7-Am7",
    removedBars: [["Fmaj7"], ["G"], ["Em7"], ["Am7"]],
    reason: "H028과 근음·화음 성질이 같고 확장음만 조금 다름",
    added: "다이어토닉 두왑 변형 · C-Am-Dm-G",
    addedBars: [["C"], ["Am"], ["Dm"], ["G"]],
    family: "팝 스키마",
    sourceConcept: "I-vi-IV-V에서 IV를 ii로 바꾼 대표 두왑 변형"
  },
  {
    id: "H038",
    removed: "새드 머니 코드 · Am-F-C-G",
    removedBars: [["Am"], ["F"], ["C"], ["G"]],
    reason: "H026 C-G-Am-F의 회전형으로 같은 싱어송라이터 스키마 계열",
    added: "블루스 내림3도 색채 진행 · C-E♭-F-C",
    addedBars: [["C"], ["E♭"], ["F"], ["C"]],
    family: "선법·블루스·오음계",
    sourceConcept: "장조 으뜸 위에 ♭III를 섞는 블루스·오음계 색채"
  },
  {
    id: "H042",
    removed: "로열 로드 마이너 변형 · Fmaj7-E7-Am7-Gm7-C7",
    removedBars: [["Fmaj7"], ["E7"], ["Am7"], ["Gm7", "C7"]],
    reason: "H054와 로열 로드 계열과 2차 딸림 기능이 겹침",
    added: "장3도 상승과 단조 버금딸림 · C-E-F-Fm",
    addedBars: [["C"], ["E"], ["F"], ["Fm"]],
    family: "차용·반음계 색채",
    sourceConcept: "III 장화음의 상승감과 iv 차용화음의 아련함 대비"
  },
  {
    id: "H073",
    removed: "렐러티브 메이저 스왑 · Am7-Dm7-G7-Cmaj7",
    removedBars: [["Am7"], ["Dm7"], ["G7"], ["Cmaj7"]],
    reason: "H048의 단조에서 관계장조로 향하는 기능 골격과 같음",
    added: "버금딸림 기능 확장 · Cmaj7-Fmaj7-Dm7-G7",
    addedBars: [["Cmaj7"], ["Fmaj7"], ["Dm7"], ["G7"]],
    family: "기능화성",
    sourceConcept: "IV와 ii를 연달아 사용해 기대를 길게 만드는 기능 확장"
  },
  {
    id: "H080",
    removed: "도리안 모달 루프 · Dm7-G7",
    removedBars: [["Dm7"], ["G7"], ["Dm7"], ["G7"]],
    reason: "H086 Am-D와 같은 도리안 i-IV 뱀프의 조옮김·확장음 변형",
    added: "크로매틱 미디언트 왕복 · C-A♭-E-C",
    addedBars: [["C"], ["A♭"], ["E"], ["C"]],
    family: "차용·반음계 색채",
    sourceConcept: "공통음과 장3도 관계로 장면을 크게 바꾸는 화음 이동"
  },
  {
    id: "H082",
    removed: "힙합 칠홉 루프 · Dm9-G13-Cmaj9",
    removedBars: [["Dm9"], ["G13"], ["Cmaj9"], ["Cmaj9"]],
    reason: "H051의 ii-V-I에 9·13음을 더한 확장음 변형",
    added: "단조 플라갈 귀환 · Am-G-Dm-Am",
    addedBars: [["Am"], ["G"], ["Dm"], ["Am"]],
    family: "선법·블루스·오음계",
    sourceConcept: "자연단음계에서 iv-i로 부드럽게 돌아오는 단조 플라갈"
  },
  {
    id: "H090",
    removed: "모던 록 파워코드 진행 · C5-G5-A5-F5",
    removedBars: [["C5"], ["G5"], ["A5"], ["F5"]],
    reason: "H026의 I-V-vi-IV와 근음이 같고 3음을 뺀 보이싱 차이뿐임",
    added: "확장 플라갈 모험 진행 · C-E♭-B♭-F",
    addedBars: [["C"], ["E♭"], ["B♭"], ["F"]],
    family: "선법·블루스·오음계",
    sourceConcept: "♭III-♭VII-IV를 잇는 록의 확장 플라갈 색채"
  },
  {
    id: "H099",
    removed: "할리우드 로맨스 종지 · Dm7-G7-C6",
    removedBars: [["Dm7"], ["G7"], ["C6"], ["C6"]],
    reason: "H051의 ii-V-I와 같은 기능 골격이며 종지 화음의 6음만 다름",
    added: "단조 대조형 정격 귀환 · Am-C-Dm-E",
    addedBars: [["Am"], ["C"], ["Dm"], ["E"]],
    family: "기능화성",
    sourceConcept: "단조의 i-III-iv-V로 슬픔과 용기를 함께 표현"
  }
] as const satisfies readonly {
  id: string;
  removed: string;
  removedBars: readonly (readonly string[])[];
  reason: string;
  added: string;
  addedBars: readonly (readonly string[])[];
  family: HarmonyAuditFamily;
  sourceConcept: string;
}[];

export const HARMONY_RETAINED_VARIANTS = [
  {
    ids: ["H001", "H012", "H018"],
    decision: "유지",
    reason: "근음은 비슷하지만 완전정격·전위 종지·페달 포인트라는 성부진행 차이를 실제 재생에서 들려줌"
  },
  {
    ids: ["H055", "H056"],
    decision: "유지",
    reason: "반음 접근과 트라이톤 대리는 베이스 방향과 해결 감각이 서로 다름"
  },
  {
    ids: ["H061", "H062"],
    decision: "유지",
    reason: "5도 하행과 콜트레인 변화는 근음 이동 규칙과 긴장 속도가 뚜렷하게 다름"
  },
  {
    ids: ["H011"],
    decision: "대표 하나만 유지",
    reason: "증6도 계열의 색채는 보존하되 이탈리아·프랑스·독일형을 세 자리로 세지 않음"
  }
] as const;
