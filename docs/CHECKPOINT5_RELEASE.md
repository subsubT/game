# Checkpoint 5 후반 개발 검증·운영 배포·복구 절차

2026-10-05. **실제 Google 개발 통합 PASS; 운영 설정과 실제 Pages 전체 통합 조건 남음.** 최신 활성 Worker `e9bc9633-db9c-457e-aeb6-cbc68f02664d`에서 해제/revoke·재승인·같은 파일 복원·별도 cron까지 확인했다. [실제 검증 기록](CHECKPOINT5_LIVE_EVIDENCE.md)과 [Pages 빌드/workflow 준비](CHECKPOINT5_PAGES_PREPARATION.md)를 참조한다. 아래 기존 버전/승인 대기는 이력이며 최종 production/Pages 단계는 실행하지 않았다.

## 개발 Worker 실제 연결

현재 사용 경로: 일반 Chrome → `math3-dev` Hosting preview `cp5-google` → 기존 Worker callback → 고정 preview 대시보드. URL `https://math3-dev--cp5-google-q3ym6qkw.web.app/game/teacher/index.html`, 활성 Worker `25746fa1-a486-44e7-b34d-165ea5dea87a`. preview는 1일 만료이며 Google 로그인 보호를 우회하지 않는다. 개발 재게시 명령은 `node tools/build-cp5-preview.mjs` 후 `npx firebase hosting:channel:deploy 'cp5-google' --project 'math3-dev' --config 'firebase.cp5-preview.json' --expires '1d' --non-interactive`이다. Hosting live/Pages/production을 배포하는 명령과 구분한다. 기존 도메인 목록/Worker 설정 백업은 `.cp5-test-artifacts/`에 보관한다. 종료 후 이 preview의 Origin만 정리하고 기존 도메인·deny 규칙은 보존한다. 실제 Google 개발 PASS 후에 최종 Pages 공개 절차를 진행한다.

1. GitHub `subsubT/game`, Firebase `math3-dev`, Worker `math3-cp3-dev`를 현재 조회와 설정에서 대조한다. 사용자 로그인/Console 동의는 사용자에게 맡기고 Secret 값은 출력하지 않는다.
2. `versions list`/`deployments list`의 메타데이터로 실제 버전을 대조한다. `versions secret list --latest-version` 성공을 게이트로 사용하지 않는다. Secret 값은 조회하지 않고 실제 인증된 `getGoogleConnectionStatus`와 OAuth 시작으로 존재/형식/동작을 확인한다. staged Secret 적용은 `wrangler versions deploy '<조회한 실제 버전 ID>@100%' --name 'math3-cp3-dev' --yes`를 사용한다. Secret 준비 버전과 CP5 코드 배포를 구분해 기록한다.
3. 배포 전 기존 Worker 활성 버전·설정·cron을 읽기 전용으로 기록한다. Firestore의 변경 대상 Google 연결/export/job/teacher 메타데이터는 복원 가능하게 **서버 전용 비공개 저장소**에 백업하고 버전·환경을 기록한다. token/복구 키/학생 자료를 공개 저장소나 Pages에 넣지 않는다. 이번에는 기존 Rules/학생 성적 스키마를 변경하지 않는다.
4. `npm test`, `npm run check:worker`, 필요한 Emulator/Chromium 검사 후 `npx wrangler deploy --name 'math3-cp3-dev'`로 새 개발 코드를 배포한다. 5분 cron·actual deployed version·고정 callback·CORS를 확인한다. 배포 후 로그에는 정해진 오류/계수만 남기고 OAuth URL query·요청 body·token을 수집하지 않는다.
5. 정적 파일은 검증된 실제 Pages Origin에서 제공할 준비가 필요하다. **GitHub Pages의 기존 서비스 파일을 덮어쓰기 전 현재 Pages 설정/산출물을 기록**하고 개발 검증과 최종 운영 공개를 구분한다. 최종 Pages workflow/산출물은 실제 Google 개발 검증 이후 준비한다. 개발 검증에 기존 CP3 방식의 허용 Origin 테스트 서버를 사용했다면 이를 실제 Pages 게시로 보고하지 않는다.
6. 본인 시험 Google 계정에서 익명 교사→Firebase provider 연결(uid 유지)→별도 Workspace 동의→Drive 관리표 1개→네 탭→실제 Firestore 데이터를 확인한다. 반복 생성/반복 동기화·실제 최초 답·정답률·개인정보 제외·비공개 파일 권한을 확인한다. 토큰 만료/철회 후 재승인, 해제와 기존 파일 보존, 응답 유실 복구도 검사한다.
7. 브라우저를 닫아도 새 Worker 실행의 scheduled 작업에서 새 완료 회차가 내보내지는지 확인한다. lease/dirty/실패 재시도, 실제 CPU·subrequest·데이터 크기·무료 quota를 측정한다. 최대 199회차를 실측하지 않았으면 제한을 문서에 남긴다.

## 최종 production 설정과 Pages

개발 리소스의 승격은 금지한다. 별도 Firebase 프로젝트/Firestore 위치·권한·provider·인증 저장, production Worker와 Secret, **별도 Google OAuth Web client**를 사용자가 확정하고 준비해야 한다. 그 전에는 production 이름/ref/주소를 임의로 만들어 배포하지 않는다. 프로젝트 지침에 실제 리소스 ID와 URLs를 기록하고 개발 값이 들어가지 않는지 검증한다. Supabase/Vercel은 이 아키텍처에 추가하지 않는다.

최종 정적 산출물은 allowlist로 만든다: 기존 HTML 세 개, `1math3.html`, 학생 화면에 필요한 공개 CSS/번들, `teacher/index.html`·`dashboard.css`·`dashboard.js`, 검증한 **공개용 Firebase web config**만 포함한다. student bundle은 classic build이고 모든 서버/테스트 모듈은 제외한다. repo root 전체를 그대로 Pages artifact로 업로드하지 않는다. `references/`, `docs/`, `tests/`, `worker/`, `functions/`, `tools/`, `node_modules/`, 로컬 Firebase config/인증 저장소, `.env*`, `.dev.vars*`, 서비스계정/OAuth JSON, 로그, `.wrangler`, `.vercel`, `.git`은 포함하지 않는다. 최종 pipeline은 Google 실연결 확인 이후 작성·검증한다.

GitHub Pages 실제 production Origin에서 아래를 확인한다.

- 학생 진입, 학급 참여/승인, 50문항 서버 채점/결과 저장, 학급/전체 순위, 새로고침과 응답 유실.
- 교사 관리 공간/복수 학급/승인/학생 기록/회차·문항/순위/전체 공개 설정/복구/복귀 티켓.
- Google 없는 교사 정상, 선택 연결/재승인/관리표 생성/자동·수동 동기화/반복/해제.
- 타 교사 권한/Firestore 브라우저 직접 접근/state·code replay/임의 redirect 차단, Secret/token 비노출, 최소 scope와 비공개 문서.
- HTTP 정상 응답, Chromium 콘솔과 서버 sanitized runtime 오류, 새 서버 실행에서도 원장/작업 지속.

배포 뒤 요청한 도름스체크 detect/init/security scan을 해당 실제 새 앱 주소로 실행한다. 훅/차단 기능·전역 설치는 사용하지 않고 위험 항목만 고친 뒤 재배포·재검사한다. 기존 `index.html/1math1/1math2` 서비스의 위험은 새로운 CP5 변경의 검증과 구분해 보고한다. 이번 준비 단계는 배포를 하지 않았으므로 scan도 실행하지 않았다.

최종 PASS는 개발 테스트만으로 판정하지 않는다. 실제 Firebase + Worker + Pages + Google 통합 결과를 `DEVELOPMENT_STATE.md`와 CP5 문서에 기록하고 실제 public URL/버전/일시·남은 한도를 보고한다.

## 복구

- 배포 오류: 기록한 이전 Worker 버전을 조회해 rollback한다. Secret의 기존 버전 호환성을 확인하고 token을 로그로 출력하지 않는다. 새 Google 기능만 끄더라도 기존 게임/Firestore API를 유지한다. Google 연결이 만들어진 뒤 CP4로 되돌리면 자동 내보내기는 중지되므로 다시 CP5를 적용한 후 원장에서 재작성한다.
- 원장: 코드 rollback이 Firestore 데이터를 복구하지 않는다. 변경 대상만 비공개 백업으로 복원하며 학생 성적/소유권을 추정하여 덮어쓰지 않는다. 덮어쓰기·삭제·권한 약화가 필요하면 대상과 이유를 설명하고 사용자 확인을 받는다.
- Sheets: Google 장애/권한 철회는 원장 저장을 막지 않는다. 재승인 후 원장에서 전체 재작성한다. create 응답 유실은 appProperties로 검색하며 중복 파일은 삭제하지 않는다. 검색에도 안 보이는 불확실 생성은 운영자가 Drive/로그의 안전한 식별값을 확인하기 전 새 문서를 만들지 않는다.
- Secret 분실/회전: 독립 암호화 키의 변경은 기존 token 봉투를 읽지 못하게 한다. 기존 키를 자동 교체하지 않는다. 폐기·재승인 또는 서버 암호문 마이그레이션 계획을 정한다. 외부 Drive 사본은 앱에서 완전히 회수할 수 없다.
- Pages: 검증한 직전 artifact/commit을 재배포한다. 학습 원장/Secret을 artifact에 넣지 않는다. 기존 HTML 세 개는 의도한 별도 요청이 없으면 변경하지 않는다.
