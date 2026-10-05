# Checkpoint 5 실제 Google 개발 통합 검증

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
