# 마음멜로디 UI 구조 참고 자료

확인일: 2026-10-27. 아래 공식 사이트를 Chrome에서 직접 열어 기본 화면과 설정·탐색 화면을 관찰했다. 이전 [디자인 소스 조사](ui-refresh-sources.md)가 색·글꼴·표면 표현을 다뤘다면, 이번에는 편집에 집중할 수 있는 화면 구조를 참고한다.

## 직접 관찰한 공식 출처

| 출처 | 직접 관찰한 구조 | 앱에 참고할 원칙 |
| --- | --- | --- |
| [Chrome Music Lab — Song Maker](https://musiclab.chromeexperiments.com/Song-Maker/) | 음표 격자가 화면 대부분을 차지한다. 재생·악기·빠르기·설정·되돌리기·저장은 하단에 모여 있고, 길이·박자·음계·음역은 Settings에서 연다. | 편집 영역을 우선하고 공통 재생 제어는 일정한 위치에 둔다. 상세 설정은 필요할 때 펼친다. |
| [Ableton Learning Music](https://learningmusic.ableton.com/) | 한 활동의 설명과 조작 영역을 중심에 보여준다. 전체 주제 탐색은 접힌 Chapters에서 열며, 첫 활동은 Drums·Bass·Chords·Melodies로 구획한다. | 현재 작업과 전체 탐색을 분리하고, 관련 조작을 같은 작업 영역에 묶는다. |

관찰 캡처는 [references 폴더](../artifacts/structure-refresh/references/)에 보관한다: `chrome-song-maker-1440.png`, `chrome-song-maker-settings-1440.png`, `ableton-learning-music-1440.png`, `ableton-learning-music-chapters-1440.png`.

## 앱에 적용할 구조

- **가락 만들기 / 반주·가사 / 저장·발표**의 세 작업 탭으로 관련 화면을 묶는다. 이 세 탭은 참고 사이트의 구성을 복제한 것이 아니라 마음멜로디의 기능에 맞춘 자체 해석이다.
- 탭을 바꾸어도 공통 재생·멈춤 제어의 위치를 유지한다.
- 간단한 마디 선택과 현재 마디에 집중하는 편집 영역을 먼저 보여준다.
- 전체 악보와 추가 도구는 명확한 이름의 펼치기 영역에 둔다. 기능은 제거하지 않는다.
- 가락 후보는 우선 3개를 보여주고, **더 보기**로 나머지 후보에 접근한다. 후보 생성·선택·미리듣기 기능은 유지한다.

현재 색 체계와 SUITE 글꼴은 유지한다. 참고 사이트의 코드를 복사하거나 새 패키지를 추가하지 않으며, 작곡·재생·저장 기능을 유지하는 범위에서 탐색과 표시 구조를 정리한다.
