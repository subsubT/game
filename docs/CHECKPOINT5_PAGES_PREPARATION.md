# CP5 실제 GitHub Pages 배포와 검증

2026-10-07 KST. 학생·교사 게시와 핵심 공개 흐름 PASS. 실제 Google 공개 Origin 검증은 사용자 클릭 대기이며 CP5 전체 최종 PASS는 보류한다.

## 현재 운영 결정

기존 Firebase `math3-dev`, Worker `math3-cp3-dev`, 현재 Google OAuth Client/Drive/Sheets를 실제 공개 서비스에 그대로 사용한다. 이름 유지, 새 production 생성·마이그레이션·Secret 회전 없음. 2026-10-05의 별도 production 필수 조건은 과거 설계다.

## 원인과 게시

- 이전 Pages: `main`의 `/`, `legacy`; main `25b4bfb00c3c5fca2b07a0f7b3abbec4b2a66aeb`.
- 새 학생·교사 파일은 CP5 브랜치에만 있어 공개 경로에서 404였다.
- 최신 원격 main을 CP5에 병합하여 기존 1math2 개인정보 안내/SRI/배포 설정을 보존했다.
- Pages를 REST API로 `build_type=workflow`로 전환하고 main에 정상 fast-forward push했다. Repository Settings 사람 클릭은 필요 없었다.
- 기존 수동 `.github/workflows/pages.yml` 재사용. push는 자동 배포하지 않는다. `gh workflow run pages.yml --ref main`으로 빌드·credential 검사·allowlist artifact·deploy를 실행한다.
- 첫 배포: [37605881985](https://github.com/subsubT/game/actions/runs/37605881985), `facd9b74dae14b72a503a5af859b334819b1f632`, success.
- favicon 보완 배포: [37607043018](https://github.com/subsubT/game/actions/runs/37607043018), `de4d12e5969a69d2bbd3c0e0ea1a4e60792ae908`, success.
- 학생: https://subsubt.github.io/game/1math3.html
- 교사: https://subsubt.github.io/game/teacher/ 및 https://subsubt.github.io/game/teacher/index.html
- Worker: `ca7fbc93-8732-4a84-9b9e-764d6473d14f`; 5분 cron 유지. 기존 callback 유지, 고정 복귀 위치만 공개 교사 화면으로 변경.

## 공개 산출물

`node tools/build-pages.mjs`는 추적된 `config/pages-public.json`의 공개 메타데이터를 사용한다. 정확한 기존 Firebase/Worker·저장소·Pages URL만 허용하며 로컬 `firebase-config.js`로 대체하지 않는다. `--review-dev`는 검토 폴더만 만든다.

의존성을 확인한 allowlist 12개:

- `index.html`, `1math1.html`, `1math2.html`, `1math3.html`
- `src/student/1math3.css`, `src/student/1math3.bundle.js`
- `teacher/index.html`, `teacher/dashboard.css`, `teacher/dashboard.js`
- 생성 공개 `firebase-config.js`, `1math2-config.json`, `.nojekyll`

Firebase SDK는 기존 gstatic scripts/imports로 로딩한다. 서버 모듈/source map은 없다. 임의 파일·symlink는 빌드가 거부하며 HTML은 현재 소스와 SHA-256 비교한다. Firebase 웹 apiKey는 공개 클라이언트 식별값이다. Secret·서비스계정·OAuth client secret·token은 포함하지 않는다.

실제 Pages에서 references/docs/tests/worker/functions/tools, 환경 파일, 비공개 증거와 원본 배포 config가 404임을 확인했다.

## 기존 게임

index/1math1 게임 로직은 그대로다. HTML의 빈 data favicon으로 도메인 루트 favicon 404를 제거했다. 1math2는 정적 Pages에서 실행 불가능한 `/api/firebase-config` 대신 Pages 호스트에서만 `./1math2-config.json`을 읽는다. Vercel에서는 기존 API 경로 유지. ESM 병합과 API export/CSP hash의 호환성을 맞췄으며 이번 요청에서는 Vercel 별도 배포를 하지 않았다.

실제 Chromium의 세 기존 게임 시작·채점·콘솔 오류 없음 PASS. 종료/저장을 하지 않아 기존 운영 순위표에 시험 점수를 남기지 않았다.

## 공개 검증

- 학생·교사와 필수 assets 200, JS/CSS/JSON MIME 정상.
- 실제 Pages 다운로드로 학생 50문항·교사 승인·결과/학급·전체 순위·응답 유실 재시도·새로고침·복수 학급·공개 설정·복구 키·학생 복귀 티켓 PASS. Pages 요청을 로컬 HTML로 대체하지 않았다.
- Google 없는 교사 정상. 타 교사/학급 거부·점수 위조·요청 경합·Firestore 브라우저 직접 읽기/쓰기 거부 PASS.
- 공개 Origin OAuth launch/state 재사용·cookie 누락·만료·임의 returnUrl 거부 PASS.
- 실제 Google 로그인/승인/callback/Sheets 공개 화면은 사용자 계정 선택 클릭 뒤 계속한다. 개발 preview의 Google PASS를 이번 공개 Origin PASS로 대신하지 않는다.

Pages 설정·기존 HTML·Worker 설정/버전 백업은 Git 제외 `.cp5-test-artifacts/final/`에 있다. 직전 정상 workflow commit을 수동 재배포하면 복구 가능하다. 기존 데이터·Rules·Secret은 변경/삭제하지 않았다.

공식 근거: [custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Pages REST API](https://docs.github.com/en/rest/pages/pages).
