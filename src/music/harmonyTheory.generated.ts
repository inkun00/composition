// PRD.md의 공식 화음 표에서 자동 생성합니다. 직접 수정하지 마세요.
export type HarmonyTheoryRow = Readonly<{
  id: string;
  teacherName: string;
  mood: string;
  original: string;
  bars: readonly (readonly string[])[];
}>;

export const HARMONY_THEORY: readonly HarmonyTheoryRow[] = [
  {
    "id": "H001",
    "teacherName": "정격 종지 진행",
    "mood": "정직함, 당당함, 확실한 마침",
    "original": "C–F–G–C",
    "bars": [
      [
        "C"
      ],
      [
        "F"
      ],
      [
        "G"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H002",
    "teacherName": "변격 종지(아멘 종지)",
    "mood": "성스럽고 평온함, 온화한 포용",
    "original": "C–F–C",
    "bars": [
      [
        "C"
      ],
      [
        "F"
      ],
      [
        "C"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H003",
    "teacherName": "위종지(속임수 해결)",
    "mood": "반전, 여운, 끝나지 않음",
    "original": "C–F–G–Am",
    "bars": [
      [
        "C"
      ],
      [
        "F"
      ],
      [
        "G"
      ],
      [
        "Am"
      ]
    ]
  },
  {
    "id": "H004",
    "teacherName": "파헬벨 캐논 진행",
    "mood": "서정적, 장엄함, 대서사",
    "original": "C–G–Am–Em–F–C–F–G",
    "bars": [
      [
        "C",
        "G"
      ],
      [
        "Am",
        "Em"
      ],
      [
        "F",
        "C"
      ],
      [
        "F",
        "G"
      ]
    ]
  },
  {
    "id": "H005",
    "teacherName": "안달루시아 진행",
    "mood": "어둡고 비장한 정열",
    "original": "Am–G–F–E",
    "bars": [
      [
        "Am"
      ],
      [
        "G"
      ],
      [
        "F"
      ],
      [
        "E"
      ]
    ]
  },
  {
    "id": "H006",
    "teacherName": "피카르디 종지",
    "mood": "어둠 끝의 빛, 신성한 반전",
    "original": "Am–Dm–E7–A",
    "bars": [
      [
        "Am"
      ],
      [
        "Dm"
      ],
      [
        "E7"
      ],
      [
        "A"
      ]
    ]
  },
  {
    "id": "H007",
    "teacherName": "5도권 순환 진행",
    "mood": "화려하고 극적인 전개",
    "original": "C–F–Bdim–Em–Am–Dm–G–C",
    "bars": [
      [
        "C",
        "F"
      ],
      [
        "Bdim",
        "Em"
      ],
      [
        "Am",
        "Dm"
      ],
      [
        "G",
        "C"
      ]
    ]
  },
  {
    "id": "H008",
    "teacherName": "나폴리 화음 진행",
    "mood": "이국적 슬픔, 극적 비장미",
    "original": "Dm–D♭–C",
    "bars": [
      [
        "Dm"
      ],
      [
        "D♭"
      ],
      [
        "C"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H009",
    "teacherName": "이탈리아 증6도 진행",
    "mood": "날카로운 긴장, 웅장한 도약",
    "original": "It+6(Fm 계열)–G",
    "bars": [
      [
        "It+6"
      ],
      [
        "It+6"
      ],
      [
        "G"
      ],
      [
        "G"
      ]
    ]
  },
  {
    "id": "H010",
    "teacherName": "프랑스 증6도 진행",
    "mood": "오묘하고 세련된 긴장",
    "original": "Fr+6(Fm 계열)–G",
    "bars": [
      [
        "Fr+6"
      ],
      [
        "Fr+6"
      ],
      [
        "G"
      ],
      [
        "G"
      ]
    ]
  },
  {
    "id": "H011",
    "teacherName": "독일 증6도 진행",
    "mood": "두껍고 묵직한 드라마",
    "original": "Ger+6(Fm 계열)–G",
    "bars": [
      [
        "Ger+6"
      ],
      [
        "Ger+6"
      ],
      [
        "G"
      ],
      [
        "G"
      ]
    ]
  },
  {
    "id": "H012",
    "teacherName": "불완전 정격종지",
    "mood": "덜 닫힌 듯한 부드러운 결말",
    "original": "C–F–G–C/E",
    "bars": [
      [
        "C"
      ],
      [
        "F"
      ],
      [
        "G"
      ],
      [
        "C/E"
      ]
    ]
  },
  {
    "id": "H013",
    "teacherName": "반종지",
    "mood": "질문, 다음 단락을 위한 대기",
    "original": "C–Am–F–G",
    "bars": [
      [
        "C"
      ],
      [
        "Am"
      ],
      [
        "F"
      ],
      [
        "G"
      ]
    ]
  },
  {
    "id": "H014",
    "teacherName": "프리지안 반종지",
    "mood": "바로크풍, 비극적인 질문",
    "original": "Dm–Am/C–Bdim/D–E",
    "bars": [
      [
        "Dm"
      ],
      [
        "Am/C"
      ],
      [
        "Bdim/D"
      ],
      [
        "E"
      ]
    ]
  },
  {
    "id": "H015",
    "teacherName": "플라갈 가미 진행",
    "mood": "따뜻하게 잦아드는 마무리",
    "original": "C–Am–F–Fm–C",
    "bars": [
      [
        "C"
      ],
      [
        "Am"
      ],
      [
        "F",
        "Fm"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H016",
    "teacherName": "3도 하강 순환 진행",
    "mood": "고전적 안정감, 부드러운 하강",
    "original": "C–Am–F–Dm–Bdim–G",
    "bars": [
      [
        "C",
        "Am"
      ],
      [
        "F",
        "Dm"
      ],
      [
        "Bdim"
      ],
      [
        "G"
      ]
    ]
  },
  {
    "id": "H017",
    "teacherName": "티에르스 드 피카르디 확장",
    "mood": "고뇌 뒤 대성당이 열리는 느낌",
    "original": "Am–F–E7–Amaj7",
    "bars": [
      [
        "Am"
      ],
      [
        "F"
      ],
      [
        "E7"
      ],
      [
        "Amaj7"
      ]
    ]
  },
  {
    "id": "H018",
    "teacherName": "토닉 페달 포인트",
    "mood": "흔들리지 않는 뿌리, 거대한 서막",
    "original": "C/C–F/C–G/C–C/C",
    "bars": [
      [
        "C/C"
      ],
      [
        "F/C"
      ],
      [
        "G/C"
      ],
      [
        "C/C"
      ]
    ]
  },
  {
    "id": "H019",
    "teacherName": "도미넌트 페달 포인트",
    "mood": "폭풍 전야, 폭발 직전의 긴장",
    "original": "F/G–Fm/G–Em/G–G7",
    "bars": [
      [
        "F/G"
      ],
      [
        "Fm/G"
      ],
      [
        "Em/G"
      ],
      [
        "G7"
      ]
    ]
  },
  {
    "id": "H020",
    "teacherName": "소프라노 순차 상행 종지",
    "mood": "희망찬 찬가, 상승",
    "original": "F–G–Am–Bdim–C",
    "bars": [
      [
        "F"
      ],
      [
        "G"
      ],
      [
        "Am",
        "Bdim"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H021",
    "teacherName": "베이스 순차 하강 진행",
    "mood": "고전적 비장미, 침잠",
    "original": "C–G/B–Am–G–F",
    "bars": [
      [
        "C"
      ],
      [
        "G/B",
        "Am"
      ],
      [
        "G"
      ],
      [
        "F"
      ]
    ]
  },
  {
    "id": "H022",
    "teacherName": "혼합 변격 종지",
    "mood": "몽환적이고 두터운 마감",
    "original": "C–A♭–B♭–C",
    "bars": [
      [
        "C"
      ],
      [
        "A♭"
      ],
      [
        "B♭"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H023",
    "teacherName": "주요 3화음 무한 루프",
    "mood": "단순하고 순박한 포크 감성",
    "original": "I–IV–V–IV–I",
    "bars": [
      [
        "I"
      ],
      [
        "IV"
      ],
      [
        "V",
        "IV"
      ],
      [
        "I"
      ]
    ]
  },
  {
    "id": "H024",
    "teacherName": "가곡풍 단조 정격진행",
    "mood": "고독하고 쓸쓸한 마침",
    "original": "Am–Dm–E–Am",
    "bars": [
      [
        "Am"
      ],
      [
        "Dm"
      ],
      [
        "E"
      ],
      [
        "Am"
      ]
    ]
  },
  {
    "id": "H025",
    "teacherName": "전위 화음 순차 진행",
    "mood": "유려하고 끊김 없는 베이스",
    "original": "C–G/B–Am/C–E/B–F",
    "bars": [
      [
        "C"
      ],
      [
        "G/B"
      ],
      [
        "Am/C",
        "E/B"
      ],
      [
        "F"
      ]
    ]
  },
  {
    "id": "H026",
    "teacherName": "머니 코드(The Pop)",
    "mood": "희망과 아련함, 중독성",
    "original": "C–G–Am–F",
    "bars": [
      [
        "C"
      ],
      [
        "G"
      ],
      [
        "Am"
      ],
      [
        "F"
      ]
    ]
  },
  {
    "id": "H027",
    "teacherName": "저스틴 비버 진행",
    "mood": "몽환적 표류감, 하이틴 감성",
    "original": "Fmaj7–G–Em7–Am7",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "G"
      ],
      [
        "Em7"
      ],
      [
        "Am7"
      ]
    ]
  },
  {
    "id": "H028",
    "teacherName": "왕도(로열 로드) 진행",
    "mood": "청량함, 질주, 성장",
    "original": "Fmaj7–G7–Em7–Am",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "G7"
      ],
      [
        "Em7"
      ],
      [
        "Am"
      ]
    ]
  },
  {
    "id": "H029",
    "teacherName": "서브도미넌트 마이너",
    "mood": "아련한 추억, 갑작스러운 울컥함",
    "original": "C–F–Fm–C",
    "bars": [
      [
        "C"
      ],
      [
        "F"
      ],
      [
        "Fm"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H030",
    "teacherName": "소프라노 하강 대리",
    "mood": "애틋한 이별, 가슴 시림",
    "original": "Fmaj7–Fm6–Em7–Am7",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "Fm6"
      ],
      [
        "Em7"
      ],
      [
        "Am7"
      ]
    ]
  },
  {
    "id": "H031",
    "teacherName": "디즈니 엔딩 진행",
    "mood": "별빛과 마법 같은 환상",
    "original": "Fmaj7–Fm6–Cmaj7",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "Fm6"
      ],
      [
        "Cmaj7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H032",
    "teacherName": "백도어 종지",
    "mood": "레트로하고 세련된 마감",
    "original": "Fmaj7–B♭7–Cmaj7",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "B♭7"
      ],
      [
        "Cmaj7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H033",
    "teacherName": "서스포(sus4) 빌드업",
    "mood": "절정 직전의 기다림",
    "original": "Gsus4–G7–C",
    "bars": [
      [
        "Gsus4"
      ],
      [
        "G7"
      ],
      [
        "C"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H034",
    "teacherName": "감7화음 패싱",
    "mood": "서스펜스, 매끄러운 징검다리",
    "original": "C–C♯dim7–Dm7–G7",
    "bars": [
      [
        "C"
      ],
      [
        "C♯dim7"
      ],
      [
        "Dm7"
      ],
      [
        "G7"
      ]
    ]
  },
  {
    "id": "H035",
    "teacherName": "소울풀 4도 하강",
    "mood": "기름지고 따뜻한 R&B 감성",
    "original": "Fmaj7–Em7–Dm7–Cmaj7",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "Em7"
      ],
      [
        "Dm7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H036",
    "teacherName": "하상진행 발라드 루프",
    "mood": "후회와 미련, 이별 감성",
    "original": "C–G/B–Am7–C/G–F",
    "bars": [
      [
        "C"
      ],
      [
        "G/B"
      ],
      [
        "Am7",
        "C/G"
      ],
      [
        "F"
      ]
    ]
  },
  {
    "id": "H037",
    "teacherName": "머니코드 리버스",
    "mood": "상쾌한 햇살, 페스티벌",
    "original": "F–G–Am–C",
    "bars": [
      [
        "F"
      ],
      [
        "G"
      ],
      [
        "Am"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H038",
    "teacherName": "새드 머니 코드",
    "mood": "절망 속 희망, 엔딩 크레딧",
    "original": "Am–F–C–G",
    "bars": [
      [
        "Am"
      ],
      [
        "F"
      ],
      [
        "C"
      ],
      [
        "G"
      ]
    ]
  },
  {
    "id": "H039",
    "teacherName": "청춘 질주 진행",
    "mood": "록의 시원하고 강한 에너지",
    "original": "C–F–Am–G",
    "bars": [
      [
        "C"
      ],
      [
        "F"
      ],
      [
        "Am"
      ],
      [
        "G"
      ]
    ]
  },
  {
    "id": "H040",
    "teacherName": "센치해지는 하강 진행",
    "mood": "노을, 쓸쓸한 바닷가",
    "original": "Am–Am/G–Fmaj7–E7",
    "bars": [
      [
        "Am"
      ],
      [
        "Am/G"
      ],
      [
        "Fmaj7"
      ],
      [
        "E7"
      ]
    ]
  },
  {
    "id": "H041",
    "teacherName": "에픽 팝 루프",
    "mood": "웅장함, 영웅의 탄생",
    "original": "Am–F–G–Em",
    "bars": [
      [
        "Am"
      ],
      [
        "F"
      ],
      [
        "G"
      ],
      [
        "Em"
      ]
    ]
  },
  {
    "id": "H042",
    "teacherName": "로열 로드 마이너 변형",
    "mood": "다크 판타지, 비장한 각성",
    "original": "Fmaj7–E7–Am7–Gm7(C7)",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "E7"
      ],
      [
        "Am7"
      ],
      [
        "Gm7",
        "C7"
      ]
    ]
  },
  {
    "id": "H043",
    "teacherName": "K-발라드 후렴구 종지",
    "mood": "고음 클라이맥스의 애절함",
    "original": "Dm7–G/F–Em7–A7",
    "bars": [
      [
        "Dm7"
      ],
      [
        "G/F"
      ],
      [
        "Em7"
      ],
      [
        "A7"
      ]
    ]
  },
  {
    "id": "H044",
    "teacherName": "세련된 브릿지 진행",
    "mood": "분위기 전환과 반전",
    "original": "A♭maj7–B♭7–Cmaj7",
    "bars": [
      [
        "A♭maj7"
      ],
      [
        "B♭7"
      ],
      [
        "Cmaj7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H045",
    "teacherName": "마이너 브릿지 탈출",
    "mood": "슬픔에서 희망으로 도약",
    "original": "Fmaj7–G–G♯dim7–Am7",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "G"
      ],
      [
        "G♯dim7"
      ],
      [
        "Am7"
      ]
    ]
  },
  {
    "id": "H046",
    "teacherName": "어쿠스틱 인디 팝 루프",
    "mood": "카페처럼 편안하고 나른함",
    "original": "Cmaj7–Fmaj7–Cmaj7–Fmaj7",
    "bars": [
      [
        "Cmaj7"
      ],
      [
        "Fmaj7"
      ],
      [
        "Cmaj7"
      ],
      [
        "Fmaj7"
      ]
    ]
  },
  {
    "id": "H047",
    "teacherName": "시티팝 베이스 슬랩 진행",
    "mood": "네온사인 밤거리",
    "original": "Dm7–Em7–Fmaj7–G7",
    "bars": [
      [
        "Dm7"
      ],
      [
        "Em7"
      ],
      [
        "Fmaj7"
      ],
      [
        "G7"
      ]
    ]
  },
  {
    "id": "H048",
    "teacherName": "마이너 머니 코드",
    "mood": "다크하고 치명적인 후렴",
    "original": "Am–Dm–G–C",
    "bars": [
      [
        "Am"
      ],
      [
        "Dm"
      ],
      [
        "G"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H049",
    "teacherName": "애절한 4도 마이너 종지",
    "mood": "마지막에 떨어지는 눈물",
    "original": "Dm7–Fm6–C",
    "bars": [
      [
        "Dm7"
      ],
      [
        "Fm6"
      ],
      [
        "C"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H050",
    "teacherName": "청량 하이틴 락 진행",
    "mood": "쾌활하고 에너제틱함",
    "original": "F–C–G–Am",
    "bars": [
      [
        "F"
      ],
      [
        "C"
      ],
      [
        "G"
      ],
      [
        "Am"
      ]
    ]
  },
  {
    "id": "H051",
    "teacherName": "재즈 ii–V–I",
    "mood": "도시적, 지적이고 부드러움",
    "original": "Dm7–G7–Cmaj7",
    "bars": [
      [
        "Dm7"
      ],
      [
        "G7"
      ],
      [
        "Cmaj7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H052",
    "teacherName": "마이너 ii–V–i",
    "mood": "애절하고 어두운 재즈",
    "original": "Bm7♭5–E7–Am7",
    "bars": [
      [
        "Bm7♭5"
      ],
      [
        "E7"
      ],
      [
        "Am7"
      ],
      [
        "Am7"
      ]
    ]
  },
  {
    "id": "H053",
    "teacherName": "트라이톤 대리 진행",
    "mood": "나른하고 세련된 반음 해결",
    "original": "Dm7–D♭7–Cmaj7",
    "bars": [
      [
        "Dm7"
      ],
      [
        "D♭7"
      ],
      [
        "Cmaj7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H054",
    "teacherName": "네오 소울 루프",
    "mood": "몽환적이고 그루비함",
    "original": "Fmaj7–E7–Am7–Dm7(G7)",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "E7"
      ],
      [
        "Am7"
      ],
      [
        "Dm7",
        "G7"
      ]
    ]
  },
  {
    "id": "H055",
    "teacherName": "하강 라인 클리셰",
    "mood": "고독, 치밀한 긴장",
    "original": "Am–Am(maj7)–Am7–Am6",
    "bars": [
      [
        "Am"
      ],
      [
        "Am(maj7)"
      ],
      [
        "Am7"
      ],
      [
        "Am6"
      ]
    ]
  },
  {
    "id": "H056",
    "teacherName": "상행 라인 클리셰",
    "mood": "점진적 성장과 빌드업",
    "original": "C–Caug–C6–C7",
    "bars": [
      [
        "C"
      ],
      [
        "Caug"
      ],
      [
        "C6"
      ],
      [
        "C7"
      ]
    ]
  },
  {
    "id": "H057",
    "teacherName": "부속7화음",
    "mood": "순간적인 벅참과 변화",
    "original": "C–E7–Am–F",
    "bars": [
      [
        "C"
      ],
      [
        "E7"
      ],
      [
        "Am"
      ],
      [
        "F"
      ]
    ]
  },
  {
    "id": "H058",
    "teacherName": "익스텐디드 도미넌트",
    "mood": "연속되는 세련된 긴장",
    "original": "A7–D7–G7–Cmaj7",
    "bars": [
      [
        "A7"
      ],
      [
        "D7"
      ],
      [
        "G7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H059",
    "teacherName": "레이디 가가 치트키",
    "mood": "몽환적이고 그루비한 클럽",
    "original": "Am–C–G–D",
    "bars": [
      [
        "Am"
      ],
      [
        "C"
      ],
      [
        "G"
      ],
      [
        "D"
      ]
    ]
  },
  {
    "id": "H060",
    "teacherName": "콜트레인 체인지",
    "mood": "기하학적이고 우주적인 변화",
    "original": "Cmaj7–E♭7–A♭maj7–B7–Emaj7–G7–Cmaj7",
    "bars": [
      [
        "Cmaj7",
        "E♭7"
      ],
      [
        "A♭maj7",
        "B7"
      ],
      [
        "Emaj7",
        "G7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H061",
    "teacherName": "재즈 턴어라운드(1–6–2–5)",
    "mood": "순환하는 재즈 잼 감성",
    "original": "Cmaj7–A7–Dm7–G7",
    "bars": [
      [
        "Cmaj7"
      ],
      [
        "A7"
      ],
      [
        "Dm7"
      ],
      [
        "G7"
      ]
    ]
  },
  {
    "id": "H062",
    "teacherName": "마이너 턴어라운드",
    "mood": "차갑고 시크한 도시의 밤",
    "original": "Am7–F♯m7♭5–Bm7♭5–E7",
    "bars": [
      [
        "Am7"
      ],
      [
        "F♯m7♭5"
      ],
      [
        "Bm7♭5"
      ],
      [
        "E7"
      ]
    ]
  },
  {
    "id": "H063",
    "teacherName": "어반 R&B 루프",
    "mood": "새벽의 끈적한 감성",
    "original": "Fmaj7–B7–Em7–Am7",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "B7"
      ],
      [
        "Em7"
      ],
      [
        "Am7"
      ]
    ]
  },
  {
    "id": "H064",
    "teacherName": "디미니쉬 하강 클리셰",
    "mood": "미끄러지는 세련된 슬픔",
    "original": "Cmaj7–Bdim7–B♭dim7–Am7",
    "bars": [
      [
        "Cmaj7"
      ],
      [
        "Bdim7"
      ],
      [
        "B♭dim7"
      ],
      [
        "Am7"
      ]
    ]
  },
  {
    "id": "H065",
    "teacherName": "서브파이브 마이너 ii–V–I",
    "mood": "반음 상행의 예측 불허 쾌감",
    "original": "E♭m7–A♭7–Dm7–G7–Cmaj7",
    "bars": [
      [
        "E♭m7",
        "A♭7"
      ],
      [
        "Dm7"
      ],
      [
        "G7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H066",
    "teacherName": "블루스 12마디 축약 진행",
    "mood": "자유롭고 즉흥적인 반항",
    "original": "C7–F7–C7–G7–F7–C7",
    "bars": [
      [
        "C7",
        "F7"
      ],
      [
        "C7"
      ],
      [
        "G7",
        "F7"
      ],
      [
        "C7"
      ]
    ]
  },
  {
    "id": "H067",
    "teacherName": "버디 리치 워킹 진행",
    "mood": "빅밴드의 폭발적인 질주",
    "original": "C6–E♭dim7–Dm7–G7",
    "bars": [
      [
        "C6"
      ],
      [
        "E♭dim7"
      ],
      [
        "Dm7"
      ],
      [
        "G7"
      ]
    ]
  },
  {
    "id": "H068",
    "teacherName": "세컨더리 도미넌트 위종지",
    "mood": "기대를 비트는 큰 반전",
    "original": "Cmaj7–B7–Cmaj7",
    "bars": [
      [
        "Cmaj7"
      ],
      [
        "B7"
      ],
      [
        "Cmaj7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H069",
    "teacherName": "모달 재즈 인터체인지",
    "mood": "자유롭고 신비로운 색채",
    "original": "Cmaj7–E♭maj7–D♭maj7–Cmaj7",
    "bars": [
      [
        "Cmaj7"
      ],
      [
        "E♭maj7"
      ],
      [
        "D♭maj7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H070",
    "teacherName": "연속 마이너 세븐 진행",
    "mood": "가벼운 그루브와 몽환성",
    "original": "Dm7–Em7–Fm7–Gm7",
    "bars": [
      [
        "Dm7"
      ],
      [
        "Em7"
      ],
      [
        "Fm7"
      ],
      [
        "Gm7"
      ]
    ]
  },
  {
    "id": "H071",
    "teacherName": "하프 디미니쉬 서스펜스",
    "mood": "해결되지 않는 안개 속 불안",
    "original": "Bm7♭5–E7–Bm7♭5–E7",
    "bars": [
      [
        "Bm7♭5"
      ],
      [
        "E7"
      ],
      [
        "Bm7♭5"
      ],
      [
        "E7"
      ]
    ]
  },
  {
    "id": "H072",
    "teacherName": "재즈 발라드 엔딩",
    "mood": "사치스럽고 따뜻한 마무리",
    "original": "Dm7–G7–D♭maj7–Cmaj7",
    "bars": [
      [
        "Dm7"
      ],
      [
        "G7"
      ],
      [
        "D♭maj7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H073",
    "teacherName": "렐러티브 메이저 스왑",
    "mood": "슬픔 속 따뜻한 위로",
    "original": "Am7–Dm7–G7–Cmaj7",
    "bars": [
      [
        "Am7"
      ],
      [
        "Dm7"
      ],
      [
        "G7"
      ],
      [
        "Cmaj7"
      ]
    ]
  },
  {
    "id": "H074",
    "teacherName": "서브도미넌트 하이퍼 확장",
    "mood": "팽창하는 세련된 긴장",
    "original": "Fmaj7–Bm7♭5–E7–Am7",
    "bars": [
      [
        "Fmaj7"
      ],
      [
        "Bm7♭5"
      ],
      [
        "E7"
      ],
      [
        "Am7"
      ]
    ]
  },
  {
    "id": "H075",
    "teacherName": "소피스티케이티드 마이너",
    "mood": "세련된 재즈 클럽",
    "original": "Am9–D9–Fmaj7–E7♯9",
    "bars": [
      [
        "Am9"
      ],
      [
        "D9"
      ],
      [
        "Fmaj7"
      ],
      [
        "E7♯9"
      ]
    ]
  },
  {
    "id": "H076",
    "teacherName": "모달 프리지안 하강",
    "mood": "어둡고 신화적인 웅장함",
    "original": "Am–B♭–Am",
    "bars": [
      [
        "Am"
      ],
      [
        "B♭"
      ],
      [
        "Am"
      ],
      [
        "Am"
      ]
    ]
  },
  {
    "id": "H077",
    "teacherName": "인셉션(한스 짐머) 루프",
    "mood": "압도적인 공간감과 꿈",
    "original": "Am–G–D–F",
    "bars": [
      [
        "Am"
      ],
      [
        "G"
      ],
      [
        "D"
      ],
      [
        "F"
      ]
    ]
  },
  {
    "id": "H078",
    "teacherName": "다크 나이트 텐션",
    "mood": "음산하고 숨 막히는 긴장",
    "original": "Am–A♭m–Am–B♭m",
    "bars": [
      [
        "Am"
      ],
      [
        "A♭m"
      ],
      [
        "Am"
      ],
      [
        "B♭m"
      ]
    ]
  },
  {
    "id": "H079",
    "teacherName": "릭 앤 모티 믹소리디안",
    "mood": "기발하고 우주적인 SF",
    "original": "C–B♭–F–C",
    "bars": [
      [
        "C"
      ],
      [
        "B♭"
      ],
      [
        "F"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H080",
    "teacherName": "도리안 모달 루프",
    "mood": "소울풀하고 쿨한 영웅",
    "original": "Dm7–G7–Dm7–G7",
    "bars": [
      [
        "Dm7"
      ],
      [
        "G7"
      ],
      [
        "Dm7"
      ],
      [
        "G7"
      ]
    ]
  },
  {
    "id": "H081",
    "teacherName": "리디안 우주 진행",
    "mood": "무중력 같은 신비로움",
    "original": "Cmaj7–D–Cmaj7–D",
    "bars": [
      [
        "Cmaj7"
      ],
      [
        "D"
      ],
      [
        "Cmaj7"
      ],
      [
        "D"
      ]
    ]
  },
  {
    "id": "H082",
    "teacherName": "힙합 칠홉 루프",
    "mood": "나른하고 빈티지한 Lo-fi",
    "original": "Dm9–G13–Cmaj9",
    "bars": [
      [
        "Dm9"
      ],
      [
        "G13"
      ],
      [
        "Cmaj9"
      ],
      [
        "Cmaj9"
      ]
    ]
  },
  {
    "id": "H083",
    "teacherName": "트랩 다크 루프",
    "mood": "묵직하고 위협적인 감각",
    "original": "Am–B♭–E–Am",
    "bars": [
      [
        "Am"
      ],
      [
        "B♭"
      ],
      [
        "E"
      ],
      [
        "Am"
      ]
    ]
  },
  {
    "id": "H084",
    "teacherName": "크로매틱 패싱 톤 진행",
    "mood": "만화처럼 미끄러지는 유쾌함",
    "original": "C–C♯–D–D♯–E",
    "bars": [
      [
        "C"
      ],
      [
        "C♯"
      ],
      [
        "D",
        "D♯"
      ],
      [
        "E"
      ]
    ]
  },
  {
    "id": "H085",
    "teacherName": "스타워즈 임페리얼 마치",
    "mood": "압도적이고 파괴적인 행진",
    "original": "Gm–E♭m–Gm",
    "bars": [
      [
        "Gm"
      ],
      [
        "E♭m"
      ],
      [
        "Gm"
      ],
      [
        "Gm"
      ]
    ]
  },
  {
    "id": "H086",
    "teacherName": "미스터리 도리안 4도",
    "mood": "숲과 고대 전설의 신비",
    "original": "Am–D–Am–D",
    "bars": [
      [
        "Am"
      ],
      [
        "D"
      ],
      [
        "Am"
      ],
      [
        "D"
      ]
    ]
  },
  {
    "id": "H087",
    "teacherName": "에일리언 증화음 진행",
    "mood": "기괴하고 낯선 공포",
    "original": "C–Caug–F♯–F♯aug",
    "bars": [
      [
        "C"
      ],
      [
        "Caug"
      ],
      [
        "F♯"
      ],
      [
        "F♯aug"
      ]
    ]
  },
  {
    "id": "H088",
    "teacherName": "역방향 기능진행",
    "mood": "시간이 거꾸로 가는 위화감",
    "original": "G–F–C",
    "bars": [
      [
        "G"
      ],
      [
        "F"
      ],
      [
        "C"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H089",
    "teacherName": "애니메이션 보스전 진행",
    "mood": "거대한 위기와 최종 결전",
    "original": "Am–F–B♭–E7",
    "bars": [
      [
        "Am"
      ],
      [
        "F"
      ],
      [
        "B♭"
      ],
      [
        "E7"
      ]
    ]
  },
  {
    "id": "H090",
    "teacherName": "모던 록 파워코드 진행",
    "mood": "거칠고 날것의 청춘 에너지",
    "original": "C5–G5–A5–F5",
    "bars": [
      [
        "C5"
      ],
      [
        "G5"
      ],
      [
        "A5"
      ],
      [
        "F5"
      ]
    ]
  },
  {
    "id": "H091",
    "teacherName": "네오 클래식 메탈 진행",
    "mood": "장엄하고 정교한 비장미",
    "original": "Am–E–F–E",
    "bars": [
      [
        "Am"
      ],
      [
        "E"
      ],
      [
        "F"
      ],
      [
        "E"
      ]
    ]
  },
  {
    "id": "H092",
    "teacherName": "사이버펑크 디스토피아",
    "mood": "차갑고 기계적인 미래 도시",
    "original": "Am–E♭–Dm–A♭",
    "bars": [
      [
        "Am"
      ],
      [
        "E♭"
      ],
      [
        "Dm"
      ],
      [
        "A♭"
      ]
    ]
  },
  {
    "id": "H093",
    "teacherName": "동양풍 오음계 기능 루프",
    "mood": "여백과 평화로운 자연",
    "original": "C–Dm–G–C",
    "bars": [
      [
        "C"
      ],
      [
        "Dm"
      ],
      [
        "G"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H094",
    "teacherName": "미니멀리즘 2코드 루프",
    "mood": "명상적이고 최면 같은 평온",
    "original": "Cmaj7–Dm7",
    "bars": [
      [
        "Cmaj7"
      ],
      [
        "Dm7"
      ],
      [
        "Cmaj7"
      ],
      [
        "Dm7"
      ]
    ]
  },
  {
    "id": "H095",
    "teacherName": "판타지 어드벤처 모달",
    "mood": "미지의 대륙과 모험의 시작",
    "original": "C–B♭–C",
    "bars": [
      [
        "C"
      ],
      [
        "B♭"
      ],
      [
        "C"
      ],
      [
        "C"
      ]
    ]
  },
  {
    "id": "H096",
    "teacherName": "고딕 호러 악마 종지",
    "mood": "고전적 공포와 기괴한 아름다움",
    "original": "Am–F♯dim–E–Am",
    "bars": [
      [
        "Am"
      ],
      [
        "F♯dim"
      ],
      [
        "E"
      ],
      [
        "Am"
      ]
    ]
  },
  {
    "id": "H097",
    "teacherName": "몽환적 드림팝 루프",
    "mood": "안개 같은 아득함",
    "original": "Cmaj7–Fmaj7–Em7–Fmaj7",
    "bars": [
      [
        "Cmaj7"
      ],
      [
        "Fmaj7"
      ],
      [
        "Em7"
      ],
      [
        "Fmaj7"
      ]
    ]
  },
  {
    "id": "H098",
    "teacherName": "레트로 신스웨이브 루프",
    "mood": "80년대 아케이드 감성",
    "original": "Am–G–F–G",
    "bars": [
      [
        "Am"
      ],
      [
        "G"
      ],
      [
        "F"
      ],
      [
        "G"
      ]
    ]
  },
  {
    "id": "H099",
    "teacherName": "할리우드 로맨스 종지",
    "mood": "눈부신 해피엔딩",
    "original": "Dm7–G7–C6",
    "bars": [
      [
        "Dm7"
      ],
      [
        "G7"
      ],
      [
        "C6"
      ],
      [
        "C6"
      ]
    ]
  },
  {
    "id": "H100",
    "teacherName": "무조성 지향 기능 붕괴",
    "mood": "극도의 혼란과 스릴러",
    "original": "C–F♯m–B♭m–E",
    "bars": [
      [
        "C"
      ],
      [
        "F♯m"
      ],
      [
        "B♭m"
      ],
      [
        "E"
      ]
    ]
  }
];
