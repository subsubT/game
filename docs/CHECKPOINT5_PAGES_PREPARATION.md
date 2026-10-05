# CP5 GitHub Pages 준비와 실제 공개 검사

2026-10-05. 실제 Google 개발 연동과 재승인 복원이 PASS한 뒤 확인했다. Firebase/Worker/Google 운영 리소스는 생성하지 않았고 math3-dev를 운영으로 승격하지 않았다.

## 실제 현재 게시 상태

- Pages URL: `https://subsubt.github.io/game/`
- 게시 방식: legacy, `main`, repository root `/`, status built.
- 현재 main 복구 기준: `25b4bfb00c3c5fca2b07a0f7b3abbec4b2a66aeb`.
- 실제 HTTP: 홈과 기존 index/1math1/1math2는 200, 1math3와 teacher/index.html은 404.
- Pages 설정·기존 main·운영 데이터는 변경하지 않았다. 새 CP5 브랜치 push는 Pages 게시로 간주하지 않는다.

## 준비한 산출물

`node tools/build-pages.mjs --review-dev`는 Git 제외 `dist-pages-review/`만 만든다. 새 학생/교사 HTML에 개발 검토용 표시를 추가하고, 기존 HTML 3개는 원본 해시와 비교해 그대로 보존한다. 생성 파일은 기존 게임 3개, 신규 학생 HTML/CSS/classic bundle, 교사 HTML/CSS/JS, 공개 Firebase web config, .nojekyll의 11개뿐이다. references/docs/tests/server/tools/node_modules/인증 파일/Secret/로그/개발 검증용 버튼은 들어가지 않는다. 이 검토용 폴더는 workflow의 업로드 대상이 아니다.

운영 빌드는 `node tools/build-pages.mjs`이며 환경 변수 `MATH3_PUBLIC_DEPLOYMENT_CONFIG`의 **공개 메타데이터 JSON**이 필요하다. 필요한 필드는 environment=`production`, repositoryUrl=`https://github.com/subsubT/game.git`, pagesUrl=`https://subsubt.github.io/game/`, 실제 firebaseProjectId, 실제 workerName, 실제 workerApiOrigin, firebase 공개 web config이다. firebase 객체는 apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId/region/workerApiOrigin만 허용한다. Client Secret, refresh/access token, 서비스 계정 JSON, 암호화 키는 이 변수에 넣지 않는다.

운영 설정 누락 및 math3-dev/개발 Worker를 운영 메타데이터로 넣는 빌드의 실제 거부를 확인했다. 검토용 빌드 11개 파일·기존 게임 해시 보존 PASS, 테스트용 추가 파일의 거부와 제거 후 정상 재빌드 PASS. 임의 추가 파일·symlink는 산출물 검사가 거부한다. 기본 운영 빌드가 검토용 개발 설정으로 자동 대체되지 않는다. YAML 파싱으로 수동 실행만 허용·dist-pages 경로·deploy의 build 의존성을 확인했다.

`.github/workflows/pages.yml`은 workflow_dispatch만 허용하며 push로 실행되지 않는다. public config의 실제 운영 리소스 식별자를 대조한 빌드 후 dist-pages만 업로드한다. build 완료에 의존하는 deploy job은 Pages와 OIDC 권한을 해당 job에만 둔다. [GitHub 공식 Pages workflow 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 확인해 configure-pages@v5, upload-pages-artifact@v4, deploy-pages@v4 구조를 준비했다. workflow는 현재 CP5 개발 브랜치에만 저장하며 실행하지 않았다.

## 사용자의 다음 환경 설정 조건

사용자는 현재 새 production 생성과 개발 승격을 금지했다. 기존 설계의 분리 원칙에 따라 운영용 Firebase 프로젝트/Firestore/Auth 설정, 별도 Worker/서버 Secret, 별도 Google OAuth Web client/Test 또는 게시 정책을 먼저 확정해야 한다. OAuth callback은 확정된 운영 Worker 주소를 사용하며 새 Secret 값은 서버에만 등록한다. 현재 개발 Google 연결의 키/자격 증명을 복사하거나 자동 이전하지 않는다.

설정 완료 후 실제 프로젝트 식별자·Pages 기존 설정/산출물 백업을 대조하고, Pages source를 승인된 Actions 방식으로 전환하여 준비한 artifact를 게시한다. 실제 Pages에서 Auth/CORS/학생 게임/교사 대시보드/OAuth 복귀/Sheets 전체 흐름을 확인하고 요청한 도름스체크를 실행한다. 권고는 참고로 보고하고 실제 위험만 수정한다. 그 전에는 CP5 전체 최종 PASS를 선언하지 않는다.
