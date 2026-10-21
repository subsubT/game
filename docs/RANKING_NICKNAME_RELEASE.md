# 카드 확인 버튼 중앙 배치·순위 닉네임 — 2026-10-21

대상: https://github.com/subsubT/game · https://subsubt.github.io/game/1math3.html · Firebase `math3-dev` · Worker `math3-cp3-dev`. 기존 Google 연결·Firestore Rules·점수 정책을 유지한다. Supabase/Vercel은 사용하지 않는다.

## 변경

- 기본 학습과 최종 스테이지의 `고른 카드 확인`을 중앙 정렬 actions 컨테이너로 감싼다. 카드 선택과 채점 규칙은 유지한다.
- 학급·전체 순위의 displayAlias에 학생이 등록한 닉네임(privateName)을 표시한다. 이름이 없는 과거 학생만 기존 classAlias를 사용한다. 전체 공개 참여 설정은 유지한다.
- 최고점 갱신, 학생/학급 전체 공개 해제 후 복원, 교사 닉네임 변경에 같은 표시 규칙을 적용한다. 교사의 이름 변경은 존재하는 순위 행의 표시 이름만 트랜잭션으로 갱신하며 해제된 순위 행을 다시 만들지 않는다. 변경 전 학생·순위 스냅샷을 서버 백업에 보관한다.
- 학생·교사 화면의 익명 별명 안내를 닉네임 표시 안내로 고친다. 공개 API 응답은 기존 displayAlias/score/rank/isMe 최소 필드 계약을 유지한다.

## 백업·기존 기록 갱신

Git 제외 `.cp5-test-artifacts/ranking-nickname-20261021/`에 변경 전 소스 ZIP, Worker 설정, 학생 89개·순위 75개·점수 집계 스냅샷과 displayAlias만 복원하는 rollback.json을 보관한다. 개인정보와 인증값은 Git/Pages/로그에 넣지 않는다.

`tools/ranking-nickname-job.mjs`는 기존 Worker 내부의 서버 키로 기존 학급·학생·전체 순위 ID를 대조한다. 일회성 cron 작업으로 표시 이름만 갱신하고 `maintenance/rankingNickname20261021`에 완료 및 연결 근거를 기록한다. 공개 HTTP 관리 API와 새로운 비밀값을 만들지 않는다. 임시 배포 `fb13f174-0fe7-4e35-af50-ab3deaca0484`에서 기존 5분 cron으로 실행한 뒤 최종 배포에서는 호출 코드를 제거한다. 도구 파일은 재현·검사용으로만 남는다. `tools/ranking-nickname-migration.mjs verify`가 모든 기존 순위의 표시 이름과 나머지 필드·학생·집계 불변을 대조한다.

복구가 필요하면 최신 점수·학습 기록은 덮어쓰지 않고 백업된 displayAlias 필드만 검토해 복구한다. 이후 교사가 변경한 닉네임과 경합하지 않도록 최신 문서 시각을 다시 대조한다. 되돌리기는 사용자의 확인 후 수행한다.

## 검증

- 자동 단위·권한·PIN·저장·최종 점수·Sheets 회귀 89개 PASS. 닉네임 표시, 이름 변경, 공개 해제/복원, 일회성 기존 순위 갱신과 점수·원장·집계 불변을 포함한다.
- Chrome 브라우저 저장/기기 이동/기본 50문항/최종 스테이지/교사 상세 검사 PASS. 기본·최종 카드 버튼을 768×1024, 1024×768, 800×1280, 1280×800, 390×844에서 검사: 카드와 버튼 중심 차이 1px 이하, 터치 영역 높이 48px 이상, 가로 넘침 없음.
- 생성물 최신 여부, Worker dry-run, Pages 12파일 allowlist·비밀값 패턴 검사 PASS. 기존 index/1math1/1math2 보존.

공개 게시와 최종 운영 검증 근거는 배포 완료 후 아래에 기록한다.
