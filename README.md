# 수학 별 모으기 · 1math3

학생: https://subsubt.github.io/game/1math3.html

교사: https://subsubt.github.io/game/teacher/

교사는 관리 공간을 만들고 한 번 표시되는 복구 키를 안전하게 보관한 뒤 학급을 만든다. 학생은 참여 코드로 신청하고 교사 승인을 받으면 정규 50문항 기록 도전을 시작한다. 서버에서 기록과 순위를 확정한다. 기기를 바꾼 학생은 교사가 발급하는 10분 유효 일회용 복귀 티켓을 사용한다.

Google 연결은 선택 사항이다. 미연결 상태에서도 학급 관리와 게임 기록은 정상 작동한다. 연결한 교사는 비공개 Sheets 관리표를 생성/동기화하며 Google 문제가 생겨도 게임 원장은 계속 저장된다. 공개 순위에는 별명과 최고점만 표시된다.

기존 Firebase `math3-dev`, Worker `math3-cp3-dev`, 기존 Google OAuth 설정을 공개 서비스에 사용한다. 새 production 환경이나 데이터 이전은 하지 않는다. 기존 게임은 [홈](https://subsubt.github.io/game/), [1math1](https://subsubt.github.io/game/1math1.html), [1math2](https://subsubt.github.io/game/1math2.html)에서 계속 실행된다.

운영/복구: [release](docs/CHECKPOINT5_RELEASE.md). 실제 근거와 현재 최종 판정: [live evidence](docs/CHECKPOINT5_LIVE_EVIDENCE.md), [개발 상태](docs/DEVELOPMENT_STATE.md).
