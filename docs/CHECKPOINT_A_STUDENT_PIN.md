# 학생 로그인 개편 — Checkpoint A

기준일: 2026-10-14 KST. **Checkpoint A PASS — 학생 로그인 구현과 개발 환경 검증 완료.** 이 대화의 범위는 A이다. B의 게임 선택/자유 저장과 C의 main/공개 배포는 다음 대화에서 진행한다. 이 PASS는 운영 적용/전체 실제 서비스 PASS를 뜻하지 않는다.

- 저장소: https://github.com/subsubT/game
- 개발 브랜치: `codex/student-pin-checkpoint-a`
- 작업 시작 커밋: `2f8cd4e47e183fa5ef1ee7ace96a1720b74266d6` (당시 main과 동일)
- 기존 Firebase: `math3-dev`, Worker: `math3-cp3-dev`
- 기존 API: https://math3-cp3-dev.subsubt-math3-dev.workers.dev
- 기존 학생/교사: https://subsubt.github.io/game/1math3.html / https://subsubt.github.io/game/teacher/
- Supabase/Vercel 및 신규 프로젝트 사용 없음. 운영 DB/Rules/Worker/Pages와 Google 설정은 이 체크포인트에서 배포하거나 변경하지 않는다.

## 동작과 화면

신규 학생은 4자리 학급 코드 → 이름 목록의 ‘처음 왔어요’ → 이름·숫자 4자리 PIN·확인 PIN을 등록한다. 서버가 학생과 활성 소속, PIN 검증 자료를 원자적으로 생성하며 교사 승인은 없다. 이미 연결된 계정의 이름/PIN은 가입 재시도로 변경하지 않는다. PIN 없는 신규 가입의 이전 API 호출은 거부한다.

기존 등록 학생은 코드 → 자기 이름 버튼 → PIN으로 로그인한다. 같은 이름도 목록 번호와 기존 별명으로 구분하며, 서버 ID는 이름과 독립적인 기존 `studentId`이다. 로그인은 게임을 자동 시작하지 않는다. A에서는 기존 홈 화면에 도착하며, B에서 이 진입점을 게임 선택 페이지로 확장한다.

교사는 자기 학급의 ‘PIN 관리’에서 새 PIN을 두 번 입력하거나 초기화한다. 기존 PIN/검증 자료는 교사 API에 반환하지 않는다. 초기화하면 현재 접속이 해제되고, **새로 발급한 복귀 티켓**으로 기존 기록을 찾은 뒤 새 PIN을 등록해야 한다. 같은 기기에서도 이 복구가 된다. PIN 변경/초기화 후에는 예전에 발급한 복귀 티켓도 사용할 수 없다.

PIN을 다섯 번 연속 틀리면 기기·IP·시간이 바뀌어도 새 PIN 로그인이 잠긴다. 교사가 PIN을 변경/초기화해야 다시 사용할 수 있다. 맞는 PIN 로그인은 실패 횟수를 초기화한다. 원래 로그인한 학생의 기존 인증까지 오답 공격으로 해제하지는 않는다.

## 안전한 기존 계정 전환

PIN 없는 기존 학생은 현재 **활성 Firebase 인증 연결**을 유지한 원래 기기에서만 최초 PIN을 등록한다. 원래 기기를 잃었다면 담임교사가 새 PIN을 지정하거나 일회용 복귀 티켓을 발급한다. 코드·이름·학생 ID를 알고 있다는 이유만으로 기존 계정의 PIN을 설정할 수 없다. 같은 이름으로 새로 등록해도 별개의 ID가 생성되며 기존 기록에 접근할 수 없다. PIN 최초 설정 응답이 유실되면 메모리에 남긴 비밀값 없는 요청 ID로 재시도한다. 다른 PIN으로 같은 요청을 재시도하면 충돌을 알리며, 이미 설정된 PIN을 새 입력값으로 바꿨다고 잘못 안내하지 않는다. 새로고침은 서버의 실제 등록 상태를 읽는다.

기존 승인 대기는 원래 ID/별명/이름으로 즉시 소속되지만 `pin-required` 상태로 안내한다. PIN 설정 전 정규 게임/학급 순위/권한 변경은 차단한다. 최초 설정은 변경 전 학생/바인딩/인증 자료를 `studentAdminBackups`에 저장하고 새 버전을 기록한다. 동시 설정/응답 유실 재시도는 같은 요청 ID로 하나의 결과가 된다.

다른 기기의 PIN 로그인은 기존 학생 문서의 현재 UID를 새 익명 Firebase UID로 연결한다. 이전 바인딩을 비활성화하고 진행 중인 게임 포인터를 옮긴다. 원장, 답안, 점수, 별명, 학생 ID는 변경하지 않는다. 기기 이동 전 학생/바인딩/게임 포인터도 서버 전용 백업에 남긴다. 한 학생은 가장 최근에 로그인한 기기에서 이용하며 이전 기기는 PIN으로 다시 로그인할 수 있다.

게임 시작·답안·완료·전체 등록 변경 트랜잭션은 학생 상태뿐 아니라 바인딩 활성 상태/버전과 PIN 버전을 다시 읽는다. PIN 변경·삭제·로그아웃·다른 기기 로그인과 겹쳐 오래된 권한으로 쓰는 요청을 차단한다. 기존 학생 이름 변경·삭제·복원용 기록·순위 집계·Sheets 원장은 유지한다.

## 데이터/API

| 경로/필드 | 역할 |
|---|---|
| `classes/{classId}/students/{studentId}` | 기존 데이터에 `pinReady`, `pinVersion` 추가. 이름/학습 기록과 ID 유지 |
| `studentPins/{classId}:{studentId}` | 서버 전용 검증 자료: 무작위 salt, HMAC verifier, scheme/version/enabled, 실패 횟수/잠금 |
| `studentBindings/{uid}.pinVersion` | 현재 인증을 PIN 버전에 묶음. 기존 bindingVersion 유지 |
| `studentReturnTickets/{hash}.pinVersion` | 발급 당시 PIN 버전으로 제한 |
| `studentAdminBackups` | PIN 설정/변경 및 기기 이전 전 복원 자료 |
| `rateLimits/{HMAC}` | UID/네트워크/학생/서비스 전체 요청 제한. 원문 IP는 저장하지 않음 |

| API | 입력/접근 |
|---|---|
| `requestJoin` | code, privateName, pin, pinConfirm, requestId. 신규 이름·PIN 필수 |
| `getClassLoginRoster` | code. 유효/활성/만료/학급 코드 버전 확인 후 최소 이름 목록과 10분 grant 반환 |
| `loginStudentPin` | grant, studentId, pin, requestId. grant는 조회 UID/학급/코드 버전/만료에 묶음 |
| `setStudentPin` | pin, pinConfirm, requestId. 원래 활성 연결 또는 새 교사 티켓을 받은 학생만 최초 설정 |
| `changeStudentPin` | classId, studentId, 새 PIN 쌍 또는 reset:true, requestId. 해당 학급 소유 교사만 |

교사 UID로 학생 등록/PIN 로그인/복귀 티켓 교환을 하지 못한다. 명단에는 이름·별명·선택 번호·학생 ID·PIN 등록 여부만 반환한다. 학습 기록·점수·UID·PIN/verifier는 포함하지 않는다. 모든 직접 Firestore 읽기/쓰기를 거부하는 기존 Rules는 그대로 사용한다.

PIN은 암호화해서 복호화하는 방식이나 평문/비밀키 없는 해시로 보관하지 않는다. 기존 서버 Secret을 domain separation과 함께 사용하는 **학생별 무작위 salt + HMAC-SHA256 pepper 검증**을 사용한다. DB만 유출됐을 때 10,000개 PIN을 오프라인 비교할 수 없으며, 입력은 서버에서 상수 시간 비교한다. PIN과 확인 PIN은 operations 결과, 클라이언트 저장소/오프라인 요청 큐, URL, 로그, Sheets에 넣지 않는다. 이것은 일반 사용자 비밀번호의 느린 KDF 권고 충족을 주장하는 설계가 아니다. 서버 Secret과 DB가 함께 유출되면 짧은 PIN을 보호할 수 없으므로 Secret 보호가 필수이다. 기존 무료 Worker 구조와 CPU 한도를 고려해 무거운 KDF를 추가하지 않았다. [OWASP의 pepper 설명](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#peppering).

## 명단 접근과 속도 제한의 정확한 경계

학급 코드를 명단 접근/신규 가입을 위한 공유 입장 정보로 취급한다. 유효한 코드를 아는 사람은 요구된 로그인 흐름상 해당 이름 목록을 볼 수 있다. **4자리 코드만으로 그 사람이 실제 학급 구성원인지를 증명하거나 코드가 알려진 뒤의 조회를 완전히 차단할 수는 없다.** 더 엄격한 명단 비밀성이 필요하면 추가 인증 또는 교사가 사전에 허용한 기기 등 흐름 변경이 필요하다. 성명만으로 기존 기록/권한을 얻는 것은 불가능하다.

- 코드 조회/등록 및 PIN 로그인 각각 네트워크당 60회/15분, UID당 10회/15분.
- 코드 조회와 등록은 IP/UID가 달라도 합쳐서 서비스 전체 300회/분으로 제한한다. 이전 가입 API를 별도 코드 탐색 통로로 쓰지 못한다.
- PIN 시도는 학생당 6회/15분 제한과 별도로 연속 오답 5회 잠금을 적용한다. 교사 PIN 변경/초기화는 학생 제한도 해제한다.
- 최초 PIN 설정도 원래 인증 UID당 10회/15분으로 제한한다.
- 서버의 rate-limit 트랜잭션을 먼저 커밋한다. 실패를 throw해서 카운터가 되돌아가는 문제를 막는다. 영구 잠금 카운터도 커밋 후 로그인 거부를 응답한다.
- Worker의 `CF-Connecting-IP`만 네트워크 기준으로 사용한다. JSON/토큰의 network와 임의 전달 헤더는 사용하지 않는다. Functions 호환 경로는 서버 request IP를 사용한다.

학교 공유 IP에서는 여러 학생의 과도한 반복 시도 때문에 15분 제한에 걸릴 수 있다. 제한은 명단 비밀성이나 DDoS 방어의 절대 보증이 아니다. C에서 실제 학급 동시 사용량·Worker CPU/하위 요청·Firestore 쓰기를 관측하며 임의로 접근 통제를 낮추지 않는다.

## 검사와 수정 근거

단위/보안 검사, 실제 로컬 Firestore REST 트랜잭션과 Rules, Firebase Auth/Functions, Chromium 화면 검사를 사용한다. 가상 학급/학생만 사용하며 운영 순위표에 기록을 남기지 않는다.

| 검사 | 결과 |
|---|---|
| `npm test` | 69개 PASS |
| `npm run test:pin-browser` | 등록/같은 이름/오답/다른 기기/교사 변경·초기화/티켓 복구/설정 응답 유실·다른 PIN 재시도 거부 PASS |
| `npm run emulators:worker` | 로컬 실제 PIN 전환/동시 로그인/원장 유지/직접 접근 거부 및 50문항·Sheets 2개 최종 빌드 PASS |
| `npm run emulators:test` | 실제 Firebase 인증/Functions/Rules·학급 격리/점수·순위/멱등성 PASS |
| `npm run emulators:browser` | 실제 Firebase Auth/Functions Chromium 신규 PIN 가입→50문항→결과/교사 이름 변경·학급 격리/순위/복구 104.9초 PASS |
| `npm run test:sheets-browser` | 기존 Google 선택·연결·관리표 브라우저 회귀 PASS (외부 Google는 모의) |
| Worker dry-run / 생성 파일 최신 확인 | 최종 빌드 PASS |
| Pages allowlist 빌드/비밀값 패턴 검사/기존 게임 보존 | PASS; 기존 게임 3개 동일, 12개 공개 파일만 포함 |

실제 동시 로그인에서 기존 REST adapter의 즉시 재시도가 `ABORTED / Transaction lock timeout`으로 소진되는 문제를 발견했다. `retryTransaction`을 보존하고 지수 backoff/jitter를 적용한 뒤 같은 실제 Emulator 검사가 통과했다. [Firestore 재시도 옵션](https://firebase.google.com/docs/firestore/reference/rest/v1/TransactionOptions), [트랜잭션 충돌](https://firebase.google.com/docs/firestore/transaction-data-contention).

PIN 초기화 후 같은 UID의 비활성 바인딩 때문에 복귀가 거부되거나 같은 경로의 게임 포인터가 삭제되는 경우도 수정·검사했다. 같은 학생의 비활성 바인딩으로 교사 티켓을 교환할 수 있으며, UID가 같으면 포인터를 이동/삭제하지 않는다. 다른 학생/학급/삭제된 소속/교사 인증의 티켓 교환은 거부한다.

로컬 QA 자료는 Git 제외 `.cp5-test-artifacts/checkpoint-a/`에 둔다. `student-login.png`는 390px 화면의 가상 동명이인 목록이다. Emulator의 `PERMISSION_DENIED` 메시지는 의도한 직접 접근 차단 검사다. Firebase CLI는 기존 Functions 버전과 로컬 Node 24/설정 Node 22 차이를 권고했으며 운영 Functions는 배포하지 않는다. 새로운 패키지나 보안 정책 변경은 하지 않았다.

## 복원과 다음 체크포인트

C에서 실제 적용 전에 현재 운영 데이터와 Worker 버전을 복원 가능하게 기록하고, 기존 프로젝트 식별자/Secret 보호/서비스 접근을 확인한다. 일반 학생들은 PIN 설정을 다음 접속 때 안전하게 수행하도록 하며 일괄 임의 PIN 부여/이름으로 계정 병합은 하지 않는다.

PIN 백업으로 원장을 삭제하거나 되돌릴 필요는 없다. 복원 시 최신 학생 상태/UID/게임 포인터를 먼저 읽고 PIN 버전은 단조 증가시킨다. 백업 verifier를 복원하더라도 새 버전으로 기록하고 현재 바인딩은 비활성으로 둔다. 이전 토큰/티켓을 재활성화하지 않는다. 최초 설정 전 계정으로 돌아갈 경우도 담임의 새 티켓을 사용한다. 운영 복원은 대상·이유와 사용자 확인 후 수행한다.

B는 게임 등록 구조/게임 선택 화면과 자유 저장·재개를 구현한다. 인증 API와 학생 ID를 재사용한다. 현재 서버는 답안마다 저장하며 UI의 10문항 쉬는 화면이 실제 서버 저장 한도는 아니다. 현재 **1math3 소스는 시간 제한 없음 + 세션 24시간 만료**이며 사용자의 가이드에 쓰인 ‘기존 5분 제한’과 차이가 있다. B에서 이 차이를 명시하고 타이머/재개 기준을 결정해야 한다. A에서는 게임 시간·채점·완료/순위 규칙을 바꾸지 않았다.

C에서 전체 실제 Google 연동·기존 게임·공개 Pages·Worker 로그·도름스체크 및 접근 통제를 검사한 뒤 main/공개 반영한다. A의 로컬 PASS를 공개 서비스 전체 PASS로 표시하지 않는다. 체크포인트마다 구현 → 검사 → 수정 → PASS → 상태 문서 갱신 후 중단한다.

현재 A+B의 실제 공개 반영과 최종 검증은 [Checkpoint C PASS 기록](CHECKPOINT_C_RELEASE.md)을 참조한다. 아래 내용은 개발 체크포인트 당시의 인계 기록이다.
