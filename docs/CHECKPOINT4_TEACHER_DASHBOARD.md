# Checkpoint 4 — 교사용 대시보드 구현 및 검증

기준일: 2026-09-29. **Checkpoint 4 PASS.** 프로젝트 저장소: <https://github.com/subsubT/game>. Firebase 개발 프로젝트 `math3-dev`, Cloudflare 개발 Worker `math3-cp3-dev` (`ca481375-85f6-42e0-a40b-679c10e915ff`). Supabase와 Vercel은 이 프로젝트에서 사용하지 않는다.

## 구현

- `teacher/index.html`을 교사 대시보드로 교체했다. 익명 인증을 브라우저에 유지하고, 신규 공간 생성과 일회성 복구 키를 통한 복구를 제공한다. 복구 키는 화면을 닫으면 다시 표시하지 않는다.
- 학급 선택, 참여 코드, 참여 대기와 승인, 학생 검색과 최고점·최근 기록, 회차별 기록과 문항별 최초 응답, 학급 순위, 학급 단위 전체 순위 등록 해제·복원, 학생 복귀 티켓을 한 화면에서 제공한다. 학급 전환과 탭 전환 때 서버 자료를 다시 읽는다.
- 두 단계 문항은 선택한 카드 번호와 카드 값, 최종 답을 별도로 보여준다. 건너뜀과 미응답을 구분한다. 조회 API만 사용하므로 상세 화면을 열어도 원장은 수정되지 않는다.
- `getTeacherLeaderboard`를 Functions와 생성된 Worker 핸들러에 추가했다. 기존 교사 소유권 확인 후 해당 학급의 월별 공개 별명·최고점·공동 순위만 반환한다. 학생용 전체 순위 계약은 유지한다. 학급 목록에 참여 상태, 학생 목록에 전체 등록 설정·최고점 정보를 추가했다.
- 설정 변경과 복귀 티켓 발급에 확인 단계를 두고, 요청 중 중복 클릭을 막는다. 응답 오류는 교사가 이해할 메시지로 치환한다. 토큰, 복구 키, 내부 식별자는 URL에 넣지 않는다.

## 검증

| 검사 | 결과 |
|---|---|
| `npm test` 학생 게임·인증 18개 | PASS |
| `npm run check:worker` Worker 생성 상태·드라이런 | PASS |
| `npm run emulators:worker` 교사 순위 소유권·최고점·Firestore 직접 접근 거부·기존 채점 | PASS |
| `npm run emulators:test` Functions fallback·두 교사 격리·순위·복귀·Rules | PASS |
| `npm run emulators:browser` 두 학급 전환·승인·50문항·학생 기록·문항 상세·순위 설정·복귀 티켓·모바일 폭 | PASS |
| `tests/worker-live-browser.test.js` 실제 Firebase SDK와 개발 Worker의 교사→학생 50문항→교사 상세·순위 | PASS |
| `tests/worker-live.test.js` 실제 개발 Worker 두 교사·두 학급 API, 순위·공개 설정·교사 소유권 | PASS |

실제 개발 테스트는 가상 학급과 익명 계정을 `math3-dev` Firestore에 남긴다. Chromium의 정적 파일은 Playwright가 허용 Origin에서 제공했으며, GitHub Pages에 최종 게시한 검증은 아니다. `index.html`, `1math1.html`, `1math2.html`은 수정하지 않았다. 개발 전체 순위 테스트는 이전 실행에서 남은 같은 달의 가상 기록을 허용하고 이번 실행에서 추가한 행의 증감을 검사한다.

## 알려진 범위

- 기존 서버는 한 교사의 학급 최대 50개, 대기/승인 학생과 회차 조회 최대 200건으로 제한한다. 예상 학급 규모 안에서 사용하며 대규모 페이지네이션과 월별 200건 전체 순위 재투영 한도는 후속 규모 검증 대상이다.
- 신규 Google 로그인, OAuth, Sheets 동기화와 최종 운영 배포는 Checkpoint 5 범위다.
