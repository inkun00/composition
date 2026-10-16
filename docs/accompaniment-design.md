# 자동 반주 설계와 공개 자료

학생이 작성한 가락과 화음을 유지하면서 선택 악기를 하나의 합주로 계획한다. 악기별로 독립 패턴을 반복하는 대신 전체 악기 조합, 가락의 움직임과 쉼, 앞뒤 마디, 네 마디 구획을 함께 사용한다.

## 음악적 기준

- **역할과 음역 분담:** 주선율·보조선율·화성반주·베이스를 구별한다. 악기의 적정 음역과 음색에 맞춰 배분한다. UMN 교재의 예시도 클라리넷의 중저음 보조선율과 플루트의 높은 선율을 구분한다. [Techniques of Orchestration](https://open.lib.umn.edu/musiccomposition/chapter/type-i-orchestration/)
- **가락과의 대화:** 주선율이 빠르게 움직일 때 보조선율은 긴 음을 유지하고, 주선율이 쉬거나 머물 때 응답을 움직인다. 쉼과 호흡을 포함한 연결된 구절을 만든다. [Berklee: Five Levels of Improvisation](https://www.berklee.edu/berklee-today/summer-2011/five-levels-of-improvisation)
- **자연스러운 성부 연결:** 선율과 베이스의 관계를 먼저 고려하고, 화음 내부는 공통음 유지와 작은 이동을 우선한다. 엄격한 고전 성부 규칙 전체를 모든 대중음악 장르에 강제하지 않는다. [Open Music Theory: Melodic keyboard-style voice-leading](https://openmusictheory.github.io/melodicKeyboardStyle.html)

이 기준을 구현 규칙으로 번역한 것이며, 교재의 악보나 녹음은 앱에 복사하지 않는다. 악기 이름만 바꾸는 방식이나 음수 증가만으로 전문 편곡의 완성도를 보장할 수는 없다.

## 실제로 통합한 오픈 소스

### Tonal

- 출처: [tonaljs/tonal](https://github.com/tonaljs/tonal)
- 설치 버전: `@tonaljs/voicing` **5.1.2**, `@tonaljs/note` **4.12.1**. 최신 GitHub 소스의 버전과 설치 버전은 다를 수 있으며, 배포 버전은 `package-lock.json`을 기준으로 한다.
- 통합 위치: `src/music/accompanimentVoicing.ts`.
- 사용 API: `Voicing.search`, `Note.distance`, `Note.fromMidi`, `Note.midi`, `Note.pitchClass`.
- 적용 범위: 실제 학생 화음 구성음으로 닫힌 전위와 drop-two 전위의 간격 사전을 만들고, 악기의 음역 안에 가능한 후보를 Tonal로 생성한다. 앱의 성부 이동·가락 충돌 평가가 후보를 선택한다.
- 지정하지 않은 화음 확장을 피하기 위해 Tonal 기본 재즈 사전을 사용하지 않는다. 앱의 로마숫자·증6화음·슬래시 코드 해석을 유지한다. 다섯 음 이상의 화음은 기존 네 성부 정책에 맞춰 3음·7음·확장음을 우선한다.
- 기본 `VoiceLeading.topNoteDiff`는 최상성부만 비교하므로 전체 합주 평가를 대체하지 않는다. [공식 API 소스](https://github.com/tonaljs/tonal/blob/main/packages/voicing/index.ts), [공식 사전](https://github.com/tonaljs/tonal/blob/main/packages/voicing-dictionary/data.ts)

### Scribbletune

- 출처: [scribbletune/scribbletune](https://github.com/scribbletune/scribbletune)
- 설치 버전: **5.5.5**.
- 통합 위치: `src/music/accompanimentPhrase.ts`.
- 사용 API: `clip`의 `x`(음 시작), `_`(유지), `-`(쉼) 패턴으로 구절의 음 길이와 호흡을 생성한다. 악기별 역할과 스타일에 따른 패턴을 실제 마디 길이로 환산한다.
- 학생 선율 분석, 음높이 선택, 악기 간 충돌 조정은 앱에서 수행한다. Scribbletune 자체를 학생 가락에 조건화된 완성형 AI 반주 모델로 설명하지 않는다. 오디오는 기존 공통 샘플 재생 경로로 전달한다.

두 프로젝트는 MIT 라이선스다. 설치 패키지의 원문과 의존성 고지는 `THIRD_PARTY_NOTICES.md` 및 배포되는 `public/third-party-accompaniment-licenses.txt`에 보존한다.

## 조사했으나 이번 실행 엔진으로 채택하지 않은 프로젝트

| 프로젝트 | 장점 | 현재 앱과의 차이 |
| --- | --- | --- |
| [AccoMontage2](https://github.com/billyblu2000/AccoMontage2) | 선율에서 전체 화성과 피아노 텍스처를 생성하는 연구 시스템. 코드 MIT. | Python/torch와 별도 데이터 필요. 문서상 4/4 및 4·8마디 구획만 지원. 임의의 선택 악기 합주용 엔진은 아님. 코드와 외부 데이터의 이용 조건도 구분해야 함. |
| [JJazzLab](https://github.com/jjazzboss/JJazzLab) | 화음·스타일 기반 다악기 반주 생성. LGPL 2.1. | Java 데스크톱 중심. Toolkit도 Java 실행환경을 필요로 함. 현재 브라우저 실행 구조에 직접 연결하기 어려움. |
| [Magenta.js](https://github.com/magenta/magenta-js) | 브라우저에서 MusicVAE와 화음 조건 생성 모델 실행. Apache 2.0. | TensorFlow.js·별도 학습 체크포인트 필요. 기존 trio 모델의 선율·베이스·드럼 구성과 선택한 관악기 합주 요구는 다름. |

## 검증 관점

단순히 모든 트랙의 RMS가 0보다 큰지만 확인하면 마디 끝의 한 음도 정상으로 판정된다. 따라서 실제 샘플 음량 확인과 함께 화음 구성음 보존, 악기 음역, 성부 이동, 관악기 구절의 길이·쉼·진행, 서로 다른 악기의 역할, 학생 가락 변화에 대한 반주 변화, 재생·녹음·내보내기의 공통 악보 사용을 검증한다.

`verify-ensemble-arrangement.mjs`는 8마디 피아노·베이스·클라리넷·리코더 편성의 실제 합주와 단독 MP3, 음표 진행, 화음과 음역, 동일 음높이·진입 중복률을 기록한다. 이는 통제된 예제의 검증이며 모든 학생 곡의 청감상 완성도를 보증하지 않는다.

지속음은 [smplr의 공개 Soundfont API](https://github.com/danigb/smplr#soundfont-sustained-notes)를 사용한다. 실제 샘플을 확인한 클라리넷·리코더·플루트·바이올린·첼로만 루프를 켜고 경계의 2ms를 부드럽게 연결한다. `verify-sample-sustain.mjs`는 G4 한 음의 6초 렌더를 44.1/48kHz에서 확인한다. 다른 악기나 전 음역까지 검증했다고 해석하지 않는다.
