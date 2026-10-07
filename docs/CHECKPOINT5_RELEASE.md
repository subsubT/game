# Checkpoint 5 운영·배포·복구

2026-10-07 KST. 실제 Pages 게시·핵심 공개 검증 PASS. 공개 Origin Google 최종 검증은 사용자 클릭 대기로 **CP5 전체 최종 PASS 보류**. [실검증](CHECKPOINT5_LIVE_EVIDENCE.md), [Pages 배포](CHECKPOINT5_PAGES_PREPARATION.md).

## 운영 대상

| 대상 | 실제 식별자 / 주소 |
|---|---|
| 저장소 | https://github.com/subsubT/game |
| 학생 | https://subsubt.github.io/game/1math3.html |
| 교사 | https://subsubt.github.io/game/teacher/ |
| Firebase | `math3-dev` |
| Worker | `math3-cp3-dev` · https://math3-cp3-dev.subsubt-math3-dev.workers.dev |
| 활성 버전 | `ca7fbc93-8732-4a84-9b9e-764d6473d14f` |
| callback | Worker의 `/oauth/google/callback` |
| 고정 복귀 | https://subsubt.github.io/game/teacher/index.html |
| CP5 Supabase/Vercel | 사용하지 않음; 기존 1math2 Vercel은 별개 서비스 |

사용자가 기존 환경을 그대로 공개 서비스에 쓰도록 확정했다. dev 이름은 유지한다. 별도 production Firebase/Worker/OAuth 생성은 과거 설계다. 현재 Secret·암호화 키를 임의 회전하거나 데이터를 이전하지 않는다. 이전 preview Origin은 기존 allowlist에 남아 있으나 callback 고정 복귀는 Pages다. 기존 승인 리소스를 임의 삭제하지 않았다.

## 배포

1. `git fetch origin`, 프로젝트 지침의 식별자 대조.
2. `npm test`, `npm run test:sheets-browser`, 필요한 Functions/Worker Emulator. Worker 변경 시 `npm run check:worker`.
3. `node tools/build-pages.mjs`, `node tools/check-public-secrets.mjs`. 12개 공개 파일만 게시. 인증/비공개 자료 stage 금지.
4. 의도한 파일 commit·push. `git status --porcelain`, `git log '@{u}..' --oneline` 확인.
5. `gh workflow run pages.yml --ref main`, run success와 실제 URL 조회. root 전체를 artifact에 넣지 않는다.
6. 셸에 `MATH3_LIVE_TEST=1`, `MATH3_PAGES_TEST=1`을 설정하여 `tests/worker-live-browser.test.js`, `tests/worker-live-firestore-browser.test.js`, `tests/pages-smoke.test.js` 실행. 합성 자료만 생성하며 기존 게임 결과는 저장하지 않는다.
7. Worker 변경 시에만 기존 버전·vars·cron 백업 후 `npx wrangler deploy --name 'math3-cp3-dev'`. `tools/cp5-runtime-observe.mjs`처럼 query/body/token/원시 로그를 버린 집계로 런타임 확인.
8. 일반 Chrome의 실제 Google 승인·Pages callback 복귀·teacherId/학급 유지·Sheets 반복 생성/동기화·해제/재승인 검증. 본인 클릭이 필요한 지점에서만 인계.
9. 도름스체크 v0.3.1 detect/init/security scan은 Git 제외 독립 경로에서 실행. 기존 앱의 설정을 덮어쓰지 않는다. 훅·전역 설치·배포 차단 없음. 위험만 수정하고 권고·미확인은 참고 기록.

## 복구

- Pages: 직전 정상 `de4d12e5969a69d2bbd3c0e0ea1a4e60792ae908`의 allowlist workflow 재게시. 강제 push/reset 금지. artifact에는 원장·Secret이 없다.
- Worker: 이전 `e9bc9633-db9c-457e-aeb6-cbc68f02664d`와 현재 실제 버전 조회 후 대상 복구. 이전 버전은 preview 복귀 vars이므로 공개 운영 복귀 위치도 대조한다. Secret은 출력하지 않는다.
- 원장: 코드 rollback은 DB를 복구하지 않는다. 변경 대상만 비공개 백업으로 복원. 실제 데이터 삭제·덮어쓰기·권한 약화는 대상/이유 설명 후 확인.
- Sheets: Google 장애는 원장 저장을 막지 않는다. 재승인 후 같은 파일에 다시 쓴다. 불확실 생성은 appProperties 검색, 중복 자동 삭제 금지.
- Secret: 암호화 키 교체는 기존 token 복호화를 막는다. 임의 교체하지 않으며 서비스계정/OAuth/token은 서버 인증 저장소에 둔다.

## 제한과 시험 자료

기존 Google Testing/Test user 정책 유지. 실제 두 번째 Google 계정, 7일 grant 만료 경과, 199회차 최대 규모/무료 quota 실측은 이전 검증에서 수행하지 않았다. 구현의 학급당 내보내기 회차·학생 각각 199개 한도는 유지된다.

기존 시험 자료는 삭제하지 않았다. 이번 합성 학급은 `CP5공개검증반`, `CP5격리검증반`, `규칙검증반`; 실제 API 검사는 `CP3A…`/`CP3B…`와 경합 fixture를 추가했다. 생성 익명 계정·OAuth state·학생/회차는 검사 이력으로 남긴다. 비공개 증거/백업은 `.cp5-test-artifacts/final/`, Git/Pages 제외.

도름스체크: 확인 30·미확인 5·해당 없음 1. 일부 Pages 헤더/정책/메타 권고와 미확인은 보안 보증이 아니다. 정적 파일의 `Access-Control-Allow-Origin: *`와 인증 Worker API는 다르다. Worker allowlist/CORS와 Firestore deny Rules는 실제 검사했다. 탐지된 apiKey는 Firebase 공개 config이며 Client Secret/서비스계정/token 노출은 발견되지 않았다.
