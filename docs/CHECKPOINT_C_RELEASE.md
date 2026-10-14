# Checkpoint C — 전체 통합과 실제 서비스 배포

2026-10-14 KST. **Checkpoint C PASS — A+B 통합, 실제 Firebase/Worker/Pages/Google 검증과 공개 배포 완료.**

## 대상과 포함 관계

저장소 `https://github.com/subsubT/game`, Firebase `math3-dev`, Worker `math3-cp3-dev`를 유지한다. 학생 https://subsubt.github.io/game/1math3.html · 교사 https://subsubt.github.io/game/teacher/ . 신규 프로젝트·Supabase·Vercel·Secret 변경·Firestore Rules 변경은 없다.

시작 main `2f8cd4e47e183fa5ef1ee7ace96a1720b74266d6`는 A `7b89e2c`와 B `992a3e1`의 조상이다. B는 A를 포함하므로 중복 병합 없이 `codex/checkpoint-c-integration`에서 안정화한다. 기존 index/1math1/1math2 소스는 변경하지 않는다. 1MATH3는 사용자 결정대로 시간 제한이 없다.

## 백업과 배포·복구 순서

운영 변경 전 Firestore의 모든 현재 루트 컬렉션과 students/sessions/entries 컬렉션 그룹(빈 순위 부모 아래 문서 포함) 3,231개를 Git 제외 `.cp5-test-artifacts/checkpoint-c/firestore-before.json`에 저장했다. SHA-256 `9ba86f04d86c727f71023a1f75d023bf99506751410dd981df602c1d39fdd4de`. 운영 개인정보·암호문·검증 자료가 들어가는 백업을 Git/Pages/로그에 넣지 않는다. `tools/checkpoint-c-backup.mjs preserved`로 원래 학급/학생/회차/Google 연결의 필드를 비교한다. C검증1014는 이번에 만든 명시적 가상 fixture이며 보존 비교와 전체 공개 순위에서 제외한다.

기존 Worker `7ed319e3-7095-40a4-90aa-1ff0c7484c8c`, 설정, 당시 main ZIP과 A+B 호환 소스 ZIP을 같은 비공개 경로에 보관했다. 기존 deny-all Rules/Google callback/Sheets cron은 유지한다. Worker 먼저 적용하고 새 Pages를 게시한다. 새 HTML은 학생 bundle/CSS와 교사 JS에 버전 쿼리를 사용해 예전 캐시와 혼합을 줄인다. 이미 열린 예전 학생 화면은 새로고침해야 새 PIN 가입 화면을 사용한다. 배포 사이 구형 PIN 없는 신규 가입 API는 거부하며 인증을 완화하지 않는다.

**PIN 전환 또는 자유 저장이 발생한 이후에는 예전 Worker를 그대로 롤백하지 않는다.** PIN 버전/인증 폐기, paused 상태와 null expiry를 이해하는 A+B 호환 소스 또는 이를 보존한 수정본을 재배포한다. 화면만 되돌릴 때도 이전 PIN 없는 가입 화면을 게시하지 않는다. 개별 DB 복원은 현재 UID/바인딩/포인터·최신 원장과 대조하고 사용자 확인 후 수행한다. PIN 버전은 단조 증가, 기존 인증/티켓은 재활성화하지 않는다. 전체 백업으로 최신 학습 결과를 덮어쓰거나 초기화하지 않는다.

## 검증 범위

단위/보안 78개, 후보 Chromium 자유 저장 회귀, 실제 Firestore REST Emulator 3개 및 Worker dry-run/생성물/Pages allowlist/credential 검사 PASS. A/B에서 통과한 Functions 전체 검사는 소스 변경이 없어 불필요하게 반복하지 않는다.

실제 기존 Worker에 C전환가상 학생과 한 문항 정답을 만들었다. 새 Worker에서 원래 활성 기기로 PIN을 설정하고 ID/별명/답안/10점·기기 이전·경합·다른 학생 접근·교사 PIN 변경/초기화/티켓/삭제·PIN 잠금을 검사한다. 별도 가상 교사/학급은 권한 경계 검사에만 사용한다. 학생 삭제 검사는 해당 가상 학생의 소속 해제이며 학습 원장/복원 백업은 보존한다. 기존 이용자 데이터 정리는 하지 않는다.

후보/공개 Chromium은 실제 Firebase SDK와 배포 Worker를 사용해 신규 등록 → 포털 → 첫 답 전 저장(응답 유실 재시도) → 로그아웃 → 다른 기기 PIN 로그인 → 입력 복원 → 답변 응답 유실 복구 → 3문항 저장(전송 실패 재시도) → 새로고침/이어하기 → 50문항/500점/학급 순위를 검사한다. 후보 화면만 로컬 allowlist를 응답하며 Firebase/Worker를 모의하지 않는다. 공개 검사는 실제 Pages를 그대로 다운로드한다.

실제 Google 연결은 기존 승인된 교사 계정에서 유지한다. 이번 가상 학급의 관리표만 생성/동기화하고 중간 회차 제외·완료 문항·중복 없음·비공개 이름 제외를 확인한다. 공개 Google Sheets는 연결을 새로 만들거나 해제하지 않고 기존 교사 승인으로 검증했다.


## 최종 실제 결과와 배포

- 기능 배포 main: `ddc64a4e8e5c4cf452faa8b9c175de75f7607e84`, [Pages run 38506049365](https://github.com/subsubT/game/actions/runs/38506049365) success.
- 교사 메뉴 보완 배포: `cbc345964418bffe7f799f5c4c1460930b7b0a84`, [Pages run 38506800880](https://github.com/subsubT/game/actions/runs/38506800880) success. 낮은 창에서 고정 sidebar의 Sheets 버튼이 가려지는 문제를 실제 브라우저에서 발견했다. 데스크톱 메뉴 높이를 viewport에 맞춰 내부 스크롤하고 모바일에서는 일반 문서 흐름을 유지한다. 새 CSS 경로를 적용한 실제 공개 화면에서 높이 662px/내용 933px/overflow auto와 마우스 동기화 성공을 확인했다.
- Worker: `182c68a9-7891-4890-881f-76de81a805c3`. Firebase/Secret/Rules/OAuth callback/5분 cron 변경 없음.
- 공개 학생: https://subsubt.github.io/game/1math3.html · 공개 교사: https://subsubt.github.io/game/teacher/ . 공개 9개 화면/자산 내용이 main Git 원문과 일치하며 12개 allowlist 외 서버/문서/테스트/환경/증거 경로는 404다.
- 문서 최종 commit/push 후에도 동일 공개 산출물을 게시한다. 최종 main HEAD와 run은 GitHub 이력/최종 보고에서 확인할 수 있다. 문서는 Pages artifact에 포함하지 않는다.

| 대상 | 근거와 결과 |
|---|---|
| 단위·보안/변경 영향 회귀 | 78개, 자유 저장 후보 화면, 실제 REST Emulator 3개, Worker dry-run/생성 최신/Secret 검사 PASS |
| 기존 학생 전환 | 배포 전 원래 Worker에서 만든 1문항 정답 회차를 새 Worker에서 동일 기존 인증으로 PIN 설정. 같은 별명/회차/답안/10점 보존, 다른 기기로 포인터 이전 PASS |
| 실제 API 무결성 | 동시 같은 save 요청 ID의 동일 revision, 오래된 revision 충돌, 이전 기기 폐기, 타 학생 저장·조회 거부, 타 교사 상세 거부 PASS |
| 교사 관리 | 가상 학생 이름 변경, PIN 변경 후 인증 폐기, reset/새 복귀 티켓/PIN 재설정, 가상 소속 삭제 후 거부 PASS. 삭제 전 서버 백업/학습 원장 유지 |
| PIN·인증 우회 | 5회 연속 오답 후 맞는 PIN도 거부, 무인증 401/위조 Firebase 토큰 401/다른 Origin 403, 타 UID 및 위조 roster grant, 교사 학생 역할 우회 거부 PASS |
| 실제 후보 학생 전체 | 실제 Firebase SDK/Worker, 로컬 후보 Pages 화면에서 50문항 500점, 약 294초 PASS |
| 실제 공개 학생 전체 | 실제 Pages HTML/자산, 신규 이름/PIN → 게임 포털 → 첫 답 전 저장 → 응답 유실 같은 ID 재시도 → 로그아웃 → 별도 브라우저 context 로그인 → 숫자 입력 복원 → 답변 응답 유실 복구 → 3문항 저장 전송 실패·재시도 → 새로고침·이어하기 → 50문항 500점·학급 순위, 약 165초 PASS. 시간 제한/expiry 없음 |
| 공개 교사 상세 | 500점 완료 회차 50문항 상세, 10점 중간 저장/이어하기 회차 1문항 상세 구분 PASS. 콘솔 error 0 |
| 실제 Google Sheets | 기존 Google 연결·원래 파일 보존. 가상 C 학급에 별도 비공개 관리표 생성, 중간 회차만 있을 때 요약/회차/문항 0행 확인. 완료 후 실제 sync·XLSX 검사: 요약 2행/회차 2행/문항 100행, 각 500점·고유 문항 100개·중간 회차와 실제 이름 제외 PASS. 반복 sync는 같은 파일 유지. Google UI ‘나에게만 공개’, 네 필수 탭과 빈 기본 시트 유지 |
| 기존 원장·순위 보존 | 최초 보존 161개, 최종 기존 class/student/session/Google 연결/순위 항목/점수 집계 242개 필드가 비공개 백업과 동일 PASS. 운영 학생·원장 삭제/초기화 없음 |
| 기존 게임·Rules | 공개 index/1math1/1math2 시작·채점·콘솔 오류 없음, 기존 게임 결과 미작성. 실제 Firebase SDK 직접 읽기/쓰기 permission-denied PASS |
| Worker 관찰 | 60초 실제 요청 20개(200×12/204×7/의도한 권한 거부 403×1), 인증 probe 3회 성공, 5xx/내부 오류 0 |
| 공개/Secret 제외 | 공개 12파일 allowlist, Git/산출물 credential patterns PASS, 기존 게임 3개가 시작 main과 동일. 비밀키/서비스계정/token/학생 개인정보/QA/백업 공개 제외 |
| 도름스체크 v0.3.1 | 독립 빈 증거 폴더에서 detect/init/security scan. 확인 29/미확인 6/해당 없음 1, 위험 실패 0. Pages 헤더·메타·정책/연락처와 공개 정적 파일의 CORS * 권고. 인증 Worker는 별도 Origin/토큰/소유권 거부와 Rules 실제 검증으로 확인 |

검사 자료는 Git 제외 `.cp5-test-artifacts/checkpoint-c/`에 보관한다. 실제 교사 브라우저는 기존 가상 CP5 계정과 C 검증 학급만 이용했다. 새 테스트 익명 계정/학급/학습 기록은 검사 이력으로 남기며, 삭제 검사는 별도 가상 학생 소속만 해제했다. 원래 학급과 파일을 합치거나 지우지 않았다. 도름스체크 때문에 전역 훅/차단 기능/새 패키지 의존성을 추가하지 않았다.

## 운영상 제한

학급 코드를 아는 사람은 요구된 이름 선택 흐름상 최소 명단을 볼 수 있다. 4자리 공유 코드가 구성원 신원을 증명하지는 않는다. 한 학생은 최신 PIN 로그인 기기에서만 활성 상태이고 이전 기기는 다시 PIN 로그인해야 한다. PIN 5연속 오답 잠금은 교사가 변경/초기화해야 해제된다. 코드/PIN 제한은 학교 공유 IP의 반복 요청에도 적용된다.

이미 채점된 답안은 서버에 자동 보존된다. 미확정 숫자/카드는 같은 기기의 로컬 초안이며, 다른 기기로 이동할 때는 서버에서 확인된 수동 저장이 필요하다. 저장 실패 안내 시 재시도 또는 서버 상태 다시 읽기를 사용한다. 기존 만료된/완료 회차는 재개하지 않으며, 아직 자유 저장 모델로 전환하지 않은 예전 회차는 원래 24시간 만료 규칙을 유지한다.

Google Testing/Test user 정책과 내보내기 199학생/199회차 한도는 기존과 같다. 실제 두 번째 Google 계정/한도 최대 규모/학교 전체 동시 사용·무료 CPU/quota를 장기간 측정한 검사는 아니다. Sheets 실패가 원장 저장을 막지 않는 기존 분리 구조와 cron은 유지했다. 정적 Pages의 추가 보안 헤더는 Pages 제공 방식의 기존 권고이며 Secret·인증 권한 검사의 대체가 아니다. A의 salt/HMAC pepper는 짧은 PIN을 서버 Secret 보호에 의존해 검증하며 일반 비밀번호용 느린 KDF 충족을 주장하지 않는다.
