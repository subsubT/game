# 현재 공개 서비스 운영 결정 (2026-10-07)

- GitHub 저장소: `https://github.com/subsubT/game`; Pages: `https://subsubt.github.io/game/`.
- 1math3 Firebase: `math3-dev`; Worker: `math3-cp3-dev`; API: `https://math3-cp3-dev.subsubt-math3-dev.workers.dev`.
- 현재 Google OAuth Client/Drive/Sheets를 그대로 사용한다. 별도 production 환경 생성, 이름 변경, 데이터 이전은 하지 않는다.
- Pages는 `.github/workflows/pages.yml`과 `tools/build-pages.mjs`의 정적 파일 allowlist로 게시한다. 공개 설정은 `config/pages-public.json`이다. 서버 소스/문서/테스트/로컬 인증/증거/비공개 자료는 산출물에서 제외한다.
- 이번 작업은 GitHub Pages 배포다. 아래 Vercel 식별자는 기존 1math2 서비스의 이력이며 이번 Pages 배포 대상을 뜻하지 않는다. Supabase는 사용하지 않는다.
- CP5 최종 PASS는 실제 Pages 학생/교사/Firebase/Worker/Google 전체 검증 후에만 기록한다. 기존 데이터 삭제와 접근 통제 완화는 하지 않는다.

# 기존 1math2 프로젝트 지침

## 목표와 범위

- 기존 `1math2.html`을 기능 변경 없이 완성본으로 사용하고 Vercel의 공개 루트 주소에서 실행한다.
- 정적 배포 설정, 보안 헤더, 검사 설정만 추가하며 기존 `1math1.html`과 `index.html`을 보존한다.
- 이 앱은 Supabase가 아니라 기존 Firebase Realtime Database를 사용한다.

## 검증 기준

- GitHub 원격 커밋과 로컬 `HEAD`가 같고 작업 폴더와 미전송 커밋이 없다.
- `dcheck` code 검사와 live 검사 및 gate 검증이 모두 통과한다.
- Vercel 배포가 Ready이고 production alias가 정확한 배포를 가리킨다.
- 공개 루트 주소가 HTTP 200을 반환하고 `100까지의 수 탐험대` 시작 화면, 실시간 순위 조회, 게임 시작과 정답 채점이 동작한다.
- 브라우저 콘솔과 Vercel 런타임 로그에 앱 오류가 없다.

## 프로젝트 연결 식별자

- GitHub 저장소: `https://github.com/subsubT/game`
- Supabase project ref: 사용하지 않음
- Firebase projectId: `math-game-b22f3`
- Firebase database host: `math-game-b22f3-default-rtdb.asia-southeast1.firebasedatabase.app`
- Vercel 팀: `subsub-tschool`
- Vercel 프로젝트: `1math2`
- Vercel projectId: `prj_4f8uGANfKxYIbVcONplwGCxsnLb3`
- Vercel orgId: `team_JKZ7B5OCf27pFKiNlhvSVuE4`

## 보안과 데이터

- `.env.local`, `.vercel`, 인증 파일과 비밀값을 Git에 넣지 않는다.
- Firebase 웹 설정은 공개 클라이언트 식별 정보이며 권한 부여 수단으로 취급하지 않는다.
- 별명과 성적의 실제 접근 통제는 Firebase Security Rules와 App Check에 의존하므로 배포 검사가 보안을 보증한다고 표현하지 않는다.
- 검증을 위해 운영 순위표에 테스트 결과를 남기지 않는다.
