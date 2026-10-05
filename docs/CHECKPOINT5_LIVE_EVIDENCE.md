# Checkpoint 5 실제 Google 개발 통합 검증

2026-10-05. 대상은 Firebase `math3-dev`, Worker `math3-cp3-dev`, 저장소 `https://github.com/subsubT/game.git`이다. 운영 환경을 생성하거나 개발 환경을 승격하지 않았다. 현재 Worker는 `9e886193-a20c-4817-9139-43329cb6c07d`이며 5분 cron을 유지한다.

## 실제 통과한 검사

| 검사 | 실행 근거 / 결과 |
|---|---|
| Google OAuth 시작·승인·callback·교환 | 사용자 Test user 승인 후 실제 연결 완료. Firestore 연결 시각 `2026-10-05T08:28:34.087Z` |
| 서버 암호화 저장·refresh 사용 | 연결 상태 connected, 최소 두 scope, AES-256-GCM v1 envelope 구조 확인. 실제 Drive 생성/Sheets 쓰기에서 refresh 경로 사용. 값 조회·출력 없이 판정만 기록 |
| 익명 교사 보존 | 최초 개발 검증 화면에서 Google 로그인 후 uid·teacherId·학급 유지 PASS. 기존 `CP5일반검증반`과 참여 코드 유지 |
| 실제 Drive 생성·열기 | 교사 화면에서 생성하고 ‘스프레드시트 열기’로 실제 파일 열기. Google UI ‘나에게만 공개’ 확인 |
| 필요한 탭·열 | 안내 2열, 학생요약 7열, 회차 11열, 문항 11열. Google이 만든 빈 기본 시트는 보존 |
| 실제 데이터 | 가상 학생 두 명의 실제 정규 50문항 완료 결과 각 500점. 학생요약 2행, 회차 2행, 문항 100행. 정답률 100%, 별명만 내보냄. 비공개 테스트 이름 없음 |
| 반복 생성·동기화 | createOrSelectSheet 두 차례 추가 실행 후 같은 파일 URL·synced PASS. XLSX 읽기 검사: 문항 식별자 100개 모두 고유, 행 수 불변 |
| 실제 Google API 실패 격리 | 테스트 export 참조를 백업 후 존재하지 않는 ID로 변경. 실제 `SHEET_UNAVAILABLE`·동기화 실패 표시 확인. 실패 중 두 번째 50문항 결과 저장 성공. 기존 원장 canonical hash 불변. 원래 참조 복원 후 같은 파일에 두 회차 재동기화 PASS |
| 재인증 필요 UI | 테스트 연결의 status만 백업 후 reauth로 변경. 실제 ‘Google 재인증 필요’·‘Google 다시 승인’ 확인·화면 저장. 암호문/Google 권한 유지 후 status 복원. 실제 grant 만료·철회와 구분 |
| 실제 연결 해제 | disconnectSheets 실행 후 disconnected=true, oldUrlHidden=true, revocationPending=false. 실제 Firestore 연결 문서 삭제 확인. 학급·학생 2명·완료 2회와 Drive 파일 보존 |
| 실제 접근·OAuth 공격 거부 | 새 테스트 교사의 타 학급 상태/생성/동기화 403, 임의 returnUrl 거부, launch 재사용·cookie 누락·consumed state 재사용·테스트 state 만료 거부 |
| 자동·회귀 검사 | 단위/보안 46개, Sheets 모의 Chromium 1개, Worker REST Emulator 재검증 PASS. CP4 실제 Chromium Emulator 교사 승인→50문항→대시보드 회귀 PASS(160초). 이전 실제 Worker 학생/교사 회귀 근거도 유지 |

## 수정과 검증 범위

OAuth 시작의 실제 `TypeError`는 Cloudflare native fetch가 REST adapter의 this를 수신한 것이 원인이었다. FirestoreRest와 GoogleApi의 fetcher를 일반 호출 closure로 수정했다. receiver를 검사하는 회귀 테스트를 추가했고 실제 OAuth 시작 303 및 실제 전체 연결을 다시 통과했다. 진단 로그는 고정 단계/오류 이름/코드만 허용하며 URL, cookie, 요청 본문, token, Secret, 외부 오류 전문을 출력하지 않는다.

다른 Google subject·subject 소유 충돌·code 재사용·인증 철회/재연결 경합은 단위 및 REST Emulator에서 검사했다. 실제 두 번째 Google 계정으로 승인하거나 Google의 7일 Testing grant 만료를 기다린 검사는 수행하지 않았다. 199회차 최대 규모와 Worker Free CPU/quota 실측은 별도 운영 조건이다.

## 남은 조건

실제 연결 해제·Google revoke 성공 응답 검사는 통과했다. 현재 재연결의 Google 계정 선택/권한 재승인을 사용자에게 맡겼다. 재승인 후 동일 파일·100문항 복원 검사를 완료해야 실제 Google 개발 통합 최종 PASS로 판정할 수 있다. 이후에 GitHub Pages 최종 공개 검증을 진행한다. 새 production 생성과 math3-dev 승격은 승인 범위에서 제외한다.

검증용 preview는 `https://math3-dev--cp5-google-q3ym6qkw.web.app/game/teacher/index.html`이며 1일 만료 채널 `cp5-google`이다. CLI/브라우저 증거·복원 기록·검증용 XLSX는 비공개 Git 제외 경로에만 둔다. 학생/사용자 token, Secret, 서비스 계정 JSON은 문서·Git·로그에 기록하지 않는다.
