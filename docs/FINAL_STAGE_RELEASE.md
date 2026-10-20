# 게임 선택 확장 및 10분 최종 스테이지 — 2026-10-20

**최종 PASS — main 반영·실제 GitHub Pages 게시·공개 학생/교사/Google Sheets 재검증 완료.**

대상: https://github.com/subsubT/game · https://subsubt.github.io/game/ · Firebase math3-dev · Worker math3-cp3-dev. 기존 OAuth/Google Drive/Sheets와 5분 cron을 유지한다. Supabase/Vercel을 새로 만들지 않는다.

## 변경 계약

- 게임 카탈로그에서 100까지의 수(1math2.html)와 덧셈과 뺄셈(1)(1math3)을 고른다. 1math2.html, 1math1.html, index.html의 바이트는 바꾸지 않는다.
- gameId/기본 교육과정·규칙·문제생성 버전, 정규 50문항/500점 및 기존 원장을 유지한다. 새 표시명만 사용한다.
- 50문항을 새로 완료할 때 finalStage 1.0.0을 ready로 추가한다. 이미 완료한 회차는 소급 변경하지 않는다. 아직 진행 중이던 회차는 50문항을 마치면 새 최종 단계에 진입한다.
- 사용자 추가 지시: 기본 점수 + 완료한 최종 스테이지 점수를 합친 **하나의 월별 최고점 순위**를 사용한다. 진행 중에는 학습/최종/현재 합계를 볼 수 있고, 최종 만료 후 트랜잭션으로 기존 board/학생 bestScores/점수별 counts를 함께 갱신한다. 기존 500점과 기존 최고 기록은 낮추지 않는다. 단계별 답안과 진단 점수는 구분한다.

## 출제 근거

프로젝트 docs/CURRICULUM_ANALYSIS.md와 references/math1-2-2의 지도서 182~197쪽, 특히 단원 평가 196~197 및 10 만들기 192~195쪽을 다시 읽고 196쪽의 교과서 평가 그림을 렌더링해 확인했다. 문제 문장과 피드백은 자체 작성하며 원문·그림을 배포하지 않는다.

문제은행 354개: 세 수 덧셈(합 9 이하) 90, 세 수 뺄셈(음수 없음) 90, 10의 보수·등호 양쪽 빈칸 48, 10에서 빼기·빼는 수 찾기 36, 앞/뒤 두 수로 10 만들고 십몇 더하기 90. 식·상황·중간 계산·빈칸·카드 2단계를 섞는다. 다섯 유형을 섞은 묶음으로 무작위 출제하고 문제은행을 모두 소진할 때까지 동일 표시 문제를 재사용하지 않는다. 소진 후 새 순서로 계속한다. 받아올림 두 수 덧셈/십몇에서 빼기/혼합식/음수/곱셈·나눗셈은 제외한다.

## 저장·서버 검증

finalStage는 같은 회차의 별도 상태이며 기본 questionsJson/50개 answers는 바꾸지 않는다. 카드 쌍처럼 Firestore에서 직접 중첩 배열이 될 수 있는 문제는 questionJson/feedbackJson으로 저장하고 finalAnswers 하위 컬렉션에 확정 답안만 한 번 기록한다. 진행 중 문항/seed/정답 원장은 서버에서 관리한다.

600,000ms에서 서버 Date.now 경과만 차감한다. start/resume/answer/save/get은 소속·PIN 버전·기기 바인딩을 트랜잭션 안에서 검사하고, 수정은 expectedRevision과 요청 ID를 검사한다. 클라이언트의 시간·점수·문제·진행 인덱스 주입을 거부한다. 중복 요청은 다시 채점하거나 시간을 재시작하지 않고 최신 서버 상태를 돌려준다. 저장 확인 시 paused, 재개 시 남은 시간에서 새 기준시각을 설정한다. 저장이 확인되기 전에는 시간이 계속 흐른다.

브라우저는 15초마다 서버와 동기화하고 0초에 서버 결과를 요청한다. 연결이 끊겨도 마감 뒤 답은 받지 않는다. 서버 5분 cron도 activeFinalStages에서 만료 회차를 확정하고 동일한 합산 순위와 Sheets outbox를 갱신한다. 오프라인에서는 결과 집계가 cron 실행까지 늦게 보일 수 있지만 허용된 풀이 시간은 늘어나지 않는다. 기존 학급별 원장/Google 설정·deny-all Rules는 유지한다.

교사 상세/회차 목록에 최종 상태·점수·남은 시간·확정 답안을 표시한다. Sheets 네 관리 탭을 유지하면서 회차/학생 요약의 점수를 합산하고 최종 진단 열과 문항 단계 열을 추가한다. 중간 저장은 최종 완료 문항 내보내기에서 제외하고 기본 학습 완료 기록은 계속 보존한다. 한 회차 최종 문항 내보내기/교사 상세 표시는 2,000개까지이며 한도 도달 시 Sheets는 EXPORT_LIMIT으로 기존 파일을 유지한다.

## 백업·복구

운영 변경 전 비공개 .cp5-test-artifacts/final-stage/firestore-before.json, source-before.zip, wrangler-before.jsonc에 원장·기존 소스·설정을 보관한다. 인증값과 개인정보는 Git/Pages/로그에 넣지 않는다. tools/final-stage-backup.mjs preserved로 기존 학급/학생/회차/Google 연결/순위 필드의 불변을 대조한다.

새 최종 단계 데이터가 만들어진 뒤에는 예전 Worker로 단순 롤백하지 않는다. 현재 필드를 보존하고 최종 단계의 시간/채점/합산 순위를 이해하는 수정본을 재배포한다. 전체 백업으로 최신 원장을 덮어쓰지 않는다. 개별 데이터 복원이나 삭제는 사용자 확인 후 수행한다.

## 검사 및 배포 근거

- 자동 단위·보안·점수/PIN/Sheets 회귀 87개 PASS. 1,050점 합산·전체 공개 등록 해제/복원·학생 삭제 뒤 cron의 순위 재생성 방지를 포함한다.
- Chromium 저장/응답 유실·PIN/학생 관리·Sheets 회귀 3개 PASS. 최종 타이머/카드·숫자 입력 복원과 합산 40점의 교사 50+3문항 상세도 확인했다.
- 실제 Firestore REST Emulator 4개 PASS. 최종 카드 원장 직렬화와 중복 저장/기기 이전/10문항/600점 합산 포함. 실제 검사에서 발견한 REST 조회 200개 한도와 새 최종 상세의 2,000개 요청 충돌을 수정 후 동일 검사를 통과했다.
- 실제 Firebase SDK/Worker + 후보 Pages 파일로 50문항/500점, 실제 최종 3정답/30점, 저장 응답 유실·같은 ID 재시도, PIN 다른 context 이동/입력·점수·남은 시간 정확 복원, 새로고침 후 시계 유지, **서버 시간이나 DB 마감 시각을 바꾸지 않은 실제 10분 만료**, 합산 530점의 기존 학급 순위 PASS. 브라우저 pageerror/서버 5xx 0. 비공개 live-browser.json/live-final-complete.png에 근거를 보관한다.
- 실제 API 8범주 PASS: 클라이언트 시간/점수/문제 주입, 오래된 저장, 다른 학생, 다른 교사/학급·역할 혼용, 무인증, 위조 토큰, 다른 Origin, 실제 Firestore 직접 읽기/쓰기 거부. 가상 검증 학급은 전체 공개 순위에서 제외했다.
- Worker 60초 실제 관찰 6요청, 모두 200, 서버·내부·cron 오류 0. 후보 Worker `90c7ce49-5556-4b66-801c-c10ff5df683c`.
- 시작 시 실제 sheetConnections가 비어 있었고 현재 교사 UI도 연결 안 됨이었다. 사용자가 기존 Google 계정을 직접 선택해 동일 OAuth 앱/동일 범위로 재연결했다. 새 `최종검증1020` 가상 학급에 비공개 관리표 생성·실제 sync·같은 파일 반복 sync를 확인했다. 실제 XLSX: 요약 1/회차 1/문항 53(기본50+최종3), 500+30=530, 행 고유53, 실제 이름 제외, 오류0 PASS. Google UI `나에게만 공개` 확인. 원래 학급의 Sheets 파일을 새로 쓰거나 공유하지 않았다.
- 백업 5,704문서, SHA-256 `6c46d9b894de209848d840cd18e4e68c775728c2e45cdd16f8a162e3ed82a44b`. 기존 학급/학생/회차/답안/점수 집계/순위 2,453개 비교: 2,451개 필드 완전 동일. 두 차이는 (1) 수치가 같은 전체 순위 counts의 updatedAt, (2) 기존 가상 `CP5실제검증반`의 codeCipher다. 후자는 기존 교사 검증 프로필을 열면서 이미 구현된 8→4자리 자동 전환이 실행된 것으로 원자적 joinCodeBackups와 원래 코드 인덱스·원래 만료 보존을 실제 조회해 확인했다. 학습·학생·점수·순위는 소급 변경하지 않았다. 값과 암호문은 비공개 증거에만 보관한다.
- 서버는 catalogVersion=2에서 두 게임을 보내고 구형 번들에는 이해하는 기존 gameId만 보낸다. 기존 열린 화면과 후보 Worker 사이에서도 새 ID로 인한 선택 실패를 막는다.

## 공개 배포 및 최종 재검증

기능 main 커밋 `4cf146a65adad12b9686e8d8496acc78cc2965ad`, [Pages run 39361382730](https://github.com/subsubT/game/actions/runs/39361382730) success. Worker `90c7ce49-5556-4b66-801c-c10ff5df683c`. 학생 https://subsubt.github.io/game/1math3.html · 교사 https://subsubt.github.io/game/teacher/ . 최종 문서/공개 검사 코드와 교사 복귀 안내의 새 표시명을 마지막 커밋에 반영해 다시 게시한다. 최종 문서 커밋과 run은 GitHub 이력/최종 보고에서 대조할 수 있다.

공개 결과/교사 복귀 안내 반영 커밋 `7f9817c`, [Pages run 39362409440](https://github.com/subsubT/game/actions/runs/39362409440) success. 마지막 checkout 상태 검사에서 Windows CRLF 때문에 생성물의 최신 여부를 잘못 판정하는 기존 빌드 도구의 비교 문제를 발견했다. 학생 빌더 입력/비교와 Worker 빌더 비교를 LF로 정규화했고, 실제 CRLF checkout에서 두 --check 및 classic-script 검사 2개 PASS를 확인했다. 공개 실행 파일은 바꾸지 않는다. 이 검사 수정 뒤 최종 main과 같은 커밋의 산출물을 한 번 더 게시한다.

- **공개 학생 전체:** 실제 게시 자산만 사용. 두 게임 표시 및 1math2 실제 이동, 기존 530점 완료 화면, 새 50문항/500점, 새 최종 2정답/20점, 저장/새로고침 뒤 점수·남은 시간 정확 복원, 아직 완료하지 않은 새 최종 기록이 기존 최고 530점을 낮추거나 재계산하지 않음 PASS. 브라우저 console/pageerror와 서버 5xx 0, 모바일 가로 넘침 없음.
- **공개 교사:** 실제 사용자의 Chrome에서 새 표시명·530점/기본500점 상세·최종30점/완료/0초·53문항 카드와 콘솔 오류0 확인. 새 중간 회차와 완료 회차를 구분한다. 기존 Google 계정 재연결과 `나에게만 공개` 관리표는 동일 서비스에서 유지한다.
- **공개 파일:** HTTP 200인 실제 공개 11파일이 후보 산출물과 일치. index/1math1/1math2는 시작 커밋 90c944b의 Git blob과 바이트까지 동일. 기존 세 게임의 시작·채점·콘솔 회귀 PASS(운영 점수 미작성). 새로운 서버 모듈/문제은행 모듈/문서/테스트/백업/환경 경로 404. 12파일 allowlist와 비밀값 패턴 검사 PASS.
- **Google 최종 재검증:** 공개 새 학습 회차를 만든 뒤 같은 관리표에 반복 sync. XLSX 요약1/회차2/문항103(기본100+완료 최종3), 행 고유103, 최고530/최근 기본500, 완료 최종30점과 저장 최종20점 구분, 저장 최종의 미완료 2문항은 내보내기 제외 PASS. 별명만 내보내고 개인 이름은 제외한다. 기존 다른 학급 관리표는 다시 작성하지 않았다.
- **운영 보존:** 공개 검사 뒤 다시 2,453개를 대조해 같은 두 메타데이터 차이만 확인했다. 기존 학생·답안·점수·완료 기록·점수 분포는 보존한다. 원래 구코드 인덱스/만료와 자동 전환 백업도 재확인했다.
- **최종 런타임:** 60초 10이벤트(200×9, OPTIONS204×1), 인증 probe3 성공, 서버·내부·cron 오류0.
- **도름스체크 v0.3.1:** 전역 설치 없이 독립 검사 폴더에서 detect → init(실제 앱 이름/학생 URL, security, ownership 확인) → scan. 확인29/미확인6/해당없음1, 위험 실패0. 권고는 Pages의 보안 헤더·정책/연락처·메타 정보와 정적 파일 CORS * 등이다. 인증 Worker의 Origin/토큰/역할·학생/학급 소유권과 Firestore Rules 거부는 별도의 실제 검사로 확인했다. 검사가 전체 안전을 보증하지 않으며 전역 훅/배포 차단 설정을 추가하지 않았다.

## 변경 파일

| 영역 | 파일 |
|---|---|
| 학생 | 1math3.html; src/games/catalog.js; src/games/1math3/core.js, final-stage.js; src/services/firebase-game-service.js; src/student/app.js, 1math3.bundle.js, 1math3.css |
| 서버 | functions/index.js; functions/lib/catalog.js, core.js, final-stage.js; worker/src/index.js, generated-handlers.js, firestore-rest.js, sheet-data.js, final-stage-jobs.js |
| 교사 | teacher/index.html, dashboard.js |
| 검사 | package.json; tests/1math3-browser-bundle.test.js, game-progress-browser.test.js, worker-emulator.test.js, final-stage.test.js, final-stage-live-browser.test.js, final-stage-public.test.js |
| 빌드·근거 도구 | tools/build-1math3.mjs, build-functions.mjs, build-worker.mjs; tools/final-stage-backup.mjs, final-stage-preserve.mjs, final-stage-metadata-audit.mjs, final-stage-evidence.mjs, final-stage-security.mjs, final-stage-public-assets.mjs, final-stage-sheet.py |
| 인계 | AGENTS.md; docs/DEVELOPMENT_STATE.md, FINAL_STAGE_RELEASE.md |

## 남은 운영상 한계

기존 4자리 학급 코드/학생 PIN 정책과 한 기기 활성 바인딩을 유지한다. 다른 기기로 미확정 입력까지 이동하려면 서버가 확인한 저장이 필요하다. 저장 확인 전 종료하면 실행 중 시간이 계속 차감되며, 오프라인 확정 표시/순위 반영은 다음 서버 조회나 기존 5분 cron 처리까지 지연될 수 있지만 풀이 가능 시간이 늘어나지는 않는다. 기본 50문항은 계속 무제한이다.

기존 Sheets 199학생/199회차 한도를 유지하며 최종 문항 상세/내보내기는 2,000개 한도를 적용한다. Google Testing/테스트 사용자 정책, 장기간 학교 전체 동시 사용·quota/CPU 부하, 실제 두 번째 Google 계정은 이번 실검증 범위가 아니다. 기존 공개 기록을 새 최종 단계로 소급 전환하거나 합산 점수를 초기화하지 않았다.
