# Third-party notices

## homr

- 용도: 사용자의 컴퓨터에서 악보 사진을 MusicXML로 인식
- 제공: Christoph Liebhaeuser 및 homr 기여자
- 라이선스: GNU Affero General Public License v3.0
- 출처: https://github.com/liebharc/homr
- 통합 방식: 필요할 때 `uvx`로 설치·실행하며 저장소에 homr 코드나 모델을 포함하지 않음

## uv

- 용도: homr용 Python 3.11 실행환경 준비
- 제공: Astral Software
- 라이선스: Apache License 2.0 또는 MIT License
- 출처: https://github.com/astral-sh/uv

## FluidR3 GM SoundFont

- 용도: 가락·반주 악기의 실제 샘플 재생
- 제공: MIDI.js Soundfonts 프로젝트의 FluidR3 GM 렌더 음원
- 라이선스: Creative Commons Attribution 3.0 US (상류 저장소 명시 기준)
- 출처 및 원본 고지: https://github.com/gleitz/midi-js-soundfonts/blob/gh-pages/README.md
- 실제 음원 CDN: https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/
- 라이선스 링크: https://creativecommons.org/licenses/by/3.0/us/
- 변경사항: 클라리넷·리코더·플루트·바이올린·첼로의 디코딩된 샘플 루프 끝 2ms를 실행 중 부드럽게 연결

샘플 음원의 라이선스는 MIT인 smplr 재생 코드와 구별합니다. smplr의 Soundfont API가 사용하는
Goldst 루프 메타데이터(`https://goldst.dev/midi-js-soundfonts/FluidR3_GM/`)는 외부에서 로딩하며
저장소나 배포물에 재배포하지 않습니다. 해당 데이터의 별도 라이선스 명시는 확인하지 못했습니다.

## 국립국악원 국악기 디지털 음원

- 용도: 가야금, 대금, 해금, 피리 음높이 샘플
- 원저작자: 국립국악원
- 라이선스: 공공누리 제1유형(출처표시)
- 출처: https://www.gugak.go.kr/digitaleum/front/monotone/list.do
- 변경사항: 기본음계 WAV에서 음높이 구간 추출, 모노 변환, 24 kHz 리샘플링, 음량 정규화 및 페이드 적용

공공누리 제1유형에 따라 출처를 표시하면 상업적·비상업적 이용과 변경이 가능합니다.


## Automatic accompaniment: Tonal and Scribbletune

- Tonal: @tonaljs/voicing 5.1.2, @tonaljs/note 4.12.1 and supporting modules. Used to enumerate chord inversions in instrument ranges, with an application-supplied dictionary containing only the student's chord tones.
- Scribbletune 5.5.5: its clip pattern grammar generates note durations, holds and rests for accompaniment phrases. Playback uses the application's shared audio scheduler.
- Licenses: MIT. The installed package license texts, including copyright notices, are reproduced below and are shipped publicly at `/third-party-accompaniment-licenses.txt`.
- Scribbletune's published LICENSE.txt contains `[year] [fullname]` placeholders. They are preserved exactly; the package author is Walmik Deshpande.

### Tonal voicing modules (@tonaljs/voicing 5.1.2, voice-leading and voicing-dictionary)

Source: https://github.com/tonaljs/tonal

```text
The MIT License (MIT)

Copyright (c) 2020 felixroos

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Tonal note and supporting music theory modules (@tonaljs/note 4.12.1 and transitive dependencies)

Source: https://github.com/tonaljs/tonal

```text
The MIT License (MIT)

Copyright (c) 2015 danigb

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Scribbletune 5.5.5 (author: Walmik Deshpande; upstream license placeholders preserved verbatim)

Source: https://github.com/scribbletune/scribbletune

```text
The MIT License (MIT)

Copyright (c) [year] [fullname]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### harmonics 1.1.2 (Scribbletune dependency)

Source: https://github.com/scribbletune/harmonics

```text
MIT License

Copyright (c) 2021 Scribbletune

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### @scribbletune/midi 1.0.0 (installed Scribbletune dependency)

Source: https://github.com/scribbletune/midi

```text
MIT License

Copyright (c) 2026 Scribbletune

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Music video drawing and MP4 export

- perfect-freehand 1.2.3 (Steve Ruiz / Stephen Ruiz Ltd): pressure-sensitive brush outlines in the scene painter and exported video. MIT License. Source: https://github.com/steveruizok/perfect-freehand. The installed package's complete copyright and license text is reproduced below and in `/third-party-music-video-licenses.txt`.
- Mediabunny 1.61.3 (Vanilagy and contributors): the existing browser MP4 encoding path is also used to combine music-video Canvas frames and song audio. Mozilla Public License 2.0. Source: https://github.com/Vanilagy/mediabunny. The complete installed license is shipped at `/third-party-music-video-licenses.txt`. This app imports the package without modifying its source files. Corresponding source is included in the published npm package: https://registry.npmjs.org/mediabunny/-/mediabunny-1.61.3.tgz.
- Paper.js 0.12.18 (Jürg Lehni and Jonathan Puckey): vector paths used for the browser's authored partial drawing deformation. MIT License. Source: https://github.com/paperjs/paper.js. The installed copyright and license text is preserved below and in `/third-party-music-video-licenses.txt`.
- The app's lyric timing, thirty selectable whole-scene motion graphics, stroke-order drawing playback, and BPM-driven animation are application code. Legacy partial drawing animations remain readable. No generated video service or third-party artwork is included.
- Anime.js, tsParticles and canvas-confetti are research references for entrance, sequencing and decorative effects. Their packages and source code are not included in this implementation.
- Procreate Dreams (https://help.procreate.com/dreams/handbook/interface-and-gestures/interface) and DaVinci Resolve (https://www.blackmagicdesign.com/products/davinciresolve/edit) are visual references for the canvas, drawing tools, inspector, and scene timeline. Google Song Maker was a reference for the earlier editor grid and palette. No source code or assets from these products are copied into the application. The editor uses CSS and SVG; no generated bitmap UI assets are included. No AI model, inference runtime, model-weight download, or external inference service is included.

### perfect-freehand 1.2.3

```text
MIT License

Copyright (c) 2021 Stephen Ruiz Ltd

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Paper.js 0.12.18

- 용도: 대상에 지정한 선의 경로를 준비하고 선 일부의 형태를 변형하는 브라우저 동작 렌더링. 이미지 인식이나 AI 모델은 포함하지 않음.
- 출처: https://github.com/paperjs/paper.js
- 라이선스: MIT. 설치 패키지의 원문을 아래와 /third-party-music-video-licenses.txt 에 보존하며 패키지 소스는 수정하지 않음.

~~~text
Copyright (c) 2011 - 2020, Jürg Lehni & Jonathan Puckey
http://juerglehni.com/ & https://puckey.studio/
All rights reserved.

The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

~~~
