# 앱 공통 생성 이미지

뮤직비디오 스튜디오 밖의 시작·작곡·리듬·가락·녹음·저장·계정 화면에 사용하는 이미지다. 기본 제공 **image_gen** 도구로 자산마다 개별 생성했다. CLI/API 경로는 사용하지 않았다.

- 새 이미지 49종: 공통 조작 38종, 빠르기·리듬 6종, 주요 활동 일러스트 5종.
- 배포 파일: `public/app-images/v1/*.webp`
- PNG 원본: `artifacts/app-imagegen-v1/originals/*.png`
- 프롬프트: [공통 조작 A](control-a-prompts.json), [공통 조작 B](control-b-prompts.json), [활동·빠르기·리듬](illustration-prompts.json).
- 세라믹·종이 소재의 입체 이미지와 periwinkle·ivory·coral·teal 색을 사용한다. 공통 조작 중 재생·저장·닫기 등은 이미 생성한 `public/studio-images/v1/` 자산을 함께 사용한다.
- 투명 배경을 유지하고 크기 조절과 WebP 인코딩만 수행한다. 현재 표시 크기를 기준으로 공통 조작은 144px, 주요 일러스트는 384px로 최적화한다. 크기가 늘어나는 일부 공통 조작은 기존 최대 192px 파일을 유지한다.

`AppArtwork.tsx`가 자산 경로와 포터블 파일 경로를 처리한다. `AppArtworkIcons.tsx`는 기존 버튼의 크기·이벤트·접근성 속성을 유지하며 생성 이미지를 연결한다. 버튼의 이름·텍스트·선택 상태는 HTML에서 제공한다. 실제 음표·악보·QR·그림 데이터는 원래 렌더러를 유지한다.

시작 화면·활동 선택 카드와 메인 작곡 화면의 아이들 캐릭터는 기존 `public/illustrations/` 원본을 사용한다. 메인 화면은 `ComposerChildArtwork.tsx`로 화음·박자·악기·반주·효과음·완성 안내·저장·제작 팝업의 원래 캐릭터를 표시하며, 입력 항목과 겹치지 않도록 일반 문서 흐름에 배치한다. 새 공통 버튼 이미지는 유지한다. 연습 화면에는 활동 일러스트를 배치한다. 특정 악기의 이미지가 없는 경우 고유 악기 표기를 유지한다.

`python scripts/optimize-runtime-images.py`는 보관된 PNG에서 최적화 후보와 화질·알파·해시 보고서를 `artifacts/image-optimization-v1/`에 만든다. 검토 후 `--apply`로 더 작은 후보만 적용하며, 적용 전 WebP도 같은 폴더에 보존한다. 아이들 그림을 포함한 기존 `public/illustrations/` 파일은 변경하지 않는다.
