# 카드 확인 버튼 중앙 배치·순위 닉네임 — 2026-10-21

대상: https://github.com/subsubT/game · https://subsubt.github.io/game/1math3.html · Firebase `math3-dev` · Worker `math3-cp3-dev`. 기존 Google 연결·Firestore Rules·점수 정책을 유지한다. Supabase/Vercel은 사용하지 않는다.

## 변경

- 기본 학습과 최종 스테이지의 `고른 카드 확인`을 중앙 정렬 actions 컨테이너로 감싼다. 카드 선택과 채점 규칙은 유지한다.
- 학급·전체 순위의 displayAlias에 학생이 등록한 닉네임(privateName)을 표시한다. 이름이 없는 과거 학생만 기존 classAlias를 사용한다. 전체 공개 참여 설정은 유지한다.
- 최고점 갱신, 학생/학급 전체 공개 해제 후 복원, 교사 닉네임 변경에 같은 표시 규칙을 적용한다. 교사의 이름 변경은 존재하는 순위 행의 표시 이름만 트랜잭션으로 갱신하며 해제된 순위 행을 다시 만들지 않는다. 변경 전 학생·순위 스냅샷을 서버 백업에 보관한다.
- 학생·교사 화면의 익명 별명 안내를 닉네임 표시 안내로 고친다. 공개 API 응답은 기존 displayAlias/score/rank/isMe 최소 필드 계약을 유지한다.

## 백업·기존 기록 갱신

Git 제외 `.cp5-test-artifacts/ranking-nickname-20261021/`에 변경 전 소스 ZIP, Worker 설정, 학생 89개·순위 75개·점수 집계 스냅샷과 displayAlias만 복원하는 rollback.json을 보관한다. 개인정보와 인증값은 Git/Pages/로그에 넣지 않는다.

`tools/ranking-nickname-job.mjs`는 기존 Worker 내부의 서버 키로 기존 학급·학생·전체 순위 ID를 대조한다. 일회성 cron 작업으로 표시 이름만 갱신하고 `maintenance/rankingNickname20261021`에 완료 및 연결 근거를 기록한다. 공개 HTTP 관리 API와 새로운 비밀값을 만들지 않았다. 처음 순차 처리에서 Worker 요청 횟수 한도를 확인해, 백업된 학생 경로를 비공개 작업 문서에 등록하고 학생/순위 읽기를 묶은 하나의 트랜잭션으로 처리했다. 전체 대상 개수가 다르면 변경을 확정하지 않는다. 임시 배포 `3c4d26dc-58ce-4806-988a-1a2569edefa0`의 기존 5분 cron에서 완료한 뒤 최종 배포에서는 호출 코드를 제거했다. 도구 파일은 재현·검사용으로만 남는다. `tools/ranking-nickname-migration.mjs verify`로 전체 기존 순위 75건의 표시 이름과 나머지 필드·학생 89건·집계 불변을 실제 대조해 PASS. 표시 필드 변경은 66건이며, 이름이 없는 과거 기록 등 기존 별명을 유지하는 9건은 값이 같다.

복구가 필요하면 최신 점수·학습 기록은 덮어쓰지 않고 백업된 displayAlias 필드만 검토해 복구한다. 이후 교사가 변경한 닉네임과 경합하지 않도록 최신 문서 시각을 다시 대조한다. 되돌리기는 사용자의 확인 후 수행한다.

## 검증

- 자동 단위·권한·PIN·저장·최종 점수·Sheets 회귀 89개 PASS. 닉네임 표시, 이름 변경, 공개 해제/복원, 일회성 기존 순위 갱신과 점수·원장·집계 불변을 포함한다.
- Chrome 브라우저 저장/기기 이동/기본 50문항/최종 스테이지/교사 상세 검사 PASS. 기본·최종 카드 버튼을 768×1024, 1024×768, 800×1280, 1280×800, 390×844에서 검사: 카드와 버튼 중심 차이 1px 이하, 터치 영역 높이 48px 이상, 가로 넘침 없음.
- 생성물 최신 여부, Worker dry-run, Pages 12파일 allowlist·비밀값 패턴 검사 PASS. 기존 index/1math1/1math2 보존.

## 공개 배포·최종 검증 PASS

- 기능 commit `3ec3daabd7dc3d4483852eebabceae2fdbd3042c`, [Pages run 39534689626](https://github.com/subsubT/game/actions/runs/39534689626) success. 최종 Worker `36b19530-b431-49d6-a438-1c3ffb29c3e3`: 일회성 유지보수 호출 제거, 원래 5분 cron 유지. 이 문서와 최종 검사 도구 반영 commit도 같은 Pages workflow로 게시한다.
- 실제 공개 파일 11개 HTTP 200 및 후보 산출물 일치 PASS. index/1math1/1math2는 기존 Git blob과 바이트 동일. 새 유지보수 도구·문서·비공개 백업 경로 HTTP 404.
- 실제 공개 Chrome: 768×1024, 1024×768, 800×1280, 1280×800, 390×844에서 카드/확인 버튼 중심 오차 1px 이하, 가로 넘침 없음. 태블릿 터치로 두 카드 선택→확인→정답 피드백 PASS. 실제 기기의 Chrome 앱을 직접 조작한 검사는 아니며 설치된 Chrome의 모바일/터치 환경 모사다. 기본·최종 스테이지는 별도 브라우저 회귀에서 모두 확인했다.
- 실제 전체 순위 응답을 백업된 등록 닉네임과 대조하고 displayAlias/score/rank/isMe 최소 응답 필드를 확인했다. 기존 가상 학생의 현재 서버 로그인 닉네임과 실제 학급 순위 `(나)` 표시 일치 PASS. 운영 순위에 시험 점수를 추가하지 않았다.
- 실제 새 비소속 계정의 학급 순위/공개 설정 변경 거부, 인증 없는 순위 API 401, 외부 Origin 403, Firestore 직접 읽기·쓰기 403 PASS. Rules와 역할/소속 경계는 유지했다.
- 최종 Worker 60초 관찰: 15이벤트, HTTP 200×10/OPTIONS 204×5, 인증 probe 3개 성공, 서버 5xx/내부 오류 0. 공개 브라우저 console/pageerror/서버 5xx 0.
- 도름스체크 v0.3.1 detect→init→scan 완료: 확인29/미확인6/해당없음1, 위험 실패0. 기존 Pages 보안 헤더·정책/연락처·메타 정보와 정적 파일 CORS 권고가 남는다. 인증 Worker의 Origin·토큰·학급 권한과 Firestore 거부는 별도의 실제 검사로 확인했다. 검사가 전체 안전을 보증하지 않으며 전역 설치·훅·배포 차단 기능은 추가하지 않았다.

비공개 근거: `verification.json`, `public-verification.json`, `access-verification.json`, `final-runtime-summary.json`, `public-card-768.png`, `public-card-1024.png`, `dorms-check/.dorms-check/REPORT.md`. 모두 Git/Pages 제외.
