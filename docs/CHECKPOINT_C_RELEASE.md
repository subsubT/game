# Checkpoint C — 전체 통합과 실제 서비스 배포

2026-10-14 KST. **검증 진행 중 — 아직 최종 PASS가 아니다.**

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

실제 Google 연결은 기존 승인된 교사 계정에서 유지한다. 이번 가상 학급의 관리표만 생성/동기화하고 중간 회차 제외·완료 문항·중복 없음·비공개 이름 제외를 확인한다. 최종 공개 검사/배포 근거/제한사항은 완료 후 여기에 기록한다.
