# Checkpoint 3 Firebase 연결과 검증

> 실제 Cloudflare Worker 연결·검증 현황은 [CHECKPOINT3_WORKER_MIGRATION.md](CHECKPOINT3_WORKER_MIGRATION.md)를 참조한다. 아래의 개발 프로젝트 연결 절차는 보존된 Functions 경로를 위한 2026-09-23 당시 기록이다.

2026-09-23 당시에는 실제 Firebase 프로젝트가 없었다. 2026-09-27에는 별도 `math3-dev` 프로젝트와 Worker가 연결됐다. `.firebaserc`의 `demo-1math3-checkpoint3`은 Emulator 전용 ID이며 배포 대상이 아니다.

## 로컬 검증

1. Node.js, Firebase CLI 의존성, Java 21을 준비한다. `npm install` 또는 `pnpm install` 후 `node tools/build-1math3.mjs`와 `node tools/build-functions.mjs`를 실행한다.
2. `npm test`는 기존 학생 게임 회귀 검사다.
3. `npm run emulators:test`는 익명 인증·교사 승인·권한·서버 채점·순위·멱등성·복귀 코드·Firestore Rules를 검사한다.
4. `npm run emulators:browser`는 실제 Chromium에서 학급 생성→승인→50문항 완료→순위와 응답 유실 후 재시도를 검사한다. 실행 환경에 Chrome이 `C:\Program Files\Google\Chrome\Application\chrome.exe`에 있어야 한다.

Windows에서 Java NIO가 `Unable to establish loopback connection`으로 실패하면 짧고 쓰기 가능한 `TEMP`/`TMP`를 지정한다. 테스트 실행기는 `C:\CodexHome\tmp`가 있으면 이를 사용하고, 작업 폴더의 `tools/temurin21/`이 있으면 그 Java 21을 우선 사용한다. 이 로컬 런타임은 Git에 포함하지 않는다.

## 별도 개발 프로젝트 연결

1. 기존 `1math1`, `1math2` Firebase 프로젝트와 **다른** 개발 프로젝트를 준비한다. Authentication의 익명 로그인을 켜고 Firestore를 만들며 Functions 리전은 `asia-northeast3`으로 맞춘다. 개발 프로젝트의 과금 설정과 예산을 먼저 확인한다.
2. Firebase CLI에서 개발 프로젝트 소유 계정으로 로그인한다. 현재 이 PC의 CLI에는 인증이 없으며 `firebase projects:list --json`이 인증 오류를 반환했다.
3. `firebase-config.example.js`를 루트 `firebase-config.js`로 복사하고 개발 프로젝트의 웹 앱 `apiKey`, `authDomain`, `projectId`, `appId`를 넣는다. 이 웹 설정 자체는 비밀이 아니지만 개발/운영 프로젝트 혼동을 막기 위해 로컬 파일은 Git에서 제외한다.
4. `functions/.env.<개발프로젝트ID>`에 충분히 무작위인 `MATH3_SERVER_SECRET`을 넣는다. 이 파일은 Git에서 제외한다. Emulator는 별도의 개발 전용 기본값을 사용한다. 실제 프로젝트에는 이 비밀 없이 Functions가 시작되지 않는다.
5. 빌드를 갱신한 뒤 **명시한 개발 프로젝트 ID**에만 Functions와 Firestore Rules/인덱스를 배포한다. `.firebaserc` 기본 ID로 배포하지 않는다. [Firebase 환경 변수 문서](https://firebase.google.com/docs/functions/config-env)의 프로젝트별 `.env` 방식을 사용한다.
6. `npm run serve:student`로 로컬 화면을 열어 `1math3.html`과 `teacher/index.html`에서 교사 생성→학급 생성→학생 참여→승인→정규 회차→순위를 확인한다. 마지막으로 학생 브라우저에서 Firestore SDK 직접 읽기·쓰기가 모두 거부되는지 개발 프로젝트 Rules를 확인한다.

설정 파일을 넣지 않으면 `1math3.html`은 Checkpoint 2의 mock 체험으로 열린다. 공식 결과는 Firebase 연결이 활성화된 **정규 회차**에서만 만들어진다. 브라우저에는 서버 seed와 미래 정답이 내려오지 않고, Firestore 클라이언트 접근은 전면 거부한다.

## 이번 구현 범위

- Functions callable API: 교사 공간/복구, 학급 생성과 최소 조회, 코드 신청·승인, 학생 상태, 복귀 티켓, 정규 회차, 답안·종료, 학급/전체 순위, 전체 등록 설정, 소유 교사의 상세 조회.
- Firestore 원장: 서버 전용 회차와 최초 답안, 분리된 학급/전체 순위 투영 및 점수 버킷. 50번째 답을 transaction으로 확정하며 결과·순위를 함께 기록한다.
- 최소 교사 도구: 학급 생성, 대기 학생 승인, 복귀 코드 발급, 전체 등록 설정. Checkpoint 4 대시보드 기능은 포함하지 않는다.

## 운영 리스크와 후속 과제

- 실제 개발 프로젝트 인증·권한·브라우저 연결은 Worker 경로에서 검증했고 Checkpoint 3은 PASS로 판정했다. 일부 요청의 Workers Free CPU 10ms 초과와 학급 월별 최고 기록 200건 초과 시 재투영 제한은 현재 예상 규모에서 수용한 운영 리스크다. 최대 200건의 재투영 부하 측정은 규모 확대 전 수행한다.
- App Check, 운영 IAM·예산 경고·부하 테스트, 보유/삭제 정책은 운영 배포 전 별도 검증이 필요하다.
- 학급 전체 순위 설정의 원자적 재투영은 현재 학급당 최대 200개의 월별 최고 기록을 처리한다. 이 한도를 넘는 학급은 설정 변경을 거부하므로 운영 규모에 맞는 배치 작업이 필요하다.
- 학생 개인/학급 삭제 후 과거 최고점 재집계와 50행 이후 페이지 UX는 이 체크포인트에서 구현하지 않았다.
