# Checkpoint 5 공개 배포·실제 검증

## 2026-10-08 KST 최종 판정 (실제 통합 검사 2026-10-07)

**Checkpoint 5 PASS — 전체 프로젝트 완료. 실제 Pages의 학생·교사·Firebase·Worker·Google OAuth/Sheets 전체 통합, 회귀·접근 통제·Secret 제외 검증을 완료했다.**

기존 `math3-dev` + `math3-cp3-dev` + 기존 OAuth Client를 그대로 실제 공개 서비스에 사용한다. 새 production 리소스/데이터 이전/Secret 변경 없음. 이전의 별도 production 요구는 과거 설계다.

학생 https://subsubt.github.io/game/1math3.html · 교사 https://subsubt.github.io/game/teacher/ . 최종 화면 Pages run [37619924392](https://github.com/subsubT/game/actions/runs/37619924392) success, 공개 코드 `f7bd25a5198bc2083cb2217e6b91a1f20cf4b5bb`. Worker `ca7fbc93-8732-4a84-9b9e-764d6473d14f`, callback 유지/Pages 고정 복귀/5분 cron. Firebase Pages domain 이미 authorized. 이후 문서·검증 도구 변경은 공개 산출물에 영향을 주지 않는다.

| 검사 | 실제 결과 |
|---|---|
| 정적 의존성·제외 | 화면/assets 200·MIME 정상, 두 교사 URL 정상. allowlist 12개. docs/worker/functions/references/환경/증거/config 원본 404 |
| 공개 학생·교사 Chromium | 실제 Pages 다운로드에서 승인→정규 50문항→서버 저장·학급/전체 순위, 응답 유실 재시도·새로고침 복원 PASS(173초), 상태 재시도 수정 후 재검사 PASS(109초). 복수 학급·승인·학생 목록·회차/50문항 상세·공개 설정·복구 키·학생 복귀 티켓·모바일 폭 PASS. Google 미연결 정상. 로컬 HTML route 대체 없음 |
| 실제 Firestore 브라우저 | SDK 직접 읽기/쓰기 모두 permission-denied PASS(14초). 오래된 dashboard selector를 현재 select-class로 맞춰 재검사 |
| 실제 Worker API | 500/490 서버 채점·타 교사/학생/학급 거부·점수 위조·인증/Origin·중복 재시도·순위/공개 토글·경합 PASS 2개(163초) |
| 공개 Origin OAuth 공격 | launch replay·cookie 누락·consumed state·test-only 만료·임의 returnUrl·타 교사 Sheets API 거부 PASS. 만료 변경 대상은 이번 합성 state, 비공개 백업 후 검사 |
| 기존 게임 3개 | 공개 시작·채점·콘솔 오류 없음 PASS(12초). 결과 저장/종료 전 닫아 기존 운영 점수 미작성. 최초 root favicon 404는 data favicon으로 제거 후 재배포 |
| 자동/Emulator | 단위 47/47, Sheets Chromium 1/1, Functions fallback/Auth/Rules 1/1(128초), Worker REST/Sheets 1/1(9초), 교사→학생 Functions Chromium 1/1(196초), Worker dry-run PASS |
| Worker 런타임 | 새로운 합성 익명 계정의 인증 요청 3개 정상. 최종 60초 tail 이벤트 14개(200×8, 204×6), 5xx/내부 오류 0. 원시 URL/query/body/token/log 저장 없음 |
| 자격증명 | tracked source·dist-pages credential patterns PASS. source map/서버/문서/증거/서비스계정/OAuth secret/token 공개 없음. Firebase 웹 apiKey는 공개 config |
| 도름스체크 | 독립 비공개 경로 v0.3.1 detect/init/security scan 완료. 확인 30/미확인 5/해당 없음 1. 헤더·정책·메타 등 권고. 공개 Firebase apiKey는 Secret 노출 아님 |
| 실제 Google 공개 Origin | 공개 teacher의 Google 로그인·기존 공간 복원·수동 sync 후 실제 연결 해제. 원장·학급·기존 파일 유지 및 연결 문서 제거 확인. 공개 teacher→동일 Google 계정 재승인→실제 Worker callback→공개 Pages 연결 완료 PASS. 연결 시각 `2026-10-07T12:19:56.692Z`, 반복 sync 시각 `2026-10-07T12:21:05.305Z`. 기존 teacherId·학급 전체·학생·회차 hash 불변, 같은 Drive 파일과 암호화 연결 구조 확인 |
| 실제 Sheets 데이터·비공개 | Google UI ‘나에게만 공개’. 연결 전/재승인 후 XLSX 읽기 검사 모두 학생요약 2행·회차 2행·문항 100행, 각 500점·고유 문항 100개·비공개 테스트 이름 제외 PASS. 네 필수 탭/열과 빈 기본 시트 보존. 반복 sync 성공, 새 파일 생성 없음 |
| Google 상태 오류·해제 확인 UI | 모의 503을 실제 Chromium에 주입해 설정 미완료로 오인하지 않음·학급 관리 계속·연결 상태 재확인으로 동일 파일 복구 PASS. 해제 확인 전/취소 시 revoke 0, 확인 시 revoke 1 PASS. 최종 공개 앱 내 확인창 표시/취소 및 연결 유지·콘솔 error 0 PASS |

증거/백업/스크린샷/시험 자료는 `.cp5-test-artifacts/final/`에만 저장, Git/Pages 제외. 새 시험 학급/익명 계정/회차 삭제 없음. Google 테스트 앱 경고의 ‘계속’은 본인이 직접 처리했으며 보호를 우회하지 않았다. [복구·한도](CHECKPOINT5_RELEASE.md).

2026-10-08 중단 재개 후 공개 URL·의존성·민감 경로 제외·기존 3게임을 다시 검사해 PASS(10.5초). 재승인된 시험 학급을 다시 읽어 같은 연결·관리표와 class/students/sessions 전체 hash 불변을 확인했다. 공개 산출물 12개·tracked source 93개 credential 검사 PASS.

### 공개 Google 증거와 최종 보완

`public-google-baseline.json`은 해제 전 비공개 백업이다. `public-google-disconnected.json`과 `public-google-restored.json`은 자격증명 없이 보존 여부·새 연결 시각만 기록한다. 원장은 class/students/sessions 전체 canonical hash로 비교하며 Drive 파일 ID도 같다. `public-sheet-before.json`/`public-sheet-after.json`과 두 비공개 XLSX로 연결 전후 행 수·점수·중복·이름 제외를 검증했다. `teacher-public-google-pass.jpg`에 공개 교사 화면의 동기화 완료·학급 보존을 기록했다.

검증 도구는 DB 응답 객체를 assertion 오류에 출력하지 않는다. 고정된 판정 이유만 출력하고 예기치 않은 인증/API 예외도 숨긴다. 자동 승인 검토의 오류 출력 우려를 수정한 후 실제 해제·재승인 판정이 통과했다. 기존 Google Testing 정책과 199회차 한도는 유지하며 아래 과거 preview 결과와 이번 공개 callback 결과를 구분한다.

## 이하 2026-10-05 개발 preview의 실제 Google PASS 이력

2026-10-05. 대상은 Firebase `math3-dev`, Worker `math3-cp3-dev`, 저장소 `https://github.com/subsubT/game.git`이다. 운영 환경을 생성하거나 개발 환경을 승격하지 않았다. 현재 Worker는 `e9bc9633-db9c-457e-aeb6-cbc68f02664d`이며 5분 cron을 유지한다.

19:09 KST 재개 이력: 재승인 callback의 `OAUTH_STATE_INVALID` 원인을 값 노출 없는 상태 메타데이터로 확인했다. 해당 state는 started=true/used=false이며 18:14:36 KST에 만료됐다. 10분 expiry와 HttpOnly cookie 검사를 완화하지 않았다. 브라우저의 만료/재사용 오류는 고정 allowlist 대시보드로만 복귀하고 새 연결을 안내하도록 수정했다. 실제 만료 callback 재로드→고정 대시보드→만료 안내→기존 학생 2명/완료 2회 유지 확인 PASS. JSON API 거부와 임의 redirect 방어를 포함해 단위 47개·Sheets Chromium 회귀 PASS. Secret 변경 없음. 이후 19:14 KST에 새 승인과 동일 파일 복원을 완료했다.

## 실제 통과한 검사

**19:14 KST 재승인 완료 → 실제 Google 개발 통합 PASS.** 같은 teacherId·학급·기존 Drive 파일을 유지했고, 추가 생성 요청 두 번 및 원장 재동기화 후 학생요약 2행/회차 2행/문항 100행·고유 문항 식별자 100개·각 500점·비공개 이름 제외를 재확인했다. 연결 문서에는 새 연결 시각과 유효한 암호문 구조가 저장됐다. Secret 값은 읽거나 출력하지 않았다. 실제 공개 Pages 전체 통합은 [Pages 준비와 공개 검사](CHECKPOINT5_PAGES_PREPARATION.md)의 운영 설정 조건이 남아 있다.

| 검사 | 실행 근거 / 결과 |
|---|---|
| Google OAuth 시작·승인·callback·교환 | 사용자 Test user 승인 후 실제 연결 완료. 최초 연결 `2026-10-05T08:28:34.087Z`, 해제 후 재승인 연결 `2026-10-05T10:14:06.452Z` |
| 서버 암호화 저장·refresh 사용 | 연결 상태 connected, 최소 두 scope, AES-256-GCM v1 envelope 구조 확인. 실제 Drive 생성/Sheets 쓰기에서 refresh 경로 사용. 값 조회·출력 없이 판정만 기록 |
| 익명 교사 보존 | 최초 개발 검증 화면에서 Google 로그인 후 uid·teacherId·학급 유지 PASS. 기존 `CP5일반검증반`과 참여 코드 유지 |
| 실제 Drive 생성·열기 | 교사 화면에서 생성하고 ‘스프레드시트 열기’로 실제 파일 열기. Google UI ‘나에게만 공개’ 확인 |
| 필요한 탭·열 | 안내 2열, 학생요약 7열, 회차 11열, 문항 11열. Google이 만든 빈 기본 시트는 보존 |
| 실제 데이터 | 가상 학생 두 명의 실제 정규 50문항 완료 결과 각 500점. 학생요약 2행, 회차 2행, 문항 100행. 정답률 100%, 별명만 내보냄. 비공개 테스트 이름 없음 |
| 반복 생성·동기화 | createOrSelectSheet 두 차례 추가 실행 후 같은 파일 URL·synced PASS. XLSX 읽기 검사: 문항 식별자 100개 모두 고유, 행 수 불변 |
| 실제 Google API 실패 격리 | 테스트 export 참조를 백업 후 존재하지 않는 ID로 변경. 실제 `SHEET_UNAVAILABLE`·동기화 실패 표시 확인. 실패 중 두 번째 50문항 결과 저장 성공. 기존 원장 canonical hash 불변. 원래 참조 복원 후 같은 파일에 두 회차 재동기화 PASS |
| 재인증 필요 UI | 테스트 연결의 status만 백업 후 reauth로 변경. 실제 ‘Google 재인증 필요’·‘Google 다시 승인’ 확인·화면 저장. 암호문/Google 권한 유지 후 status 복원. 실제 grant 만료·철회와 구분 |
| 실제 연결 해제 | disconnectSheets 실행 후 disconnected=true, oldUrlHidden=true, revocationPending=false. 실제 Firestore 연결 문서 삭제 확인. 학급·학생 2명·완료 2회와 Drive 파일 보존 |
| 실제 해제 후 재승인 | 새 승인 후 같은 teacherId·학급·파일 복원. 추가 생성 두 번 및 실제 Sheets 재작성 후 2회차/100문항·중복 없음 PASS |
| 실제 예약 Worker | 실제 테스트 학급의 outbox job을 별도 등록하고 수동 sync 없이 기다림. 10:21:05 UTC 별도 cron 실행에서 lastSyncedAt 갱신, synced, job 삭제 확인. 기존 실제 Firestore 결과를 같은 파일에 재작성 |
| 실제 접근·OAuth 공격 거부 | 새 테스트 교사의 타 학급 상태/생성/동기화 403, 임의 returnUrl 거부, launch 재사용·cookie 누락·consumed state 재사용·테스트 state 만료 거부 |
| 자동·회귀 검사 | 최신 단위/보안 47개, Sheets 모의 Chromium 1개, Worker REST Emulator 재검증 PASS. CP4 실제 Chromium Emulator 교사 승인→50문항→대시보드 회귀 PASS(160초). 이전 실제 Worker 학생/교사 회귀 근거도 유지 |

## 수정과 검증 범위

OAuth 시작의 실제 `TypeError`는 Cloudflare native fetch가 REST adapter의 this를 수신한 것이 원인이었다. FirestoreRest와 GoogleApi의 fetcher를 일반 호출 closure로 수정했다. receiver를 검사하는 회귀 테스트를 추가했고 실제 OAuth 시작 303 및 실제 전체 연결을 다시 통과했다. 진단 로그는 고정 단계/오류 이름/코드만 허용하며 URL, cookie, 요청 본문, token, Secret, 외부 오류 전문을 출력하지 않는다.

다른 Google subject·subject 소유 충돌·code 재사용·인증 철회/재연결 경합은 단위 및 REST Emulator에서 검사했다. 실제 두 번째 Google 계정으로 승인하거나 Google의 7일 Testing grant 만료를 기다린 검사는 수행하지 않았다. 199회차 최대 규모와 Worker Free CPU/quota 실측은 별도 운영 조건이다.

## 남은 조건

실제 Google 개발 통합은 PASS다. 기존 Pages는 새 학생/교사 파일이 404이며 운영용 Firebase/Worker/별도 OAuth Client 설정이 남았다. Pages allowlist 빌드와 수동 workflow를 준비했지만 실행/게시하지 않았다. 사용자의 새 production 생성·math3-dev 승격 금지 지시를 유지한다. **CP5 전체 최종 PASS는 실제 운영 Pages 전체 통합 검증 완료 전까지 보류한다.**

검증용 preview는 `https://math3-dev--cp5-google-q3ym6qkw.web.app/game/teacher/index.html`이며 1일 만료 채널 `cp5-google`이다. CLI/브라우저 증거·복원 기록·검증용 XLSX는 비공개 Git 제외 경로에만 둔다. 학생/사용자 token, Secret, 서비스 계정 JSON은 문서·Git·로그에 기록하지 않는다.
