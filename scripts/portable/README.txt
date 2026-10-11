마음멜로디 제출용 패키지

1. ZIP을 원하는 위치에 모두 압축 해제합니다.
2. index.html을 Edge 또는 Chrome에서 열면 앱이 실행됩니다.
3. 인터넷에 연결된 상태에서 사용합니다. 기존 Firebase 데이터베이스에 연결됩니다.

Google 로그인까지 사용하려면 Windows에서 전체기능-실행.cmd를 실행해 주세요.
HTML 직접 실행(file://)에서는 Firebase의 Google 로그인 주소 제한이 적용됩니다.
전체기능-실행.cmd는 기본 PowerShell로 localhost 서버를 켜며 Node.js 설치는 필요 없습니다.
사용이 끝나면 실행 창에서 Enter를 눌러 종료합니다.

악보 사진 인식은 전체 기능 실행 화면에서 start-score-reader.cmd를 추가로 실행합니다.
사진 인식 도우미는 기존 앱과 동일하게 Node.js 및 Python/인식 모델 준비가 필요합니다.
MusicXML·MXL 파일 가져오기는 별도 도우미 없이 작동합니다.

자세한 설명은 실행안내.html을 열어 주세요.
index.html과 assets 폴더를 분리하지 마세요.
브라우저 저장/로그인 상태는 컴퓨터와 실행 주소마다 다릅니다. 이동할 작업은 악보함에 저장합니다.
공유 링크와 QR은 기존 온라인 앱을 사용하므로 온라인 앱이 운영 중이어야 합니다.

이 폴더에는 실행용 파일만 들어 있습니다. npm install 또는 빌드는 필요 없습니다.
음원 출처와 라이선스는 THIRD_PARTY_NOTICES.md를 참고해 주세요.
