# Checkpoint 5 — 사용자가 직접 할 Google 개발 설정

2026-10-05. **실제 Google 개발 통합 PASS. 실제 연결 해제/revoke·재승인·같은 파일 복원까지 완료했다.** 최신 Worker `e9bc9633-db9c-457e-aeb6-cbc68f02664d`의 근거는 [실제 검증 기록](CHECKPOINT5_LIVE_EVIDENCE.md)에 있다. [운영 Pages 설정 조건](CHECKPOINT5_PAGES_PREPARATION.md)은 남았다. 아래 절차는 설정 이력이며 다시 실행하지 않는다. 개발 Firebase/Worker를 운영으로 승격하지 않는다. Secret 값이나 OAuth JSON을 채팅에 보내지 않는다.

사용자가 Drive/Sheets API, External/Testing·Test user, openid/drive.file, 고정 callback Web client, Firebase Google provider/허용 도메인, 세 Secret 등록 완료를 확인했다. Wrangler 4.138.0·4.147.0의 `versions secret list --latest-version` 오류를 배포 게이트로 사용하지 않았다. 활성 `wrangler secret list`는 이름만 검사했으며 실제 인증된 Worker에서 준비 여부를 확인했다.

자동화 Chrome의 Google 로그인 차단을 확인해 **일반 Chrome + Firebase 개발 preview**로 바꿨다. 주소: `https://math3-dev--cp5-google-q3ym6qkw.web.app/game/teacher/index.html` (1일 만료, site `math3-dev`, channel `cp5-google`). Firebase CLI의 preview authorized domain 등록 전 기존 도메인 목록을 비공개 백업했다. Worker callback과 Google Web client 설정은 그대로이고, Worker 고정 복귀 URL만 이 preview로 변경했다. 추가 수동 Console 작업은 필요 없다. 열린 일반 Chrome에서 Console에 등록한 Test user 계정을 선택·승인한다. GitHub Pages 최종 공개와 production은 변경하지 않았다.

등록된 암호화 키는 서버의 32바이트 형식 검사에 실패했다. 값을 읽지 않고 오류 코드로 진단했고, 새 무작위 32바이트 개발 키를 stdin으로 등록했다(값 출력/파일 저장 없음). 이전 설정은 Worker `4bf2f5df-3e99-4563-9fc7-87e7fd5de22e`에 보존된다. 현재 `84d284a2-9508-4fac-8822-6b3f53660231`에서 `configured:true` 확인. Client ID/Secret은 바꾸지 않았다. 키 등록 도우미를 다시 실행하거나 기존 키로 덮어쓰지 않는다. 최신 Secret 목록 실패 시 도우미는 안전하게 중단하며 이 계정에서 그 성공을 전제로 진행하지 않는다.

## 1. 현재 프로젝트 식별

| 항목 | 확정 값 |
|---|---|
| 저장소 | https://github.com/subsubT/game |
| 개발 Firebase / Google Cloud 프로젝트 | `math3-dev` |
| 개발 Worker | `math3-cp3-dev` |
| Worker HTTPS callback | `https://math3-cp3-dev.subsubt-math3-dev.workers.dev/oauth/google/callback` |
| 허용 대시보드 복귀 위치 | `https://subsubt.github.io/game/teacher/index.html` |
| 허용 브라우저 Origin | `https://subsubt.github.io` |
| Supabase / Vercel | 사용하지 않음. project ref / projectId / orgId 없음 |

위 Pages 위치는 **복귀 위치로 확정한 값**이며 새 교사 화면을 실제 Pages에 게시·검증했다는 뜻이 아니다. 실제 Google 검증 때 이 화면이 해당 Origin에서 제공되어야 한다. 최종 공개 운영 Pages 산출물은 별도 production 리소스 설정 이후 준비한다.

2026-10-05 실제 GitHub Pages 설정 조회: 기존 공개 주소 `https://subsubt.github.io/game/`, source `main`의 `/`, build type `legacy`, status `built`. CP5 준비 코드는 별도 `codex/checkpoint5-google-sheets` 브랜치에 저장하므로 이 공개 source를 변경하지 않는다. 최종 통합 때 repo root를 공개하는 현재 방식을 그대로 사용하지 않고 allowlist 산출물로 전환한다.

## 2. Google Cloud Console에서 할 일

1. Google Cloud Console에서 **`math3-dev`**를 선택한다. 기존 게임의 Cloud 프로젝트를 변경하지 않는다.
2. API 라이브러리에서 **Google Drive API**, **Google Sheets API** 두 API를 활성화한다. Apps Script API는 필요 없다. 새 유료 결제를 요구하면 진행하지 않고 알린다.
3. Google Auth Platform의 Branding / Audience / Data Access를 설정한다. 개발용 이름은 `1math3 개발 Sheets 연동`, 지원 이메일은 본인 계정으로 지정한다. 개인 계정까지 시험하려면 Audience **External**, 게시 상태 **Testing**을 사용하고 본인의 시험 Google 계정을 **Test users**에 추가한다. 학교 조직 전용 Internal을 선택하면 해당 조직 밖 계정은 사용할 수 없다. 학교 관리자 정책으로 차단되면 우회하지 않는다.
4. Workspace 동의 scope는 **`openid`**, **`https://www.googleapis.com/auth/drive.file`**만 등록한다. email/profile, spreadsheets 전체 권한, Drive 전체 권한, Apps Script 권한은 이 Workspace 클라이언트에 추가하지 않는다. Data Access 검색에서 openid가 기본 신원 scope로 처리되어 별도 표시되지 않아도 요청 코드는 openid를 보낸다.
5. Clients → Create client → 앱 유형 **Web application(웹 애플리케이션)**. 이름 `1math3 개발 Worker Sheets`. Firebase Google 로그인용 클라이언트와 별도 권한 계약이다.
6. 이 **Worker Workspace OAuth 클라이언트**의 Authorized JavaScript origins는 **등록 불필요, 비워 둔다**. 브라우저 Google JS SDK/토큰 발급을 사용하지 않고 Worker 서버가 code를 교환한다. Pages 주소를 Redirect URI로 등록하지 않는다.
7. Authorized redirect URIs에 정확히 다음 **한 개**를 등록한다. 끝에 `/`를 추가하지 않는다.

```text
https://math3-cp3-dev.subsubt-math3-dev.workers.dev/oauth/google/callback
```

8. 생성 직후 제공되는 OAuth **Client ID**와 **Client Secret**을 안전한 인증 저장소에 보관한다. 다운로드 JSON은 작업 폴더·저장소 밖에 둔다. Secret을 코드·설정 파일·채팅에 붙이지 않는다.

External + Testing에서 `drive.file`을 요청하면 refresh token은 7일 만료 정책의 대상이다. 앱은 만료 시 재승인을 안내한다. 장기 운영 공개 전에는 운영용 앱의 게시·검증 조건을 별도로 확인한다. [Google 토큰 만료 정책](https://developers.google.com/identity/protocols/oauth2#expiration).

## 3. Firebase Google 계정 연결 설정(별도)

Workspace 연동 자체는 교사 익명 인증으로 사용할 수 있다. 같은 uid를 Google 계정에 연결하고 다른 기기에서 Google로 돌아오는 기능도 검증하려면 Firebase Console → **math3-dev** → Authentication → Sign-in method → **Google**을 켜고 지원 이메일을 설정한다. Firebase가 사용하는 로그인용 OAuth 클라이언트/인증 도메인은 앞서 만든 Worker Workspace 클라이언트와 구분한다.

Authentication → Settings → Authorized domains에서 **`subsubt.github.io`**를 등록/확인한다. 도메인에는 `/game`이나 프로토콜을 넣지 않는다. 기존 `math3-dev.firebaseapp.com` 인증 도메인을 유지한다. Firebase 로그인용 클라이언트의 기본 redirect handler는 `https://math3-dev.firebaseapp.com/__/auth/handler`이며, Worker Workspace 클라이언트의 callback과 서로 대체하지 않는다.

완료 사실을 알려 주면 로컬 공개용 Firebase 설정의 `enableGoogleProvider: true`를 적용하고 실제 연결을 검증한다. 예제 설정은 기본 false다. Firebase linking은 현재 익명 uid를 유지하며 Google subject를 Worker의 신원과 대조한다. 다른 Firebase uid/teacherId에 이미 연결된 Google 계정은 자동 합치거나 학급을 이전하지 않는다. 충돌 시 기존 공간 확인·복구 키 사용을 안내하고 중단한다. 완전한 두 관리 공간 병합은 이번 자동 경로에 없다.

## 4. Wrangler Secret 등록 — 배포 없이 준비

새 이름과 목적:

| Secret 이름 | 목적 |
|---|---|
| `GOOGLE_CLIENT_ID` | 위 **Worker Workspace OAuth 클라이언트** 식별값 |
| `GOOGLE_CLIENT_SECRET` | 서버 code exchange / token refresh |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | 별도 무작위 32바이트 AES-256-GCM 키. Firestore refresh token 및 짧은 OAuth PKCE 봉투 암호화 |

기존 `FIREBASE_SERVICE_ACCOUNT_JSON`, `MATH3_SERVER_SECRET`은 유지한다. Google 설정이 없어도 게임 API가 작동하도록 새 세 이름은 기존 Worker의 필수 Secret 목록에 넣지 않았다. 실제 Google 배포 직전에는 세 이름의 존재를 모두 확인한다.

PowerShell을 열어 프로젝트 폴더로 이동하고 아래 명령을 차례로 실행한다. 입력은 Wrangler의 **숨김 입력 프롬프트**에만 붙인다. Secret 값을 명령 인자에 넣지 않는다.

```powershell
Set-Location -LiteralPath 'C:\Users\덕인초등학교\Desktop\CodexLaptop\gamemaking'
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.wrangler\logs'
npx wrangler versions secret put GOOGLE_CLIENT_ID --name 'math3-cp3-dev'
npx wrangler versions secret put GOOGLE_CLIENT_SECRET --name 'math3-cp3-dev'
node tools/register-google-encryption-key.mjs --dev
```

세 번째 명령은 무작위 암호화 키를 생성해 stdin으로 바로 보낸다. 화면·파일에 키 값을 기록하지 않는다. 최신 버전에 이미 같은 키가 있으면 보존하고 종료하므로 다시 실행하여 덮어쓰지 않는다. 검증한 Wrangler 4.138.0의 `versions secret put`은 최신 Worker 버전에서 바뀐 Secret만 갱신하고 나머지를 이어받으며 **실제 트래픽에 배포하지 않는다**. 마지막 명령도 이름과 버전만 표시한다. 생성된 버전 번호와 완료 여부는 알려 줘도 되지만 값은 보내지 않는다. 도구의 실계정 Secret 등록은 이 체크포인트에서 실행하지 않았다.

일반 `wrangler secret put`은 즉시 버전을 배포하므로 이 게이트에서는 위 **versions** 명령을 사용한다. `wrangler deploy`, `wrangler versions deploy`, 콘솔 Deploy 버튼은 아직 실행하지 않는다. [Cloudflare Secret/버전 동작](https://developers.cloudflare.com/workers/configuration/secrets/).

암호화 키를 잃거나 바꾸면 기존 ciphertext는 복호화할 수 없으므로 재승인이 필요하다. 기존 연결이 있는 환경에서 키를 조용히 덮어쓰지 않는다. 추후 키 회전은 연결/토큰의 복구 계획과 함께 별도로 처리한다.

## 5. 완료 후 알려 줄 내용

“math3-dev의 Drive/Sheets API, OAuth 앱과 테스트 사용자, Worker Secret 세 개 준비 완료”라고만 알려 주면 된다. Firebase Google provider도 설정했다면 함께 알려 준다. **Client Secret·암호화 키·refresh/access/ID token·서비스 계정 JSON은 보내지 않는다. Client ID도 채팅에 보내지 않고 Secret에 직접 등록한다.**

이후 최신 Secret 준비 버전의 이름을 실제 조회하고 필요한 세 이름이 모두 있는지 확인한 뒤, 해당 준비 버전을 적용하고 CP5 소스를 배포한다. Google 계정 로그인/동의 화면은 본인이 직접 처리한다. 실제 계정 충돌·재승인·Drive 문서·Sheets 값·새 Worker 실행에서 자동 작업을 검증하고, 최종 운영 리소스가 준비되기 전에는 CP5 최종 PASS로 판정하지 않는다.

## 6. 최종 운영은 별도 설정 게이트

기존 설계는 새 **production Firebase**, **production Worker**, **production Workspace OAuth client**를 개발 환경과 분리한다. `math3-dev` / `math3-cp3-dev`를 운영용으로 변경하지 않는다. 이번에는 새 production 리소스를 만들지 않았다.

사용자가 production Firebase 프로젝트와 Firestore 위치·무료/결제 정책을 확정해 생성하고, 익명 인증 및 필요시 Google provider를 설정해야 한다. 전용 서버 서비스 계정의 Firestore 권한/인증 저장, 새 Worker의 이름·실제 HTTPS 주소, 별도 OAuth Web client·그 Worker callback, 운영 Secret을 준비한다. **운영 Worker 주소가 아직 없으므로 운영 Redirect URI 값을 임의로 만들어 Console에 등록하지 않는다.** 실제 생성 후 프로젝트 ID·주소를 지침에 기록하고 CORS/Pages/Firebase authorized domain을 대조한다. 운영 학생 수집 조건은 기존 시스템 설계의 별도 게이트를 따른다.

## 공식 문서 확인(2026-10-05)

- [서버 OAuth code/offline/state](https://developers.google.com/identity/protocols/oauth2/web-server)
- [OpenID subject·서명·audience·nonce 검증](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google PKCE S256](https://developers.google.com/identity/protocols/oauth2/native-app#step1): 공식 예시는 installed app 흐름이다. 동일 S256 파라미터를 confidential Web client에 추가한 구현의 실제 수용 여부는 후반 실계정 검증에서 확인한다.
- [Sheets의 권장 drive.file 권한](https://developers.google.com/workspace/sheets/api/scopes)
- [Drive 앱 전용 appProperties](https://developers.google.com/workspace/drive/api/guides/properties)
- [Sheets batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)
- [Firebase 익명 계정 연결](https://firebase.google.com/docs/auth/web/anonymous-auth)
