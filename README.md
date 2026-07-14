# 마음멜로디

초등학교 4~6학년이 화성학 전문용어를 배우지 않아도, 어울리는 화음 이야기와 가락을 듣고 고르며 자기 노래를 완성하는 작곡 웹앱입니다.

## 현재 단계: M6 개인 악보함

- 초등학생의 말로 구성한 화음 이야기 100개와 실제 기능화성 진행 적용
- 2/4·3/4·4/4·6/8박자 및 8·12·16마디 곡 길이 선택
- 마디별 화음에 맞는 가락 12개 제시 및 미리 듣기
- 추천 가락으로 전체 곡 채우기, 음표 길이 수정·삭제, 박자 합계 검사
- 피아노를 포함한 서양 악기 6종과 한국 전통악기 4종 선택
- 무료 라이선스 SoundFont·공공누리 음원 기반 실제 악기 소리 재생
- 마디별 가사, 곡 제목, 작곡가 입력
- 완성 악보를 A4 PDF로 저장(페이지당 8마디)
- 공유 링크로 곡을 전달하고, 받은 곡을 리메이크
- 리메이크 악보에는 최초 원작자를 수정할 수 없는 정보로 보존
- 작업 변경 후 1초 안에 브라우저에 자동 저장하고 새로고침 시 이어서 작업
- 같은 공유 링크의 리메이크 초안을 복원하면서 최초 원작자 정보를 그대로 보존
- Firebase Authentication 이메일·비밀번호 회원가입, Google 로그인과 사용자별 Firestore 악보함
- 클라우드 악보 저장·업데이트·사본 저장·불러오기·삭제

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

## 검증

```bash
npm test
npm run build
node scripts/verify-m4.mjs
```

`verify-m4.mjs`는 로컬 서버가 실행 중일 때 Edge의 Chromium 엔진으로 A4 PDF 다운로드와 8·16마디 페이지 분할을 확인합니다.

제품 요구사항은 [PRD.md](./PRD.md), 음원 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)를 참고합니다.
