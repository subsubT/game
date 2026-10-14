# Checkpoint B — 게임 선택과 자유 저장

기준일: 2026-10-14 KST. **Checkpoint B PASS — 구현 및 개발 환경 검증 완료.** 이 문서는 C의 인계 기준이다. A의 인증/학생 관리 구조를 그대로 확장했다. 실제 공개 서비스 PASS는 C에서 판정한다.

- 저장소: https://github.com/subsubT/game
- A 시작점: `7b89e2cc9e0d113c0f4450c9bfc28dececf8e3b4`, `codex/student-pin-checkpoint-a`
- B 개발 브랜치: `codex/game-save-checkpoint-b`
- Firebase: `math3-dev`; Worker: `math3-cp3-dev`
- API: https://math3-cp3-dev.subsubt-math3-dev.workers.dev
- 학생/교사: https://subsubt.github.io/game/1math3.html / https://subsubt.github.io/game/teacher/
- 기존 Google OAuth/Drive/Sheets 유지. Supabase/Vercel/새 프로젝트 사용 없음.
- **main 병합, 실제 Worker/DB/Rules/Pages/Google 변경 또는 공개 배포를 하지 않았다.** Pages 산출물 생성과 Worker dry-run은 로컬 검사다.

## 학생 흐름

PIN 로그인 → 게임 선택 → 1MATH3 선택 → 기존 50문항 게임. 진행 중이거나 저장한 회차가 있으면 카드에 푼 문항 수와 ‘이어서 하기’를 표시한다. 로그인/새로고침/포털 조회 자체는 새 게임을 만들거나 게임을 자동 실행하지 않는다. 새로고침 후에는 게임 선택에서 이어하기를 누른다. 기존 친구들 순위와 전체 등록 설정도 포털에서 조회/변경할 수 있다.

문제를 풀거나 숫자 입력/카드 선택/피드백을 보는 중에 **저장하고 쉬기** 또는 **게임 선택으로**를 누를 수 있다. 문항 수 제한이 없다. 서버 확인 후에만 저장 완료 또는 포털로 이동한다. 저장 후 로그아웃하거나 다른 기기에서 같은 학생의 PIN으로 로그인하고 이어하기를 누르면 같은 회차/문제/점수와 아직 확정하지 않은 입력을 복원한다. 게임 선택을 위해 다시 로그인할 필요는 없다.

‘이번 게임 끝내기’는 기존처럼 최종 미완료로 종료하며 다시 이어갈 수 없다고 안내한다. ‘저장하고 쉬기’는 회차를 종료하지 않는다. 끝까지 푼 완료 기록과 순위 반영은 기존과 같다. 비로그인 연습은 기존처럼 해당 기기의 모의 저장이며 다른 기기/공식 순위와 구분한다.

## 시간과 보존 정책 — 사용자 확정

사용자가 질문에 **‘현재처럼 시간 제한 없음’**으로 답했다. 1math3에 5분 제한을 추가하지 않는다. 기존 1math2의 5분 게임과 HTML/로직은 수정하지 않는다. 저장/재개는 `timer: { policy: 'unlimited', remainingMs: null }`을 반환하며 클라이언트가 시간/점수/진행 위치를 설정할 수 없다.

새 1math3 회차는 `storageVersion:2`, `expiresAt:null`로 생성한다. 24시간 후 무조건 만료되던 기술적 세션 기한을 새 회차에는 두지 않아 며칠 뒤에도 이어갈 수 있다. 기존 만료 전 회차는 첫 수동 저장 시 변경 전 전체 문서를 `sessionProgressBackups`에 남기고 동일 ID/문제/답안/점수로 2형식에 전환한다. 이미 종료/완료/만료된 과거 기록은 다시 열거나 새 점수로 재투영하지 않는다. 기존 활성 회차는 수동 저장 전까지 원래 만료를 적용한다.

회차 시작 시각/시작 월/교육과정·채점 버전은 재개 때 바꾸지 않는다. 오래 쉬어도 기존 시작 월의 순위 규칙을 유지한다. 학생 삭제·교사 PIN 변경 등의 권한 해제는 A와 동일하게 즉시 검사한다.

## 데이터와 API

기존 `classes/{classId}/sessions/{sessionId}`, 문항별 answers, 원장과 학생별 activeSessions 포인터를 사용한다. 새 인증 체계/백엔드/프로젝트/DB Rules를 만들지 않았다.

| 요소 | 의미 |
|---|---|
| `status:playing` + `progressState:running` | 진행 중; 최종 순위/Sheets 회차 아님 |
| `status:playing` + `progressState:paused` | 중간 저장; 이어하기 가능 |
| `status:complete` / `incomplete` | 기존 최종 완료/종료 기록 |
| `savedAt`, `uiState`, `revision`, `storageVersion:2` | 저장 시각/미확정 입력/동시성/보존 형식 |
| `uiState` | view, 현재 또는 피드백 questionId, 최대 2자리 숫자 draft, 중복 없는 카드 위치 0~2 |

| API | 처리 |
|---|---|
| `getStudentGames` | PIN 인증을 확인하고 등록된 게임과 본인의 활성 회차를 읽음. 자동 시작 없음 |
| `saveSession` | sessionId, expectedRevision, uiState, requestId. 서버 원장과 상태를 확인해 paused 저장 |
| `resumeSession` | sessionId, expectedRevision, requestId. 같은 회차를 running으로 재개 |

문제/답안/점수/남은 문제/채점 상태는 기존 서버 세션에서 가져온다. save 요청에 score, questions, currentIndex, remainingMs 등 임의 필드를 넣으면 거부한다. UI 상태도 실제 현재 문항·카드 단계·최근 피드백에 맞는지 검증한다. 미확정 숫자와 선택은 답안이나 점수로 채점하지 않는다. 카드쌍 확인 후 합을 입력하기 전 상태도 기존 firstResponse/selectedPair/step으로 보존한다.

저장/재개 트랜잭션은 소속·학생 ID·활성 UID·바인딩/PIN 버전·revision을 확인한다. 같은 requestId는 같은 JSON 결과를 반환하고 다른 내용을 재사용하면 거부한다. 이전 revision의 저장이 새 답안이나 다른 탭의 저장을 덮어쓰지 않는다. 저장/답안이 동시에 도착하면 하나가 확정되고 다른 요청은 충돌/paused로 거부한다. paused 회차는 재개 전 새 답안을 받지 않는다. 50문항 완료 때만 기존 서버 채점/최고점/순위/outbox 처리를 실행한다. 수동 저장/재개는 순위나 Sheets 작업을 만들지 않는다.

교사의 회차와 상세 API에는 status/progressState만 더하며 기존 점수·답안·completion 필드를 유지한다. 화면에서 진행 중, 중간 저장·이어하기 가능, 완료, 종료·미완료를 구분한다. 기존 Sheets 내보내기는 완료 회차만 포함한다. 학생 이름 변경·삭제·PIN 관리 기능은 그대로다.

## 오류·자동 보존·사용량

- 기존처럼 확정 답안은 서버에 자동 저장한다. 키 입력/카드 선택은 서버 요청 없이 로컬에 보존하며 같은 서버 revision/문항에 해당할 때만 새로고침 후 복원한다.
- **미확정 입력을 다른 기기로 가져가려면 수동 저장의 서버 확인이 필요하다.** 브라우저 종료 시 네트워크 전송 성공을 가정하지 않는다. 로컬 연습도 다른 기기 동기화를 약속하지 않는다.
- 응답 유실 시 기존 offline mutation 큐의 같은 requestId/body를 재전송한다. 새로고침 때 미확인 답안/저장/재개를 복구한 뒤 서버의 활성 회차를 다시 읽는다. 저장 전에 미확인 답안을 처리하고 채점된 실제 단계에 맞게 저장한다.
- 저장 실패는 ‘저장을 확인하지 못했어요’ 화면에서 재시도와 서버 기록 불러오기를 제공한다. 확인 없이 로그아웃/포털 성공으로 안내하지 않는다. 충돌 시 명시적인 ‘서버에 저장된 기록 불러오기’만 미확정 충돌 요청을 정리하며 서버 원장을 덮어쓰지 않는다.
- 서버 폴링/초 단위 타이머 쓰기/키 입력마다 서버 저장을 추가하지 않았다. 정상 수동 저장은 세션과 멱등 결과 각각 한 문서, paused 재개도 세션과 멱등 결과 각각 한 문서를 쓴다. legacy 첫 저장의 백업은 한 번만 추가한다. 이미 running인 회차를 UI에서 이어할 때는 조회만 한다.
- 로그인/학생 바꾸기에서는 이전 학생의 로컬 입력과 게임 목록을 지워 공유 기기에 잘못 표시하지 않는다. PIN은 이 보존 경로에 넣지 않는다.

## 확장 지점

`src/games/catalog.js`의 gameId/title/entryPath/description/totalQuestions가 포털의 단일 등록부다. 현재는 1math3 한 항목이다. 동일 페이지의 1math3는 기존 게임 화면으로 진입하고, 새 게임은 등록한 별도 entryPath로 이동할 수 있다. 다음 게임의 엔진/채점 및 Pages allowlist는 해당 게임에 맞게 추가해야 하지만 학생 로그인·교사 학생 관리 API를 다시 구현할 필요는 없다.

`src/games/session-progress.js`는 저장할 UI 상태 검증과 기본 복원 상태를 공유한다. Functions와 Worker 생성물은 원본을 복사/변환하고 브라우저 classic bundle에도 같은 등록부/검증을 포함한다. C에서는 생성 파일 최신 검사를 유지한다.

## 검증 근거

| 검사 | 결과 |
|---|---|
| `npm test` | 단위·보안·기존 코어·PIN·Sheets + 새 자유 저장 9개, 총 78개 PASS |
| `npm run test:progress-browser` | 포털·친구 순위/저장 응답 유실/전송 실패/답안 응답 유실/재시도/새로고침/기기 변경/카드 선택·부분 합/50문항 최종 10점 단일 기록/교사 상세, 19초 PASS |
| `npm run emulators:worker` | 실제 로컬 Firestore REST 동시 저장·다른 기기·권한 거부 + A PIN/기존 50문항·Sheets, 3개 PASS |
| `npm run emulators:test` | 실제 Firebase Auth/Functions/Rules·점수/순위·멱등성·학급 격리, 110.6초 PASS |
| `npm run emulators:browser` | 실제 Firebase SDK/Functions Chromium 가입→포털→50문항→교사/순위/복구, 121.3초 PASS |
| `npm run test:pin-browser` | A 등록/동명이인/PIN/교사 변경·초기화/복구/응답 유실 PASS |
| `npm run test:sheets-browser` | 기존 선택형 Google OAuth/Sheets 모의 브라우저 회귀 PASS |
| Worker dry-run/생성물 최신/Pages allowlist/비밀값 검사 | PASS; 기존 3개 게임 원본 동일, 공개 산출물 12개 파일 |

저장/재개 멱등 응답을 JSON으로 정규화하여 최초 응답과 재전송 응답을 일치시켰다. 포털 조회는 callable wrapper를 다시 호출하지 않고 공통 세션 읽기 함수로 처리해 Functions/Worker 양쪽에서 동작한다. 실제 Firebase 초기 인증 완료 콜백이 학생의 이미 열린 로그인 화면을 홈으로 덮어쓰는 레이스를 발견·수정했고, 느린 초기 연결 시나리오를 브라우저 검사에 포함했다. 테스트는 가상 학생만 사용한다. 브라우저에 스크립트 예외가 없었고 의도적으로 끊은 요청의 네트워크 오류는 복구 시나리오이다.

QA 화면/로그는 Git 제외 `.cp5-test-artifacts/checkpoint-b/`에 있다. `game-portal.png`, `resumed-game.png`, unit/worker-emulator/firebase-api/firebase-browser/progress-browser/pin-browser/worker-dry-run 로그. 과거 CLI의 Node 24/Functions 설정 Node 22 및 SDK 버전 권고는 기존 환경 알림이며, 생산 Functions 배포나 패키지 변경은 하지 않았다.

## Checkpoint C 인계

1. 이 B 브랜치와 A/B 문서를 확인한다. 사용자가 확정한 시간 제한 없음, 기존 학생 ID/기록/권한 경계, 기존 인프라 식별자를 유지한다.
2. 실제 운영 데이터/Worker 버전과 현재 Pages 커밋을 복원 가능하게 기록한다. 실제 Firebase·Worker·기존 Google OAuth/Sheets와 계정을 확인한 뒤 A와 B를 함께 통합 검사한다. 운영 개인정보/Secret/로그/백업을 Git 또는 채팅에 출력하지 않는다.
3. 저장→로그아웃→다른 기기 PIN 로그인→이어하기→50문항 완료, legacy PIN 전환/첫 저장, 타인/비로그인/삭제/PIN 변경 접근 거부, 교사/Sheets/기존 3개 게임을 실제 공개 Origin에서 검증한다. Worker CPU·하위 요청·Firestore 사용량 및 브라우저/서버 로그를 확인한다.
4. main/공개 배포는 C에서만 수행한다. 새 Worker와 Pages의 학생 PIN 화면/저장 API가 일치하도록 배포 순서와 브라우저 캐시를 확인한다. 기존 정적 파일 allowlist/비밀값 검사/소스·증거 제외를 유지한다. Vercel 배포 명령을 이번 Pages에 사용하지 않는다.
5. 기존 A 이전 Worker로 단순히 되돌리면 PIN 버전과 paused/null-expiry 데이터 호환이 깨질 수 있다. 복구 빌드는 A 권한 검사와 B 저장/재개·null-expiry 처리를 유지해야 한다. 완료/학습 기록을 삭제하거나 과거 UID/티켓을 재활성화하는 일괄 복원은 하지 않는다. 운영 복원 시 대상/이유 설명과 사용자 확인 규칙을 따른다.
6. Ready/실제 Pages·HTTP·핵심 흐름·접근 통제·로그를 확인하고 AGENTS의 도름스체크 v0.3.1 순서로 점검한다. 권고/미확인과 실제 위험을 구분하고 보안 보증이라고 표현하지 않는다. 완료되면 실제 근거·주소·최종 상태를 기록한다.

B의 개발 PASS는 실제 공개 배포 PASS가 아니다. 문서/개발 브랜치 저장 후 이 대화를 중단하고 C는 별도 대화에서 진행한다.

현재 A+B의 실제 공개 반영과 최종 검증은 [Checkpoint C PASS 기록](CHECKPOINT_C_RELEASE.md)을 참조한다. 아래 내용은 개발 체크포인트 당시의 인계 기록이다.
