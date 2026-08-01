# 마음멜로디

초등학교 4~6학년이 화성학 전문용어를 배우지 않아도, 어울리는 화음 이야기와 가락을 듣고 고르며 자기 노래를 완성하는 작곡 웹앱입니다.

## 현재 단계: M6 개인 악보함

- 초등학생의 말로 구성한 화음 이야기 100개와 실제 기능화성 진행 적용
- 2/4·3/4·4/4·6/8박자 및 8·12·16·20·24·28·32마디 곡 길이 선택
- 마디별 화음에 맞는 가락 30개와 추천 가락 6개 제시 및 미리 듣기
- 일부 가락에는 화음 음 사이를 짧게 스쳤다가 돌아오는 음을 넣어 다양한 흐름 경험
- 추천 가락으로 전체 곡 채우기, 음표 길이 수정·삭제, 박자 합계 검사
- 피아노를 포함한 SoundFont 악기 128종에서 가락 악기를 선택하고, 검증된 반주 악기 34종으로 최대 4트랙 편성
- 조용조용·포근한 피아노·반짝 K-POP·통통 동요 등 어린이용 10가지 반주 느낌
- 동요·K-POP·애니메이션 OST·오페라·뮤지컬 장르 반주와 7가지 세부 연주 방식
- 무료 라이선스 SoundFont와 공공누리 음원 기반 악기·효과음 재생
- 카라오케 악보를 보며 녹음하거나, 녹음 없이 반주와 메인 가락을 함께 듣는 노래 연습 모드
- 마디별 가사, 곡 제목, 작곡가 입력
- 완성 악보를 A4 PDF로 저장(페이지당 8마디)
- 공유 링크로 곡을 전달하고, 받은 곡을 리메이크
- 리메이크 악보에는 최초 원작자를 수정할 수 없는 정보로 보존
- 작업 변경 후 1초 안에 브라우저에 자동 저장하고 새로고침 시 이어서 작업
- 같은 공유 링크의 리메이크 초안을 복원하면서 최초 원작자 정보를 그대로 보존
- Firebase Authentication 이메일·비밀번호 회원가입, Google 로그인과 사용자별 Firestore 악보함
- 클라우드 악보 저장·업데이트·사본 저장·불러오기·삭제
- 인쇄된 단선율 악보 이미지·PDF와 MusicXML/MXL을 검수한 뒤 편곡 프로젝트로 가져오기

## 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://127.0.0.1:4173](http://127.0.0.1:4173)을 엽니다.

## Firebase 연결

1. Firebase Console에서 프로젝트와 Web App을 만듭니다.
2. Authentication의 로그인 제공업체에서 이메일/비밀번호와 Google을 활성화합니다.
3. Cloud Firestore 데이터베이스를 만든 뒤 `firestore.rules`를 배포합니다.
4. `.env.example`을 참고해 로컬 `.env.local`과 Vercel 환경변수를 등록합니다.

```bash
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only firestore:rules
```

Firebase 환경변수가 없는 경우 기존 로컬 자동 저장은 그대로 작동하며, 내 악보함에는 연결 안내가 표시됩니다.

## 악보 이미지 인식

MusicXML과 MXL은 브라우저에서 바로 읽습니다. PNG·JPG·WEBP 악보 이미지는 로컬 Vite 서버가
[homr](https://github.com/liebharc/homr)를 실행해 MusicXML로 변환하고, 기존 마디별 검수 화면으로 자동 연결합니다.
이미지는 외부 서버나 유료 API로 전송하지 않습니다.

이미지를 처음 고르면 homr 준비 팝업이 열립니다. `무료로 자동 준비하기`를 누르면 Python의 사용자 영역에
`uv`를 설치하며, 첫 인식 시 `uvx --python 3.11 homr`가 Python 3.11과 homr 실행환경을 자동으로 준비합니다.
처음 한 번은 패키지와 인식 모델 다운로드로 몇 분 걸릴 수 있습니다. 이후에는 같은 컴퓨터의 캐시를 재사용합니다.
homr는 이미지 입력용이므로 PDF는 원하는 페이지를 PNG나 JPG로 저장한 뒤 가져오세요.

이 통합은 `npm run dev`로 연 로컬 앱에서 동작합니다. 정적 배포 사이트에는 로컬 프로그램 실행 권한이 없으므로
이미지 인식 대신 MusicXML/MXL 직접 가져오기를 사용해야 합니다.

## 검증

```bash
npm test
npm run build
node scripts/verify-m4.mjs
```

`verify-m4.mjs`는 로컬 서버가 실행 중일 때 Edge의 Chromium 엔진으로 A4 PDF 다운로드와 8·16마디 페이지 분할을 확인합니다.

제품 요구사항은 [PRD.md](./PRD.md), 음원 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)를 참고합니다.
