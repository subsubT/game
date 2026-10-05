# Checkpoint 5 — 선택형 Google Sheets 구현·검증

2026-10-05. **현재 판정: 실제 OAuth·암호화 저장·Drive/Sheets 생성·실제 100문항·중복 방지·오류 격리 PASS. 실제 해제/재승인 최종 검사 중; CP5 최종 PASS 아님.** 최신 근거는 [실제 개발 통합 검증](CHECKPOINT5_LIVE_EVIDENCE.md)이다. 아래 승인 대기 내용은 이전 이력이다. Pages/production 미게시.

## 실제 재개 결과 — 2026-10-05 13:32 KST

최신 승인 재개 확인: 사용자의 Google 계정 로그인은 완료됐으나 현재 앱은 연결되지 않았다. 일반 Chrome에서 앱 연결을 재개해 `math3-dev.firebaseapp.com 서비스로 로그인` Google 승인 화면의 `계속` 버튼을 확인하고 사용자에게 맡겼다. 이 버튼 승인 전 실제 Firebase linking/Workspace 연결 완료로 보고하지 않는다. 실제 Drive/Sheets 검증은 여전히 대기 중이다.

**이후 로그인 경로 수정:** 자동화 Chrome의 Google 로그인 차단을 사용자 화면에서 확인했다. 정상 일반 Chrome용 `math3-dev` Hosting preview `cp5-google`을 준비했다(1일 만료): https://math3-dev--cp5-google-q3ym6qkw.web.app/game/teacher/index.html . 실제 신규 활성 Worker는 `25746fa1-a486-44e7-b34d-165ea5dea87a`. 기존 Worker callback/Secret/Firestore Rules는 유지하고 이 정확한 preview Origin·고정 복귀 URL만 설정했다. authorized domains 변경 전 메타데이터와 Worker 설정은 비공개로 백업했다. 일반 Chrome의 정상 Google 계정 선택 화면까지 확인했으며 사용자 승인을 기다린다. 이전 자동화 fixture는 보존하고 새 익명 `CP5일반검증반`의 연결 전후 보존을 검증한다. Google 보호 우회/자동화 식별 숨김은 하지 않았다. 아래 표는 이전 배포 이력을 포함한다.

preview에는 UI allowlist·공개용 Firebase web config만 포함한다. `worker/`, `.env.local`, `docs/`, Hosting 설정 경로 404; 교사/학생 파일 200·noindex·CORS PASS. `tools/cp5-live-integration.mjs`에서 Google 로그인 자동화를 제거해 HTTP 검사로 바꿨다. 도름스체크 detect/init/scan 결과는 확인 30/미확인 5/해당 없음 1이며 권고를 참고 기록했다. 최종 Pages/production 공개 검증 및 실제 Workspace/Drive/Sheets PASS와 구분한다.

| 항목 | 실행 근거 / 결과 |
|---|---|
| staged Secret 버전 적용 | `6c8116f8-99b6-4a32-92e5-6b67785b5d3c` 100% 적용 후 CP5 코드 배포 |
| 활성 개발 Worker | `84d284a2-9508-4fac-8822-6b3f53660231`; 5분 cron 유지 |
| 실제 설정 검사 | 인증된 API `configured:true`, `configurationError:null` |
| 키 오류 수정 | 유효하지 않은 32바이트 형식을 값 조회 없이 진단; canonical 인코딩 지원 후 새 무작위 개발 키 등록. 이전 설정 `4bf2f5df-3e99-4563-9fc7-87e7fd5de22e` 보존. 성공한 연결 생성 전 수정 |
| 단위·암호화·보안 | 45개 PASS; 기존 44개 + 키 인코딩/길이 거부 |
| 실제 Firebase + Worker API | CP1~4 격리·순위·멱등성·최초 답안·Firestore 직접 접근 거부 PASS |
| 실제 Chromium 게임/교사 | 승인→50문항→원장/순위→교사 상세, 응답 유실·새로고침 포함 PASS |
| Sheets 모의 Chromium | 연결·실패·반복·해제·복귀 PASS; 실계정 결과로 대체하지 않음 |
| 실제 Google 연결 | 같은 익명 교사/테스트 학급 유지 후 Firebase Google 사용자 승인 대기 |
| Workspace / Drive / Sheets | callback/암호화 저장, 네 탭/열, 실원장, 중복 파일/행, 수동·예약 동기화, 재승인/해제·권한/오류 검증 대기 |
| Pages / production | 변경하지 않음 |

`tools/cp5-live-integration.mjs`가 허용 Pages Origin에서 allowlist 정적 파일만 로컬로 제공한다. Firebase/Worker/Google은 실제 요청이며 로그인·승인은 사용자가 한다. 전용 프로필/진행 상태는 Git 제외 `.cp5-test-artifacts/`에 있다. Pages 공개 검증으로 보고하지 않는다. 최신 Secret 목록 명령의 성공 대신 실제 Worker 동작으로 설정을 확인했다.

저장소 https://github.com/subsubT/game · 개발 Firebase `math3-dev` · 개발 Worker `math3-cp3-dev`. 신규 Supabase/Vercel 및 production 리소스는 만들지 않았다. 수동 작업은 [정확한 Google 설정 안내](CHECKPOINT5_GOOGLE_SETUP.md), 후반 배포/복구는 [운영 절차](CHECKPOINT5_RELEASE.md)를 따른다.

## 구현 경계

| 파일 | 역할 |
|---|---|
| `worker/src/sheets.js` | 교사 바인딩/epoch/학급 소유권, OAuth 상태·launch·callback, 연결 조회/해제, 멱등 생성/동기화, 예약 재시도 |
| `worker/src/google-crypto.js` | 독립 AES-256-GCM 토큰 봉투, AAD, PKCE S256, RSA Google ID token의 서명/iss/aud/azp/iat/exp/nonce/sub 검증 |
| `worker/src/google-api.js` | 서버 code 교환, refresh/revoke, Drive appProperties 검색/생성, Sheets 원자 batchUpdate |
| `worker/src/sheet-data.js` | 확정된 정규 완료 회차 → 별명 중심 안내/학생요약/회차/문항 표 |
| `worker/src/index.js` | 기존 POST API/CORS 유지, 고정 GET start/callback 분기, 토큰 값 없는 오류 진단, scheduled 처리 |
| `functions/index.js` → 생성 Worker | 완료 원장 transaction에 내보내기 outbox 기록. 교사 복구 시 Google token/연결 subject 매핑 폐기 |
| `worker/src/firestore-rest.js` | 소유권/lease fence의 REST batchGet. 외부 요청 수 절약 |
| `teacher/dashboard.js` | 익명 교사 유지, 선택 연결/재승인, 학급별 생성/동기화/열기/해제, 상태 표시 |
| `tools/register-google-encryption-key.mjs` | 사용자 실행용, 새 키를 출력/저장하지 않고 미배포 Worker 버전에 등록. 기존 키 덮어쓰기 거부 |

학생 HTML/게임 API는 Google에 의존하지 않는다. Functions fallback의 기존 API는 유지하며 Google endpoint 자체는 Worker 전용이다. Functions 화면에서는 Google 준비 중으로 표시하고 기존 학급 관리가 작동한다. 기존 `index.html`, `1math1.html`, `1math2.html`, 참고 원문은 변경하지 않았다.

## 인증과 비밀값

- Firebase Google provider를 명시적으로 설정한 환경에서는 현재 익명 계정에 `linkWithPopup`으로 Google provider를 연결하고 **uid 불변**을 확인한다. 재방문은 기존 Google 계정으로 관리 공간을 조회한다. 관리 공간을 새로 만들지 않는다. Workspace 권한은 별도의 Worker code flow에서 승인한다. Firebase 제공 로그인 scope와 Worker의 `openid + drive.file` 계약을 구분한다.
- 시작 API는 현재 활성 교사 uid/teacherId/authEpoch를 확인하고 10분의 무작위 state/nonce/PKCE verifier를 서버에 저장한다. state/launch/code 문서 키는 SHA-256 digest이며 PKCE 봉투도 AES-GCM으로 암호화한다. 반환 위치는 설정에 고정된 대시보드 한 곳뿐이다. 교사별 OAuth 발급은 10초 제한을 둔다.
- Pages → Worker 일회용 launch GET을 **최상위 창에서 열어** Secure/HttpOnly/SameSite=Lax `__Host-` cookie를 설정한다. cross-site fetch의 third-party cookie 허용에 의존하지 않는다. Google authorization URL에는 S256 challenge, nonce, offline/consent가 포함된다.
- callback은 launch/state 만료·사용 여부·브라우저 cookie digest·활성 바인딩·epoch·현재 OAuth 시도를 확인하고 **외부 교환 전 transaction으로 state 및 code digest를 소비**한다. 중복 callback과 다른 state의 같은 code를 거부한다. code 교환 실패 후에는 새 승인으로 다시 시작한다.
- Google RSA 서명 검증 후 subject를 확인한다. 연결된 Firebase provider subject가 있으면 같은 subject만 허용한다. 이메일은 키로 사용하지 않는다. 다른 teacherId의 subject 매핑 충돌과 기존 연결 계정 교체는 거부한다. 두 관리 공간 자동 병합/학급 소유권 이전은 구현하지 않았다.
- refresh token은 독립 `GOOGLE_TOKEN_ENCRYPTION_KEY`를 이용한 AES-256-GCM `v1.iv.tag.ciphertext`로만 저장한다. AAD는 목적/teacherId/epoch를 묶는다. access token은 요청 처리 메모리에서만 사용한다. ID/refresh/access token, client secret, provider subject, ciphertext는 대시보드 응답에 보내지 않는다.
- API 호출마다 access token을 서버에서 refresh한다. invalid_grant/401은 `REAUTH_REQUIRED`; 연결을 재승인할 수 있다. revoke는 POST body로 보내고 Secret/token을 URL에 넣지 않는다. 로그는 정해진 오류 코드/단계와 요청 수만 기록하며 스택/원문 외부 오류를 출력하지 않는다.
- 해제는 서버 연결과 활성 subject 매핑을 먼저 폐기하고 이전 OAuth 시도를 무효화한 뒤 revoke를 시도한다. 실패해도 로컬 token은 남기지 않으며 Google 계정 앱 권한에서도 취소하도록 안내한다. 학급별 기존 파일의 서버 참조는 같은 계정 재연결 시 중복 방지용으로 비공개 보존하고, 연결/epoch가 유효하지 않으면 URL도 반환하지 않는다. Drive 파일은 삭제하지 않는다.
- 복구 transaction은 Google 연결/암호문/활성 subject 매핑을 폐기한다. epoch가 바뀌면 이전 pending callback과 진행 중 작업의 후속 호출도 거부된다. 복구는 외부 Google 계정의 권한을 직접 양도하는 동작이 아니다.

## 파일과 행 멱등성

`exportId = SHA256(Firebase projectId + classId + exportVersion)`를 Drive 앱 전용 `math3ExportId` appProperties에 생성 요청과 함께 넣는다. 같은 학급의 version 1 문서는 우선 검색·재연결한다. 조회 시 복수 파일/다음 페이지가 발견되면 멈추고 파일을 임의 삭제하지 않는다.

Firestore의 학급별 lease(10분)와 작업 식별값으로 생성/동기화를 직렬화한다. 외부 요청에는 10초 timeout을 사용하며 각 단계에서 바인딩/연결 version/lease fence를 batchGet으로 재확인한다. 생성 전에 `createUncertain`을 저장한다. 생성 요청의 응답이 유실되면 검색 결과에 문서가 나타나기 전까지 **다시 만들지 않는다**. 명시적인 권한 거부는 파일이 만들어지지 않았으므로 권한 수정 후 재시도할 수 있다. 만료된 lease는 UI에서 실패/재시도 가능한 상태로 표시한다.

동기화는 현재 Firestore 전체 유효 원장에서 결정적으로 재작성한다. `sessionId + gameId + exportVersion`의 HMAC 기반 내보내기 회차 식별과 `questionIndex`의 행 식별을 사용한다. 내보내기 식별은 원장의 학생/교사 ID를 노출하지 않는다. 같은 snapshot을 반복 동기화해도 append 하지 않으므로 행이 늘지 않는다. Google Sheets에서 읽은 값을 Firestore에 반영하는 경로는 없다.

**네 개 앱 관리 탭의 값 지우기와 새 값 입력을 한 Sheets batchUpdate로 적용**한다. typed `stringValue`는 RAW와 같이 문자 그대로 입력하고 `formulaValue`를 만들지 않는다. 사용자 문자열의 `= + - @` 시작도 앞에 `'`를 붙여 방어한다. 별도 개인 메모 탭은 수정하지 않는다. 공개 공유 권한 API는 호출하지 않으며 승인 계정의 Drive에서 생성한다.

## 데이터와 범위

- 안내: 비공개 학급 표시 이름, 별명/완료 기록 범위, 단방향 원장, 관리 탭 재작성/개인 메모 안내.
- 학생요약: 완료 기록이 있는 학생의 게임/학급 별명/최고점/최근 점수/완료 횟수/최근 종료 시각/최초 정답률. 정답률은 기존 계약의 `C/(C+W)`이며 건너뜀을 제외한다. 응답 0개면 ‘응답 없음’.
- 회차: 게임/내보내기 회차 식별/별명/점수/정답·오답·건너뜀/완료/시작·종료 KST/내보내기 버전.
- 문항: 게임/내보내기 회차/문제 번호/유형/문제/단계별 최초 응답/정답/정오/건너뜀/결정적 행 식별/버전.
- **완료된 정규 회차만** 포함한다. 실명, Firebase uid, teacherId, 내부 studentId, 참여코드, 복구 키, 전체 순위 연결 정보는 제외한다. 실명 포함 선택 기능은 구현하지 않았다.
- 여러 게임은 동일 학급 문서의 `gameId` 열로 구분한다. 현재 구현된 게임은 1math3이며 새 게임의 별도 질문 스키마가 추가되면 변환기도 함께 확장해야 한다.
- 기존 서버의 조회 한도를 이용해 학생/회차 각각 200건을 조회한다. 200건이면 잘린 snapshot을 쓰지 않고 `EXPORT_LIMIT`로 **쓰기 전 중단**하므로 현재 안전한 전체 내보내기 한도는 각각 **199건(미완료/연습 포함 원장 조회 기준)**이다. 규모 확대 시 cursor paging/분할 작업을 구현하고 Worker Free CPU/외부 요청 수를 재측정해야 한다.

## 자동 작업과 장애 격리

50번째 확정 답의 Firestore 완료/순위 transaction에 연결된 관리표가 있는 경우 `sheetJobs/{classId}`의 결정적 dirty 표시를 함께 쓴다. 학생 저장 처리에 Google 네트워크 요청은 없다. Google 없는 학급은 이 작업을 만들지 않는다. 수동 동기화도 시작 전에 outbox를 보존한다.

Worker scheduled handler는 5분 주기로 가장 이른 학급 작업 **한 개**를 처리한다. 동일 작업에서 Google 장애가 나면 5분 이후 재시도하고 학급의 실패 코드만 보존한다. 동기화 중 새 회차가 확정되면 dirty 표시가 바뀌어 작업을 남기고, 이미 내보낸 dirty와 일치할 때만 outbox를 삭제한다. 연결 해제/복구 후에는 token을 사용할 수 없으며 남은 작업은 정리한다. 여러 학급이면 큐 대기 때문에 5분보다 오래 걸릴 수 있고 `지금 동기화`도 제공한다.

Google 설정이 없는 scheduled 호출은 DB 접근 전 종료한다. 기존 CP3 Free CPU 10ms 위험은 수용된 상태를 유지하며 **이 CP5 경로의 실제 Cloudflare CPU/하위 요청 수·최대 데이터 성능은 아직 측정하지 않았다**. 목 테스트와 dry-run이 실제 플랫폼 한도 검증을 대신하지 않는다.

## 검증 결과

| 검사 | 2026-10-05 결과 |
|---|---|
| `npm test` 기존 18 + Google/Sheets 26 | **44 PASS** |
| Google crypto/OAuth | 서명·subject·aud·nonce·state 만료/재사용·cookie·허용 callback/return URL·PKCE 전달/거부·code replay·teacher epoch/타 교사 격리 PASS |
| Google token/내보내기 | 암호화/AAD·refresh/revoke·재승인·권한 실패·생성 응답 유실·검색 재연결·중복/동시 생성 차단·반복 행·장애 격리·수식/개인정보 보호 PASS |
| `npm run emulators:worker` | 실제 로컬 Firestore REST transaction, 기존 50문항/순위/교사 권한, 새 OAuth state·암호문·관리표/행 반복·직접 token 문서 접근 거부·복구 폐기 PASS |
| `npm run emulators:test` | 기존 Functions fallback, Auth/Rules/두 교사 격리/채점/멱등/복구 회귀 PASS |
| `npm run emulators:browser` | 기존 CP4 교사/학생 Chromium 50문항·복수 학급/승인·상세·순위·복귀·반응형 회귀 PASS |
| `npm run test:sheets-browser` | Chromium 가짜 Google/Firebase 신원 linking(동일 uid)·Worker API·최상위 cookie·복귀·생성·반복·장애 후 학급 사용·해제·390px/JS error 0 PASS |
| `npm run check:worker` | Wrangler 4.138.0 코드 생성 상태·**dry-run PASS**, 실제 배포 없음 |
| Secret 도우미 | 구문/help 검증, 실제 Secret 등록은 사용자 수동 게이트 이후 |
| 실제 Google provider/OAuth/Drive/Sheets | **미실시 — 사용자 설정 필요** |
| 새 소스의 실제 Worker/Pages/production/도름스체크 | **미실시 — 후반 통합·배포 단계** |

Chromium 모의 검사에서 실제 외부 OAuth 계정이나 API를 호출하지 않는다. Playwright의 자동 redirect hop이 route interception을 우회해 초기 mock 검사가 멈췄고, 테스트 하네스에서만 HTTP redirect를 meta navigation으로 이어 모의 요청을 재포착하도록 수정했다. 제품의 실제 HTTP 303/cookie/Google redirect는 후반 실계정 Chromium에서 별도로 확인한다. 로컬 Emulator 초기 실행의 Windows 임시 경로 EPERM은 로컬 실행 권한으로 해결했다. OS/기관 보안 정책을 바꾸지 않았다.

**종료: 사용자가 API/OAuth 앱·Client Secret 및 Worker Secret을 준비할 때까지 실제 CP5 Google 연동 배포를 하지 않는다. 최종 PASS는 그 이후 실제 전체 통합 증거로만 판정한다.**
