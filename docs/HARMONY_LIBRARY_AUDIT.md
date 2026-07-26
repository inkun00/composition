# 화음 이야기 100개 다양성 점검

## 결론

기존 목록은 문자열 기준으로는 100개가 모두 달랐지만, 음악적 골격으로 보면 같은 진행의 회전형, 확장음·보이싱 변형, 같은 목적지로 가는 전문 화음 변형이 여러 자리를 차지했다. 특히 `I-V-vi-IV` 계열, `ii-V-I` 확장형, 증6도 화음 세 종류의 비중이 컸다.

초등학교 4학년이 “주제와 느낌이 다른 화음”을 골라 작곡하는 목적에 맞춰 10개를 교체했다. 전문 화성을 없앤 것이 아니라, 소리 차이가 뚜렷한 대표 하나는 남기고 쉬운 기능화성·두왑·블루스·플라갈·크로매틱 미디언트의 빈자리를 채웠다.

## 조사 자료를 데이터로 바꾼 기준

- 기능화성: 으뜸-버금딸림-딸림의 방향, 정격종지와 반종지를 서로 다른 이야기 끝으로 분류한다.
- 팝 스키마: 같은 네 화음의 시작점만 바꾼 회전형은 하나의 스키마 계열로 묶는다.
- 순차진행·성부진행: 5도권, 하행 베이스, 페달, 전위처럼 실제 음의 이동이 다르면 별도 항목으로 유지한다.
- 선법·블루스·오음계: 장·단조 기능만으로 표현하기 어려운 장난기, 개방감, 록의 추진력을 보완한다.
- 차용·반음계: 단조 버금딸림, 나폴리, 크로매틱 미디언트처럼 색채와 해결 방식이 다른 것은 구분한다.
- 재즈 확장: 7·9·13음만 추가된 같은 `ii-V-I`는 핵심 진행 하나와 실제 기능이 다른 대리화음으로 정리한다.
- 실험 화성: 초등학생에게 설명 가능한 소리 이미지가 있고 재생 차이가 명확할 때 유지한다.

위 기준과 출처, 10개 교체 기록은 코드에서 읽을 수 있는 `harmonyAuditData.ts`에 구조화했다.

## 빼고 교체한 10개

| ID | 뺀 진행 | 중복 판정 이유 | 새로 넣은 진행 |
|---|---|---|---|
| H009 | 이탈리아 증6도 · It+6-G | 증6도 세 종류가 같은 딸림음으로 해결 | C-Em-F-G · 3도 화음이 여는 반종지 |
| H010 | 프랑스 증6도 · Fr+6-G | 증6도 세 종류가 같은 딸림음으로 해결 | C-Dm-F-G · 버금딸림 두 겹 반종지 |
| H027 | Fmaj7-G-Em7-Am7 | H028과 근음·화음 성질이 같음 | C-Am-Dm-G · 다이어토닉 두왑 변형 |
| H038 | Am-F-C-G | H026의 싱어송라이터 스키마 회전형 | C-E♭-F-C · 블루스 내림3도 색채 |
| H042 | 로열 로드 마이너 변형 | H054와 기능과 진행 계열이 겹침 | C-E-F-Fm · 장3도 상승과 단조 버금딸림 |
| H073 | Am7-Dm7-G7-Cmaj7 | H048과 단조-관계장조 귀환 골격이 같음 | Cmaj7-Fmaj7-Dm7-G7 · 버금딸림 기능 확장 |
| H080 | Dm7-G7 뱀프 | H086의 도리안 i-IV를 조옮김한 형태 | C-A♭-E-C · 크로매틱 미디언트 왕복 |
| H082 | Dm9-G13-Cmaj9 | H051 ii-V-I의 확장음 변형 | Am-G-Dm-Am · 단조 플라갈 귀환 |
| H090 | C5-G5-A5-F5 | H026과 근음이 같고 3음을 뺀 보이싱 차이 | C-E♭-B♭-F · 확장 플라갈 모험 |
| H099 | Dm7-G7-C6 | H051 ii-V-I의 종지 화음 변형 | Am-C-Dm-E · 단조 대조형 정격 귀환 |

## 오류도 함께 수정

기존 H008은 `Dm-D♭-C`를 나폴리 화음으로 적었지만 D단조의 나폴리 화음은 `E♭`가 맞다. `Dm-E♭-A7-Dm`으로 고쳐 `i-♭II-V-i`의 실제 해결을 들을 수 있게 했다.

## 비슷해 보여도 유지한 항목

- H001·H012·H018: 근음 윤곽은 비슷하지만 완전정격, 전위 종지, 페달 포인트의 성부진행 차이를 들려준다.
- H055·H056: 반음 접근과 트라이톤 대리는 베이스 이동과 해결 감각이 다르다.
- H061·H062: 5도 하행과 콜트레인 변화는 근음 이동 규칙과 긴장 속도가 다르다.
- H011: 증6도 화음의 대표 색채를 남기되 세 변형을 각각 별도 항목으로 세지 않는다.

## 참고 자료

- [Open Music Theory: Harmony, Cadences, and Phrase Endings](https://viva.pressbooks.pub/openmusictheory/chapter/intro-to-harmony/)
- [Open Music Theory: Four-Chord Schemas](https://viva.pressbooks.pub/openmusictheory/chapter/4-chord-schemas/)
- [Open Music Theory: Modal Schemas](https://viva.pressbooks.pub/openmusictheory/chapter/modal-schemas/)
- [Open Music Theory: Diatonic Sequences](https://viva.pressbooks.pub/openmusictheory/chapter/diatonic-sequences/)
- [Open Music Theory: Blues Harmony](https://viva.pressbooks.pub/openmusictheory/chapter/blues-harmony/)
- [Open Music Theory: Pentatonic Harmony](https://viva.pressbooks.pub/openmusictheory/chapter/pentatonic-harmony/)
- [De Clercq & Temperley: A Corpus Analysis of Rock Harmony](https://rockcorpus.midside.com/2011_paper/declercq_temperley_2011.pdf)
