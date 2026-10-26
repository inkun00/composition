# 스튜디오 생성 이미지

그림판과 뮤직비디오 제작 화면에 사용하는 래스터 이미지다. 기본 제공 `image_gen` 도구로 각각 생성했다. API/CLI 경로는 사용하지 않았다.

- 공통 조작 이미지 27종과 모션 효과 장면 이미지 30종을 사용한다.
- 배포용 파일: `public/studio-images/v1/*.webp`
- 생성된 PNG 원본: `artifacts/studio-imagegen-v1/originals/*.png`
- 스타일: 차콜 편집 화면에 어울리는 periwinkle·ivory·coral 색의 종이·세라믹 입체 일러스트. 모션 효과는 같은 종이 새를 각 효과에 맞는 모습으로 표현한다.
- 투명 배경을 생성한 뒤 알파를 유지하며 표시 크기에 맞게 리샘플·WebP 인코딩한다. 공통 조작은 최대 144px, 실제 94~116px로 표시하는 모션 카드 그림은 최대 256px로 저장한다. 원본 그림을 다시 그리거나 수정하지 않는다.
- 버튼의 이름·상태·단축키는 HTML로 제공하고 이미지는 장식용 `alt=""`로 표시한다. 사용자 그림과 선택 경계·색·굵기 견본은 기존 데이터 표현을 사용한다.

정확한 생성 프롬프트와 생성 경로는 아래 파일에 기록한다.

- [스튜디오 대표 이미지 프롬프트](video-prompt.txt)
- [공통 조작 이미지 프롬프트](control-prompts.json)
- [공통 조작 이미지 추가 프롬프트](root-prompts.json)
- [재생·설정 조작 이미지 프롬프트](control-b-prompts.json)
- [모션 장면 A 프롬프트](motion-a-prompts.json)
- [모션 장면 B 프롬프트](motion-b-prompts.json)

이미지는 `StudioArtwork.tsx`에서 이름별로 불러온다. 모션 카드 이미지는 지연 로딩하며 고정 크기를 지정해 로드 전후 레이아웃 이동을 막는다. 사용자 그림과 MP4에 생성 UI 이미지를 합성하지 않는다.

기존 파일의 일괄 최적화는 `scripts/optimize-runtime-images.py`를 사용한다. 보관된 PNG 원본을 다시 인코딩하며 투명도와 밝은·어두운 배경의 화질을 검사하고, 용량이 줄어드는 후보만 `--apply`로 반영한다. 변경 전 파일과 전후 보고서는 `artifacts/image-optimization-v1/`에 보존한다.
