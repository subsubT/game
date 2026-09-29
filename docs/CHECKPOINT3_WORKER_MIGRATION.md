# Checkpoint 3 — 개발 Worker 실제 연결 및 검증

기준일: 2026-09-27. **Checkpoint 3 PASS.** 실제 Firebase Spark + Cloudflare Workers Free 개발 환경에서 기능·보안·브라우저 통합 흐름을 검증했다. 사용자는 현재 예상 학급 규모에서 일부 요청의 CPU 10ms 초과와 학급 월별 최고 기록 200건 초과 시 전체 순위 공개 설정 재투영 제한을 운영 리스크로 수용했다. 최대 200건 재투영의 실제 부하 측정은 하지 않았다. 규모 확대 시 최적화한다. Checkpoint 4는 시작하지 않았다.

## 배포 상태

| 항목 | 현재 값 |
|---|---|
| Firebase 개발 프로젝트 | `math3-dev` |
| Worker | `math3-cp3-dev` |
| 최종 확인 배포 버전 | `16f8c234-8930-45fe-a045-976b39b79d34` |
| 개발 URL | <https://math3-cp3-dev.subsubt-math3-dev.workers.dev> |
| 허용 브라우저 Origin | `https://subsubt.github.io` |
| `workers_dev` / `preview_urls` | `true` / `false` |
| Custom Domain / Route | 없음 |
| 클라이언트 | 로컬 `firebase-config.js`에서 개발 Worker URL 사용. 이 파일은 Git 제외 대상 |

두 Cloudflare Secret은 등록되어 있다. 내용은 읽거나 출력하지 않았다. 처음 등록된 서비스 계정 Secret은 JSON 파싱에 실패했으며, 사용자가 원본 JSON 파일 전체를 stdin으로 다시 등록한 뒤 실제 Firebase ID 토큰 검증, 서비스 계정 OAuth, Firestore 읽기와 쓰기가 통과했다. 기존 `functions/` 구현과 Functions fallback, 설정이 없는 경우의 Mock 경계는 유지했다. 기존 `index.html`, `1math1.html`, `1math2.html`은 수정하지 않았다.

## 실제 검증 결과

- 공개 URL의 루트와 비지원 경로는 404, 인증 없는 API는 401, 잘못된 Origin은 CORS 허용 헤더 없이 403, 잘못된 토큰은 401을 반환한다. 내부 실패 응답은 `INTERNAL` 코드만 담았다. 개발 Worker 로그는 Secret·토큰·요청 본문 없이 오류 단계/위치와 외부 요청 수만 기록한다.
- `tests/worker-live.test.js`를 `math3-dev`에서 실행했다. 실제 익명 인증, 교사 2명·학급 2개·학생 참여/승인, 다른 학생/학급 격리, 4개 정규 50문항 세션, 500점 서버 확정, 직접 종료 미완료, 중복 start/submit/finish, 최초 답안 불변, 점수 필드 위조 거부, 최고 기록 갱신, 공동 순위, 학생·교사의 전체 등록 해제/복원, 페이지 크기 1의 실제 커서 페이지네이션 및 변조 거부가 통과했다. Firestore REST에 브라우저 ID 토큰으로 직접 GET/PATCH한 요청은 모두 403이었다. 이 검증은 개발 Firestore에 시험 데이터를 남긴다.
- `tests/worker-live-browser.test.js`에서 실제 Firebase SDK와 Worker를 사용하는 Chromium 교사·학생 화면의 교사 생성 → 학급 생성 → 참여 → 승인 → 50문항 → 서버 결과 → 학급 순위 → 전체 순위, 응답 유실 후 재시도, 새로고침 복원 흐름이 통과했다. 문항 후보 최적화 후에도 같은 50문항 흐름이 통과했다. Playwright가 로컬 정적 파일을 허용된 `https://subsubt.github.io` Origin으로 제공해 실제 CORS 경계도 확인했다. GitHub Pages에 파일을 게시한 검증은 아니다.
- `tests/worker-live-firestore-browser.test.js`에서 실제 Chromium Firebase SDK의 Firestore 문서 직접 읽기/쓰기가 모두 `permission-denied`로 거부됐다.
- `tests/worker-live-race.test.js`에서 같은 문항에 다른 답 두 개를 실제 Worker로 동시에 제출했다. 하나만 확정되고 다른 요청은 revision 충돌로 거부됐으며, 이후 조회에서 최초 답안과 다음 문항 위치가 유지됐다.
- 기존 학생 게임 `npm test` 18개, Worker Emulator 통합 테스트, 기존 Functions Emulator 테스트와 기존 Functions Chromium 회귀 테스트가 최종 코드에서 통과했다.

## 수정과 비용 측정

- Cloudflare Crypto의 `Cipheriv.update`에 학급 코드를 문자열로 넘기면 `ERR_INVALID_ARG_VALUE`가 발생했다. `Buffer` 입력으로 바꿔 실제 학급 생성이 통과했다.
- 개발 순위 API에 선택적 `pageSize`(1~50)를 추가해 실제 페이지 토큰 연결을 3개 순위 행으로 검증했다. 기본값 50과 Functions fallback을 유지한다.
- 문항 생성은 매번 전체 후보를 섞지 않고 무작위 시작점부터 중복 없는 후보를 찾도록 바꿨다. 같은 로컬 Node에서 100세션 생성은 289ms에서 133ms로 줄었고 기존 생성·교육과정 테스트가 통과했다.
- 일반 답안 제출 트랜잭션은 마지막 문항에서만 필요한 학생·학급 문서 재조회를 마지막 문항으로 옮겼다. 정규 완주 60회 제출(두 단계 10문항 포함)을 기준으로 문서 읽기 약 118건을 줄이는 구조다. 이 변경은 Worker Emulator와 실제 Chromium 50문항 완주에서 재검증했다.
- 실제 Cloudflare tail 계측(최적화 전 API 전체 흐름)에서 `submitAnswer` 243회 평균 CPU 3.91ms, 최대 22ms, 외부 요청 평균 5회·최대 7회였다. `startSession` 7회 평균 CPU 14.29ms, 최대 41ms, 외부 요청 최대 6회였다. 학급 전체 등록 설정은 소규모에서 CPU 최대 6ms, 외부 요청 최대 9회였다.
- Firestore 읽기 최적화 후 실제 브라우저 완주는 `submitAnswer` 51회(응답 유실 재시도 1회 포함), 평균 CPU 4.14ms·최대 14ms, 외부 요청 평균 5.06회·최대 7회였다. 시작 요청은 22ms였다. 후보를 Worker 초기화 때 준비하는 추가 최적화 뒤 실제 시작 요청 1회는 12ms였고 Worker 시작 시간은 19ms였다. 이 수치는 소수 표본이며 10ms 이하 안정성을 입증하지 못한다.
- 후보 사전 계산을 포함한 최종 배포에서 실제 50문항 브라우저 완주를 다시 측정했다. `startSession` 2회 평균 CPU 9ms·최대 12ms, `submitAnswer` 51회 평균 4.25ms·최대 15ms, 외부 요청 평균 5.06회·최대 7회였다. 1102 오류는 발생하지 않았지만 일부 CPU 값은 10ms를 넘었다.
- 학급 전체 등록 변경은 소규모 실제 요청에서 최대 외부 요청 9회였다. 최대 200개 기록은 REST `batchGet`으로 묶기 때문에 외부 요청 50회 한도보다 문서 읽기/쓰기와 CPU가 주된 위험이다. 최악의 경우 학급 문서 1건, 전체 행 최대 200건, 점수 집계 문서를 한 트랜잭션에 쓸 수 있다. 최대 규모 실제 실행은 하지 않았다.
- 정상적인 50문항 전부 정답 완주는 1회 시작, 약 60회 답안 제출(두 단계 문제 포함), 결과/순위 조회 요청으로 이뤄진다. 답안 제출의 Firestore 쓰기는 두 단계 중간 10회 × 2건, 최종 답안 49회 × 3건, 마지막 답안 최대 8건으로 약 175건/완주다. 최적화 후 문서 읽기는 일반 제출 59회 × 4건과 마지막 제출 10건으로 약 246건/완주다. 이는 코드에서 계산한 추정치이며 Firestore 콘솔의 실제 청구 카운터와 구분한다. 요청당 OAuth 교환은 isolate 안에서 캐시되며, 실제 tail에서 대부분의 반복 답안 요청은 OAuth 추가 호출이 없었다.

Cloudflare 공식 문서의 Workers Free 한도는 요청당 CPU 10ms, 외부 요청 50회, 일 100,000요청이다. Firestore 무료 한도는 일 50,000 문서 읽기, 20,000 쓰기다. CPU 초과는 일부 허용될 수 있으나 반복되면 1102로 종료될 수 있다. 실제 요청에서 1102는 없었지만 CPU 최대치가 10ms를 넘었으므로 무료 플랜에서 모든 요청의 안정적인 완료가 입증된 것은 아니다. 현재 예상 규모에서는 이 위험을 수용했다. [Workers 한도](https://developers.cloudflare.com/workers/platform/limits/), [Firestore 할당량](https://firebase.google.com/docs/firestore/quotas).

완주당 답안 쓰기 약 175건만 고려해도 Firestore 무료 쓰기 20,000건은 약 114회 완주/일에 해당한다. 교사·학급 생성, 승인, 재시도, 기타 작업은 이 여유를 더 줄인다. 실제 예상 일일 학급·학생 수를 정해 용량을 판단해야 한다.

## 수용한 운영 리스크와 규모 확대 전 과제

1. 학급 전체 공개 설정은 학급당 월별 최고 기록 최대 200건을 재투영하며, 200건을 넘으면 설정 변경을 거부한다. 최대 200건의 실제 부하 측정은 아직 없다. 학급 규모 확대 전에 CPU·Firestore 트랜잭션·무료 사용량을 측정하고 필요하면 작업을 나눈다.
2. 일부 실제 Worker 요청에서 CPU 10ms 초과가 관측됐다. 사용량이 늘어나기 전에 CPU 초과 빈도와 예상 일일 완주 횟수의 Firestore 읽기·쓰기 용량을 다시 확인하고 필요하면 현재 아키텍처 안에서 최적화한다. 이 항목들은 현재 규모의 Checkpoint 3 PASS를 막는 조건으로 보지 않는다.

실행 방법: PowerShell에서 `$env:MATH3_LIVE_TEST='1'; node --test tests/worker-live.test.js`, `tests/worker-live-browser.test.js`, `tests/worker-live-firestore-browser.test.js`, `tests/worker-live-race.test.js`를 각각 실행한다. 실측은 `npx wrangler tail math3-cp3-dev --format json | node tools/worker-tail-summary.mjs`로 집계한다. 테스트는 실제 개발 프로젝트에 데이터를 쓴다.
