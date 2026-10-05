# 개발 상태 및 Checkpoint 인계

기준일: 2026-09-27 · 변경 계약 반영: 2026-09-23

## 현재 진행: Checkpoint 5 개발 Worker 배포·회귀 PASS — 실제 Google 승인 대기

2026-10-05 재개 경로 수정: 사용자가 자동화 Chrome에서 Google의 ‘브라우저 또는 앱이 안전하지 않을 수 있습니다’ 차단을 확인했다. Google 보호를 우회하거나 자동화 식별을 숨기지 않았다. 기존 자동화 검증 브라우저를 종료하고, `math3-dev` Hosting의 1일 만료 preview `cp5-google`을 일반 Chrome에서 열었다. 실제 주소는 `https://math3-dev--cp5-google-q3ym6qkw.web.app/game/teacher/index.html`. Firebase CLI가 preview Origin을 authorized domains에 추가하기 전 목록을 비공개 `.cp5-test-artifacts/auth-domains-before-preview.json`에 백업했다. Worker URL 설정도 백업했다. 새로운 production 프로젝트/Hosting live 채널/Pages는 만들거나 배포하지 않았다.

현재 개발 Worker `25746fa1-a486-44e7-b34d-165ea5dea87a`는 원래 Pages Origin과 이 정확한 preview Origin만 허용하고, Google callback은 기존 Worker 주소 그대로이며 복귀 URL만 preview의 고정 `/game/teacher/index.html`이다. 임의 returnUrl은 계속 거부한다. UI·공개 Firebase web config만 명시한 allowlist로 게시했으며 서버/문서/환경 파일 HTTP 404, 핵심 화면 HTTP 200·noindex·CORS 확인 PASS. 이전 자동화 fixture는 삭제/이전하지 않았다. 일반 Chrome에서 새 익명 테스트 교사·`CP5일반검증반`을 만들고 로그인 전 uid/teacherId/학급 기준을 브라우저에 기록했다. 정상 Google **계정 선택 화면**에서 사용자 승인을 기다린다. 이 fixture로 연결 전후 보존을 검증한다. 로그인 차단 때문에 이전 승인 대기는 완료되지 않았으며 Workspace 실연결 PASS는 여전히 아니다.

도름스체크 v0.3.1 detect/init/security scan 실행: 확인 30, 미확인 5, 해당 없음 1. 보고된 항목은 권고(보안 헤더/정책 페이지/기존 코드 검토 등)이며 접근 권한·Secrets를 보증하지 않는다. 실제 Firestore 거부 검사는 이전 API 회귀 근거와 별도로 유지한다. 동적 보고서/설정은 Git 제외했다. `tools/cp5-live-integration.mjs`는 이제 공개 preview HTTP/CORS 점검만 하며 Google 로그인 자동화는 제거했다.

2026-10-05 13:32 KST: 사용자 수동 Google/Firebase 설정 완료 후 CP5를 실제 개발 트래픽에 적용했다. 활성 버전 `84d284a2-9508-4fac-8822-6b3f53660231`, 5분 cron 유지. 실제 인증된 `getGoogleConnectionStatus`의 `configured:true`, `configurationError:null`을 확인했다. `versions secret list --latest-version` 오류는 배포 게이트로 사용하지 않았다.

등록된 암호화 키가 서버의 32바이트 형식 검사를 만족하지 않아 OAuth가 차단됐다. 값을 읽지 않고 오류 코드로 진단했다. canonical Base64URL/Base64/hex 지원을 추가·검사했지만 계속 실패하여 새 무작위 32바이트 개발 키를 stdin으로 등록했다(값 출력/파일 저장 없음). 이전 설정은 Worker `4bf2f5df-3e99-4563-9fc7-87e7fd5de22e`에 보존했다. 성공한 OAuth 연결 생성 전 수정이며 Google Client ID/Secret은 유지했다.

단위·보안 45개, 실제 Firebase/Worker API 및 교사→학생 50문항 Chromium 회귀 2개, Sheets 모의 Chromium 모두 PASS. 같은 익명 교사/테스트 학급을 유지한 전용 개발 브라우저가 Firebase Google **사용자 로그인/승인 화면**에서 대기한다. `tools/cp5-live-integration.mjs`의 allowlist route를 사용하므로 실제 Pages 게시 결과가 아니다. 전용 프로필/상태는 Git 제외 `.cp5-test-artifacts/`에 있다.

**CP5 최종 PASS 불가(승인 대기).** 실제 Workspace callback/token 교환·암호화 연결·Drive/네 탭/실원장·반복 동기화·해제/재승인·예약 동기화·실계정 보안은 승인 후 검사한다. production 생성/개발 승격 및 최종 Pages 공개 검증은 하지 않았다. 아래는 재개 이전의 구현 이력이다.

2026-10-05: CP4를 이어받은 `codex/checkpoint5-google-sheets` 브랜치에 선택형 Google 연결과 Sheets 내보내기를 구현했다. Worker 서버 code flow/state·PKCE·브라우저 cookie·Google subject 검증, 독립 AES-GCM refresh token 암호화, 앱 metadata 기반 중복 생성 방지, 별명 중심 네 탭의 결정적 재작성, 게임 저장과 분리된 Firestore outbox/5분 scheduled 재시도, 교사 UI를 추가했다. `npm test` 44개와 로컬 Worker/Functions Emulator·기존 CP4 Chromium 및 Sheets 모의 Chromium, Worker dry-run이 통과했다. 상세는 [CP5 구현/검증](CHECKPOINT5_GOOGLE_SHEETS.md).

**Checkpoint 5 최종 PASS 아님.** 실제 OAuth/Drive/Sheets·새 Worker 배포·최종 Pages/production 검증은 아직 하지 않았다. 사용자가 직접 해야 하는 API/OAuth 설정·정확한 callback·새 Worker Secret 등록 명령은 [Google 설정 게이트](CHECKPOINT5_GOOGLE_SETUP.md)에 정리했다. 여기서 실제 Google 연동 배포를 멈춘다. `math3-dev` / `math3-cp3-dev`를 운영으로 승격하지 않으며 production Firebase/Worker/OAuth client의 별도 사용자 설정이 필요하다. [후반 배포/복구 절차](CHECKPOINT5_RELEASE.md).

현재 전체 내보내기는 학급당 학생/회차 각각 199건까지이며 200건이면 부분 export 없이 중단한다. 실제 Google 계정 충돌은 자동 병합/학급 이전하지 않고 기존 공간/복구를 안내한다. Free Worker 실제 CPU·하위 요청 수와 production 검증은 후반 실연결에서 확인한다. Secret 등록 도우미는 구문/help만 확인했고 실계정에 실행하지 않았다.

## 이전 판정: Checkpoint 4 PASS — 교사용 대시보드 구현 및 검증 완료

2026-09-29: 교사 관리 공간 진입·복구, 다중 학급, 참여 승인, 학생별 회차·문항, 학급 순위, 전체 순위 공개 설정, 학생 복귀 티켓을 `teacher/index.html`에 구현했다. 기존 Firebase Auth → Worker → Firestore 경계를 유지하고 교사 소유권을 확인하는 학급 순위 API를 추가했다. Worker/Functions Emulator와 실제 개발 Worker Chromium 기본 흐름을 검증했다. 상세 결과는 [CHECKPOINT4_TEACHER_DASHBOARD.md](CHECKPOINT4_TEACHER_DASHBOARD.md)를 참조한다. Checkpoint 5는 시작하지 않았다.

## 이전 판정: Checkpoint 3 PASS — 실제 개발 연결 및 통합 검증 완료

2026-09-27: `math3-cp3-dev`의 [개발 URL](https://math3-cp3-dev.subsubt-math3-dev.workers.dev)을 활성화했다. `preview_urls: false`, Custom Domain/Route 없음. `math3-dev`의 실제 익명 ID 토큰, 서비스 계정 OAuth, Firestore REST 읽기·쓰기와 Rules 차단을 검증했다. 로컬 `firebase-config.js`는 개발 Worker URL을 사용한다. 실제 API의 두 학급·4회 정규 완주·멱등성·순위·격리·페이지네이션, 실제 Chromium 교사/학생 50문항 화면, Chromium Firebase SDK의 Firestore 직접 접근 거부가 통과했다. 최종 Worker에서 50문항 브라우저 재검증과 기존 Functions/Worker 회귀도 통과했다. 사용자는 현재 예상 학급 규모를 기준으로 **Checkpoint 3 PASS**를 판정했다. 일부 Worker 요청의 CPU 10ms 초과와 학급 월별 최고 기록 200건 초과 시 전체 순위 공개 설정 재투영 제한은 수용한 운영 리스크이며, 규모 확대 시 최적화한다. 200건 최대 규모의 실제 재투영은 측정하지 않았다. 상세 결과는 [CHECKPOINT3_WORKER_MIGRATION.md](CHECKPOINT3_WORKER_MIGRATION.md)를 참조한다. 기존 Functions는 보존했고 Checkpoint 4는 시작하지 않았다.

2026-09-23에는 개발 프로젝트가 없어 실제 연결을 검증하지 못했다. 이후 별도 `math3-dev` 프로젝트와 CLI 인증, Rules/Indexes 배포가 준비되어 위 실제 연결 검증을 수행했다.

### Checkpoint 3 구현

- [FirebaseGameService](../src/services/firebase-game-service.js)를 기존 `GameService` 경계에 연결했다. 설정이 없는 파일 열기는 기존 mock 연습으로 남고, 설정이 있으면 익명 인증·Functions·서버 세션 복원으로 전환한다. 요청 ID를 로컬에 보존해 응답 유실 시 같은 요청을 재전송한다.
- [Functions](../functions/index.js)는 교사 공간/학급, 학급코드 참여 신청·승인, 학생 상태, 복귀 티켓, 서버 문제·채점·결과, 학급/전체 최고점 순위, 전체 등록 해제/복원, 교사 전용 상세 조회를 제공한다. seed와 전체 문제·원장은 서버에만 둔다. 교사 도구는 [teacher/index.html](../teacher/index.html)에 최소 기능만 구현했다.
- [Firestore Rules](../firebase/firestore.rules)는 브라우저의 모든 직접 읽기·쓰기를 거부한다. 기존 RTDB `scores`나 기존 HTML 3개는 수정하지 않았다.
- `gameId=1math3`, 평가/교육과정 버전 `1.0.0`, KST 시작 월로 순위를 분리한다. 완료 시 학급과 학생의 전체 등록 기본값은 true다. 전체 행에는 독립 별명과 점수만 저장한다.

### 검증 결과

| 검사 | 결과 |
|---|---|
| 기존 생성·채점·mock·화면 회귀 13개 | PASS |
| Emulator 익명 인증, 두 학급 승인/격리, 교사 상세 소유권, 승인 전 차단 | PASS |
| 점수 필드 위조 거부, Firestore 직접 읽기/쓰기 거부 | PASS |
| 중복 start/submit/finish, 동일 요청 충돌, 두 탭 동시 제출 | PASS |
| 서버 50문항 500점, 직접 종료 미완료, 24시간 만료, 답안 1회 기록 | PASS |
| 학급/전체 범위 분리, 월·버전 분리, 최고점 갱신, 공동 순위 1,1,3 | PASS |
| 학생·교사 전체 공개 설정 해제/복원, 복귀 티켓 일회용·이전 바인딩 차단 | PASS |
| Chromium 교사 승인→학생 50문항 완료→서버 결과/전체 순위, 새로고침·응답 유실 재시도 | PASS |
| 별도 `math3-dev` 인증·서비스 계정 OAuth·Firestore REST | 실제 Worker에서 PASS |
| 직접 Firestore GET/PATCH, 무인증·Origin·토큰·점수 위조 거부 | 실제 요청에서 PASS |
| 실제 Chromium 교사 승인→학생 50문항→서버 결과→학급·전체 순위 | PASS; 응답 유실 재시도·새로고침 복원 포함 |
| 실제 API 순위·멱등성·격리·최고 기록·공개 설정·페이지네이션 | PASS; `tests/worker-live.test.js` |
| 실제 Worker 동시 답안 제출·최초 답안 불변 | PASS; `tests/worker-live-race.test.js` |
| Workers Free CPU 10ms 및 학급 최대 200개 재투영 | 일부 초과 관측, 최대 규모 미검증; 현재 규모에서 운영 리스크로 수용하고 CP3 PASS |

재현 절차는 [CHECKPOINT3_SETUP.md](CHECKPOINT3_SETUP.md)를 참조한다. 향후 규모 확대 전에 CPU 사용량, Firestore 무료 사용량, 학급 전체 공개 설정 재투영 한도를 다시 측정한다.

---

## 이전 판정: PASS — Checkpoint 2 학생용 게임 구현 완료

Checkpoint 1 설계는 유지되며, 학생용 게임의 자동·브라우저 검증까지 통과했다. Firebase·서버 채점·공식 저장 및 실제 순위 운영은 구현하지 않았다.

## 1. 확인한 프로젝트 상태

- 루트는 기존 `index.html`, `1math1.html`, `1math2.html` 단독 HTML 방식. `index.html`도 게임이며 포털이 아니다.
- Git 기준 최근 커밋은 `74e8e23` (`Add files via upload`). 추적 파일은 위 HTML 3개. 시작 시 `references/`는 기존 미추적 자료였으며 자동 추가하지 않았다.
- 기존 docs, package.json, Firebase 설정/Rules, 테스트/배포 파이프라인, 적용할 AGENTS.md를 발견하지 못했다. 새 문서 체계를 `docs/`에 만들었다.
- `1math1.html`은 RTDB `scores`, `1math2.html`은 `/games/1math2/scores`를 사용한다. Firebase 브라우저 SDK는 각각 compat 10.8.0/10.12.2 참조다. 이를 새 구현의 버전 기준으로 복사하지 않는다.
- `1math2.html`은 5분·정답당 10점·클라이언트 직접 push, 같은 데이터의 순위/오답 상세 `?board=1` 구조다. 새로운 교사 인증/개인정보 분리 요구를 충족하는 재사용 기반으로 삼지 않는다.
- 기존 Firebase 실제 Rules·온라인 데이터·운영 접근 가능 여부는 검사하지 않았다. 소스에서 확인한 구조적 위험을 실제 데이터 유출 사실로 단정하지 않는다. 기존 게임에 대한 별도 보안 점검은 새 게임 배포 전 권고 사항이다.
- 이번에 HTML·참고 PDF 원본을 수정하지 않았다. SDK 설치·게임 구현·Firebase/OAuth/Sheets/Apps Script 생성·배포·커밋은 수행하지 않았다.

## 2. 산출물 지도

| 문서 | 다음 작업자가 얻을 정보 |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | R01~R12, 학생/교사 흐름, 50문항 규칙, 저장·순위·기본 공개 정책 |
| [CURRICULUM_ANALYSIS.md](CURRICULUM_ANALYSIS.md) | 자료별 쪽수, 성취기준, 5유형 생성 조건, 경계값·제외 범위, 교육 검증 |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | 결정 근거, 인증/복구, 데이터 경로, API·코어 계약, Sheets/Apps Script, 배포·보안 |
| 이 문서 | 현재 상태, PASS 근거, 미구현 범위, 다음 진입 조건 |

## 3. 완료 조건 대조

| 완료 조건 | 확정 근거 | 판정 |
|---|---|---|
| 지도서 기반 목표·범위 | 교육과정 §1~4, 1-2 2단원, 기본 9 이하와 10 만들고 더하기 구분 | PASS |
| 문제 유형·규칙 | 교육과정 §3, 요구사항 §3, 5유형×10·500점·시간 가산 없음 | PASS |
| 학생 진입~저장·순위 | 요구사항 §2~5, 시스템 §6~7 | PASS |
| 교사 학급 생성·관리 | 요구사항 §6, 시스템 §3~4 | PASS |
| Google 없는 교사와 연결 교사 | 같은 teacherId, 선택 provider 연결·Sheets 별도 동의 | PASS |
| 학급코드·소유권·복구 | 8자리 참여코드·교사 승인, 별도 256bit 관리 복구 키 | PASS |
| 다중 교사·학급·게임 | 시스템 §5의 식별자·경로·인덱스와 소유권 경계 | PASS |
| 전체/학급 순위 공개 | 기본 전체 등록, 별도 투영·독립 별명, 게임/버전/월 분리, 학생/교사 권한 표 | PASS |
| Sheets 선택 연동 | 서버 OAuth·앱 생성 문서 선택·원장 단방향 동기화·Apps Script 선택 확장 | PASS |
| 개인정보·보안 | 시스템 §9의 위험/대응·보유/삭제·운영 전 게이트 | PASS |
| 다음 단계 구현 기준 | 코어·어댑터 API, 문항 생성/채점/상태/검증 계약 확정 | PASS |

## 4. 실시한 설계 검증

- 참고 PDF 10개를 읽기 전용으로 열어 지도서 28쪽 전체 텍스트 및 총론·내용체계의 관련 부분을 검토했다.
- PDF 일부 글꼴의 텍스트 추출이 깨져 174/175/177/191/194쪽을 이미지로 확인했다. 번들 Poppler는 한글 경로 언어맵 오류가 있어 번들 PDFium으로 렌더링해 확인했다. 원본 변환/수정은 하지 않았다.
- 공식 Firebase·Google·GitHub 문서에서 익명 인증/계정 연결, 서버 Rules 경계, callable/App Check, 최소 Sheets scope·문서 생성·서버 OAuth, Apps Script 실행 주체, Pages 정적 제약, TTL/Functions 운영 조건을 확인했다. 링크는 시스템 문서 §12에 모았다.
- 일회성 조합 열거로 기본 세 수 덧셈 **84개**, 뺄셈 **119개**, 앞/뒤 인접 쌍이 10인 세 수 덧셈 **153개**가 존재함을 확인했다. 최종 합 범위 11~19, 뺄셈 결과 0을 확인했다. 이는 생성기 구현/테스트 스위트 작성이 아닌 범위의 최소 수학 검증이다.
- `9+1+9`의 정답 카드 쌍이 두 개라는 경계를 반영해 어느 유효 쌍도 정답으로 처리하도록 확정했다. 하나의 쌍만 허용해 19가 빠지거나 올바른 풀이를 오답 처리하는 오류를 방지한다.
- 브라우저 데이터 삭제, 다른 기기 복귀, 중복 제출, 마지막 답/종료 경합, 월말 완료, 공개 철회, 최고 기록 삭제, Google 연결 충돌·권한 철회를 문서 흐름으로 검토했다. 실제 통합 동작은 아직 검증하지 않았다.
- 문서 내부 링크·UTF-8 및 기존 추적 HTML의 변경 여부를 확인했다. 임시 추출 텍스트/렌더 이미지는 산출물에서 제거한다.

## 5. Checkpoint 2 산출물 및 구현 상태

| 경로 | 역할 |
|---|---|
| [1math3.html](../1math3.html) | 학생 진입, 게임·결과·복습·순위 화면 |
| [core.js](../src/games/1math3/core.js) | seed 기반 50문항 생성, 안전한 문제 투영, 최초 응답 채점, 집계·해설 |
| [mock-game-service.js](../src/services/mock-game-service.js) | `GameService` 경계와 localStorage 기반 `MockGameService`; 참여 승인·세션·요청 멱등·저장 상태·예시 순위 |
| [app.js](../src/student/app.js), [1math3.css](../src/student/1math3.css), [1math3.bundle.js](../src/student/1math3.bundle.js) | 학생 화면 상태 전이, 터치·키보드 조작, 반응형·접근성 표현 및 파일 직접 열기용 스크립트 |
| [build-1math3.mjs](../tools/build-1math3.mjs) | 재사용 가능한 ES 모듈 코어·서비스·UI에서 브라우저용 일반 스크립트 생성 |
| [1math3-core.test.js](../tests/1math3-core.test.js) | 생성·범위·경계·상태·서비스·접근성 자동 검사 |

- 계약 버전: `gameId=1math3`, curriculum/rules/generator=`1.0.0`, schema=`1`.
- 문항은 교육과정 문서의 고정 10라운드 순서로 만들고, 유형별 10문항·전체 50문항이다. seed 기반 후보 추출은 무한 재시도 없이 유형·하위 유형·정렬된 수 배열·빈칸 위치 중복을 피한다.
- 최초 응답만 10점 또는 0점으로 고정한다. 건너뛰기와 미응답을 분리하고, 두 단계 문항은 카드 짝과 합을 모두 최초 정답해야 10점이다. 복습은 원장 점수에 영향을 주지 않는다.
- 수업 참여 신청·대기·승인, 연습/기록 도전 구분, 재도전, 직접 종료, 10문제 단위 쉬어가기, 모의 저장, 학급/전체 예시 순위를 제공한다. 기본 전체 순위 등록 상태는 켜짐이며 해제와 조회는 분리했다.
- 화면의 저장·별명·순위는 로컬 모의값이며 실제 학생 기록이나 공식 순위가 아니다. 정적 브라우저에서 정답·점수는 변조 방지되지 않으며 mock에만 적합하다. 공식 순위는 Firebase 서버 채점 후에만 가능하다.
- Firebase adapter, 교사 대시보드, OAuth, Sheets, Functions, Rules, 배포는 만들지 않았다.
- `1math3.html`을 `file://`로 직접 열 때 모듈 로딩이 차단되어 빈 화면이 되는 문제를 수정했다. 소스 모듈을 수정한 뒤에는 `node tools/build-1math3.mjs`로 브라우저 스크립트를 다시 생성한다.

## 6. 남은 위험과 후속 게이트

| 항목 | 결정된 대응 / 해결 시점 | CP2 차단 여부 |
|---|---|---|
| 저학년 50문항 부담과 실제 난이도 | 10/20/30/40번째 뒤 선택 쉬어가기 제공, 첫 시범 수업에서 길이·읽기량 검토. 바뀌면 평가 버전 분리 | 아니오 |
| 교사 자격의 외부 검증 없음 | 관리 공간 소유권만 검증하며 학교 교직원 신분을 보증하지 않음. 실제 학급 학생은 현장 승인 | 아니오 |
| 복구 증명 모두 분실 | 자동 복구 불가를 명시, 키 보관 절차·선택 Google 연결 | 아니오 |
| 전체 순위 부정 참여 | 서버 검증·교사 승인·한도. 대리 풀이/다중 학급 등록은 완전 방지 불가, 공인 평가로 사용 금지 | 아니오 |
| Firebase 비용·리전 | 별도 신규 dev/prod 프로젝트, Blaze/예산·리전·운영자 확정 후 연동 | 아니오, 실제 연동 게이트 |
| 개인정보 운영 책임 | 목적/근거·학교/보호자 절차·국외 처리·삭제 창구·보유기간 실제 운영 적합성 확정 | 아니오, 실제 학생 수집 게이트 |
| OAuth 앱 공개/학교 계정 정책 | 테스트/운영 프로젝트 분리, 학교 관리자 제한·scope·재승인 검증 | 아니오, Sheets 제공 게이트 |
| Rules·서버 IAM·에뮬레이터 | 시스템 §11 검증을 후속 연동 단계에서 통과 | 아니오, 배포 게이트 |
| 기존 HTML 서비스 보안 | 현재 live Rules는 미확인. 새 프로젝트와 격리, 기존 서비스는 별도 점검 권고 | 아니오 |
| 지도서 저작권/공개 저장소 | 원문은 참고용, 공개 배포 제외. 저장소 공개·재배포 권한은 운영자 확인 | 아니오, 공개 배포 게이트 |
| 교사 Sheets 외부 사본 | 앱 관리 탭 삭제 동기화와 사용자 사본 삭제 안내. 완전 회수 보장 불가 | 아니오 |

이 항목들은 미확정 핵심 아키텍처가 아니라 구현·실운영 시 검증할 조건이다. 무료 정적 호스팅만으로 보안 백엔드까지 운영한다는 전제는 채택하지 않았다.

## 7. 다음 작업 시 금지할 재설계 오류

- ‘Google 없는 교사’를 공개 쓰기/인증 없는 교사 API로 구현하지 않는다.
- 학급코드를 관리 비밀번호나 학생 본인 확인으로 사용하지 않는다.
- studentName·nickname·Google 이메일을 기본 키로 사용하지 않는다.
- 전체 순위를 위해 원장/오답을 읽기 공개하거나 RTDB 기존 `scores`와 합치지 않는다.
- Google 최초 승인으로 토큰이 영구 유효하다고 약속하거나 Spreadsheet URL/ID 입력을 추가하지 않는다.
- 모든 문제를 10 이하로 제한하거나 학년군 전체 덧셈 범위를 출제하지 않는다.
- 클라이언트 점수·localStorage 기록을 공식 순위로 자동 승격하지 않는다.

## 8. Checkpoint 2 검증 및 미구현 범위

### 판정 근거

- `node --test`: 생성·채점 11개와 파일 직접 열기용 스크립트 2개 검사. 10개 seed의 각 유형 10개/50개 총량·고정 순서·문항 중복 확인, 모든 라운드 후보의 범위 검사, 0/11/19/다중 정답 카드쌍, 안전한 `PublicQuestion` 투영, 최초 응답 불변, 500점 완료와 직접 종료, 멱등 중복 요청·재도전·등록 해제·승인 게이트, 반응형/접근성 스타일 계약 포함.
- 로컬 브라우저에서 연습 시작, 키보드·키패드 숫자 입력, 새로고침 후 답 피드백 복원, 카드 위치 선택과 2단계 합 입력, 10문제 쉬어가기, 건너뛰기 확인, 직접 종료와 미완료 결과, 복습, 전체 50문항 완료(0점), 재도전 버튼, 전체/학급 순위 탭과 전체 등록 철회를 확인했다.
- 파일 직접 열기 수정 후 일반 스크립트 구문 검사와 모듈 로더 없는 실행 환경의 첫 화면 렌더 검사를 통과했다. 수정된 `file://` 화면의 실제 브라우저 재검사는 브라우저 자동화 정책이 로컬 파일 접근을 차단하여 수행하지 못했다.
- 전체 회차 플레이 동안 임시 감지기를 달아 window error, unhandled rejection, `console.error`를 확인했으며 Critical 오류는 없었다. 감지 코드는 점검 후 HTML에서 제거했다.
- 화면은 모달형 종료 확인, 큰 터치 영역(주요 버튼 48px 이상), 색 외 표시, 초점 강조, 키보드 Enter/숫자 입력, `prefers-reduced-motion`을 제공한다. 모바일 breakpoint(620px)와 320px 최소 폭 규칙을 자동으로 확인했다. 브라우저 자체의 모바일/태블릿 viewport 에뮬레이션은 이번 환경에서 실행하지 않았다.
- HTML 원본 `index.html`, `1math1.html`, `1math2.html` 및 참고 PDF는 변경하지 않았다. Firebase 실서비스·Cloud Functions·실제 서버 보안·공식 순위·배포 검증은 이 체크포인트 범위 밖이다.

**종료 지점: Checkpoint 2 PASS. Checkpoint 3은 시작하지 않음.**
