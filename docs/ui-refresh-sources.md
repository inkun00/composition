# 마음멜로디 UI 디자인 소스

2026-10-27, [코드잇소](https://codeitso.yoorrard.workers.dev/)에서 앱에 맞는 소스를 조사하고 공식 출처를 확인했다.

## 적용한 소스

| 소스 | 코드잇소 | 원본 | 반영 내용 |
| --- | --- | --- | --- |
| SUITE Variable v2 | [한글 폰트](https://codeitso.yoorrard.workers.dev/item?id=korean-fonts%3Asuite) | [sun-typeface/SUITE](https://github.com/sun-typeface/SUITE) | 한글 제목과 UI에 원·직선 형태의 가변 글꼴 적용. OFL-1.1 원본 WOFF2를 수정 없이 로컬 포함. |
| Radix Colors | [색 체계](https://codeitso.yoorrard.workers.dev/item?id=color-systems%3Aradix) | [radix-ui/colors](https://github.com/radix-ui/colors) | teal·slate·amber 팔레트의 배경/경계/텍스트 단계 사용. 주요 버튼은 흰 글자 대비를 위해 더 짙은 청록색으로 조정. MIT. |
| shadcn Button / Card | [버튼](https://codeitso.yoorrard.workers.dev/item?id=shadcn%3Abutton), [카드](https://codeitso.yoorrard.workers.dev/item?id=shadcn%3Acard) | [공식 컴포넌트 문서](https://ui.shadcn.com/docs/components/button) | 버튼·카드의 경계, 여백, 포커스 표현을 시각적 참고로 사용. 코드 복제·컴포넌트 교체·패키지 추가 없음. |

Lucide와 Hero Patterns도 조사했지만 기존 음악 그림 아이콘과 일러스트를 유지하기 위해 추가 도입하지 않았다.

## 디자인 방향

- 초등학생이 사용하는 음악 작업실: 기존 음악실 일러스트가 주인공이고 UI는 차분하게 받쳐 준다.
- 주요 색: 청록 `#0d6b60`, 짙은 청록 `#0d3d38`, 보라 `#6556b7`, 노랑 `#ffc53d`, 바탕 `#f3f8f7`, 본문 `#1c2024`.
- SUITE의 500~900 굵기로 본문·버튼·제목 위계를 만든다. 악보 및 영상 렌더링 글꼴은 별도 책임을 유지한다.
- 기존 화면 순서와 기능 배치를 유지한다. 큰 작업 패널 18px, 선택 카드 12px, 버튼 10px의 모서리 반경을 적용한다.
- 작곡/듣기는 청록, 가락 후보는 보라, 연습 단계는 기존 리듬/가락/저장 색 구분을 유지한다.
- 영상 스튜디오는 어두운 작업 환경을 유지하고 청록 강조·패널 경계만 다듬는다.
- 동작은 기존 버튼의 가벼운 색 변화로 한정하고 모션 감소 설정에서는 새 전환을 없앤다.

## 변경 경계와 구성

`src/main.tsx`에는 CSS import만 추가했다. 상태, 이벤트 처리, 작곡/오디오/저장/공유/내보내기 로직과 의존성은 변경하지 않았다.

- `src/styles/studio-refresh-foundation.css`: 폰트, 색 토큰, 앱 바, 공통 UI 표면.
- `src/styles/studio-refresh-opening.css`: 기존 시작 화면의 글꼴·버튼·모바일 배치.
- `src/styles/studio-refresh-composer.css`: 작곡 패널과 설정·후보 카드의 시각 스타일.
- `src/styles/studio-refresh-workspaces.css`: 연습과 영상 스튜디오의 시각 스타일.

SUITE 원본: `https://cdn.jsdelivr.net/gh/sun-typeface/SUITE@2/fonts/variable/woff2/SUITE-Variable.woff2`.
폰트 파일은 `src/assets/fonts/`에 보관하며 Vite가 로컬 자산 URL을 생성한다.
SUITE와 Radix 라이선스 원문은 `public/ui-design-licenses.txt`에 함께 보관한다.
