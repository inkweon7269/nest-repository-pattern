# Google OAuth 로그인 PRD & 구현 가이드

> `apps/service`에 Google OAuth 2.0 기반 소셜 로그인을 추가한다. 기존 CQRS + Repository Pattern + ISP 구조를 그대로 따르며, JWT 토큰 발급 플로우를 재사용한다.

---

## 1. 개요

### 1.1 배경

현재 `apps/service`는 이메일/비밀번호 기반 JWT 인증만 지원한다. 가입 마찰을 줄이고 사용자 확장을 위해 Google OAuth 로그인을 추가한다. `apps/back-office`는 사내 admin 전용이므로 본 기능 적용 대상에서 제외한다.

### 1.2 목표

- Google Authorization Code Flow(서버 사이드 redirect) 기반 소셜 로그인 추가
- 기존 JWT 발급 플로우(`accessToken` + `refreshToken` + `hashedRefreshToken` 회전) 재사용
- 동일 이메일이 이미 비밀번호로 가입되어 있으면 **명시적 연결**을 요구(자동 연결 금지)
- 향후 카카오·네이버 등 멀티 프로바이더 확장이 가능한 스키마 설계
- 기존 아키텍처 패턴(CQRS + Repository ISP + BaseRepository) 100% 준수

### 1.3 핵심 결정 사항

| 결정 항목 | 선택 | 근거 |
|---|---|---|
| OAuth 플로우 | Authorization Code (서버 redirect) | 표준 웹 앱 패턴, `passport-google-oauth20` 활용 |
| 적용 범위 | `apps/service`만 | back-office는 사내 admin 전용 |
| 동일 이메일 정책 | 명시적 연결 요구(409 반환) | 계정 탈취·암묵적 연결 위험 최소화 |
| 스키마 분리 | `oauth_accounts` 테이블 신설(1:N) | 멀티 프로바이더 확장성, `users` 스키마 보존 |
| 비밀번호 컬럼 | `users.password` NOT NULL 유지 | 구글 단독 가입자에는 무작위 시크릿 저장(향후 비밀번호 설정 기능 대응) |

### 1.4 API 명세

| Method | Path | 인증 | 설명 | 응답 |
|---|---|---|---|---|
| GET | `/v1/auth/google` | 무인증 | Google 동의 화면으로 redirect | 302 redirect |
| GET | `/v1/auth/google/callback` | 무인증 | 콜백 처리, 토큰 발급 후 프론트 redirect | 302 redirect |
| **POST** | `/v1/auth/google/link` | `JwtAuthGuard` (Bearer 헤더) | 인증 사용자가 구글 계정 연결 시작 — Google 동의 화면 URL 반환 | **200 JSON `{ authorizationUrl }`** |
| GET | `/v1/auth/google/link/callback` | state 토큰 검증 | 연결 콜백, OAuthAccount 추가 | 302 redirect |
| DELETE | `/v1/auth/google/unlink` | `JwtAuthGuard` | 구글 계정 연결 해제 | 204 No Content |

> URI는 `app.module.ts`의 `defaultVersion: '1'` 정책으로 자동 prefix 적용.

> **`POST /link`인 이유**: 브라우저 top-level navigation(`window.location.href`)으로는 `Authorization` 헤더를 추가할 수 없어 GET + Bearer 조합은 동작 불가. POST + JSON `{ authorizationUrl }` 패턴은 프론트가 fetch로 인증 헤더를 보낼 수 있고, 받은 URL로 직접 redirect만 하면 된다. CORS preflight(OPTIONS)는 본 프로젝트의 `applySecurityMiddleware`가 이미 `Authorization` 헤더와 `OPTIONS` 메서드를 허용하므로 추가 설정 불필요(`libs/shared/src/bootstrap/security.ts`).

#### Link 플로우의 사용자 식별 메커니즘

브라우저 OAuth redirect는 Authorization 헤더를 보낼 수 없어 콜백 시점 사용자 식별이 어렵다. 본 프로젝트는 다음 3단 인프라로 해결한다.

1. **`GoogleLinkInitiator`** (`apps/service/src/auth/google-link-initiator.service.ts`)
   - 평범한 도메인 서비스 — `buildAuthorizationUrl(userId)` 메서드 노출
   - 인증된 user.id로 signed JWT(state)를 발행하고 Google OAuth 2.0 authorization URL을 빌드해 반환
   - state payload: `{ sub: userId, type: 'google-link-state', jti: uuid }`, 5분 만료, `JWT_ACCESS_SECRET` 재사용
   - 컨트롤러는 `JwtAuthGuard`로 user를 식별 후 이 서비스 호출 → 결과를 `LinkInitiateResponseDto`로 반환
2. **`GoogleLinkStrategy`** (`state: false`, `passReqToCallback: true`)
   - passport의 자동 state 비활성화하고 우리가 직접 검증
   - `validate(req, ...)`에서 `req.query.state`를 `JwtService.verify`로 검증, `type='google-link-state'` 체크
   - 반환: `{ userId, profile }`
3. **콜백 컨트롤러** — `req.user`에 들어온 `{ userId, profile }`를 `LinkGoogleAccountCommand`로 전달

### 1.5 프론트엔드 통합 가이드 (Link 플로우)

```typescript
// 1) 인증된 fetch로 link 시작 호출
const res = await fetch('/v1/auth/google/link', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (res.status === 401) {
  // 토큰 만료 → 리프레시 또는 재로그인
  return;
}
if (!res.ok) {
  // 429 등 처리
  return;
}
const { authorizationUrl } = await res.json();

// 2) Google 동의 화면으로 이동 (top-level navigation)
window.location.href = authorizationUrl;

// 3) 콜백은 백엔드가 처리하여 GOOGLE_FRONTEND_REDIRECT_URL로 redirect
//    프론트 라우트(예: /oauth/callback)에서 fragment 파싱:
//    - #linked=true            → 성공
//    - #error=email_not_verified
//    - #error=link_conflict
```

### 1.6 콜백 → 프론트 토큰 전달 (Login 플로우)

`GET /v1/auth/google/callback`에서 토큰 발급 후 `GOOGLE_FRONTEND_REDIRECT_URL`로 redirect. 토큰은 **fragment(`#`)** 로 전달한다.

```
${GOOGLE_FRONTEND_REDIRECT_URL}#accessToken=eyJ...&refreshToken=eyJ...
```

| 시나리오 | redirect URL fragment |
|---|---|
| 신규 가입 또는 기존 OAuth 사용자 로그인 | `#accessToken=...&refreshToken=...` |
| 동일 이메일 비번 사용자 충돌 | `#error=email_already_exists&email=user@example.com` |
| 미검증 이메일 | `#error=email_not_verified` |

> `?` query string이 아닌 `#` fragment를 사용하여 액세스 로그/리퍼러 헤더에 토큰 노출 방지.

> Link 플로우의 콜백(`GET /v1/auth/google/link/callback`)도 동일하게 `GOOGLE_FRONTEND_REDIRECT_URL`로 redirect하지만 fragment는 `#linked=true` / `#error=link_conflict` / `#error=email_not_verified` 중 하나.

---

## 2. 기술 결정

### 2.1 OAuth 플로우 단계

```
[Browser] ─GET /v1/auth/google──────────────────▶ [Service]
                                                      │
                                                      ▼
[Browser] ◀──302 redirect to Google────────────── [Service]
                  │
                  ▼
[Google 동의 화면] ──사용자 승인──▶ [Google]
                                      │
                                      ▼
[Browser] ◀──302 redirect to /callback?code=xxx── [Google]
                  │
                  ▼
[Browser] ─GET /v1/auth/google/callback?code=xxx▶ [Service]
                                                      │
                                                      ├─ Google에 token exchange 요청
                                                      ├─ 프로필 조회 → GoogleStrategy.validate()
                                                      ├─ GoogleLoginCommand 실행
                                                      └─ JWT 발급 + redirect URL 생성
                                                      ▼
[Browser] ◀──302 redirect to FRONT#accessToken── [Service]
```

### 2.2 동일 이메일 충돌 분기

`GoogleLoginHandler`의 분기 로직:

```
1. validate() 결과의 emailVerified === false
   → UnauthorizedException ('Google 미검증 이메일')

2. oauth_accounts 조회 (provider='google', providerId=sub)
   → 매칭됨: 해당 user.id로 AuthTokenIssuer 호출, JWT 발급

3. 매칭 없음 + users 테이블에 동일 이메일 존재
   → ConflictException ('이미 가입된 이메일')
   → Controller가 catch하여 #error=email_already_exists로 redirect

4. 매칭 없음 + 동일 이메일 없음 (신규 가입)
   → users 레코드 생성 (password: 무작위 bcrypt 해시)
   → oauth_accounts 레코드 생성
   → AuthTokenIssuer로 JWT 발급
```

### 2.3 보안 결정

| 항목 | 정책 |
|---|---|
| `email_verified` | `false`면 즉시 거부 (G Workspace 임의 도메인 탈취 방지) |
| CSRF 방어 | `passport-google-oauth20`의 `state: true` 옵션 활성화 |
| Redirect URL | `GOOGLE_FRONTEND_REDIRECT_URL` 환경변수 단일 값 고정 (open redirect 방지) |
| 토큰 전달 | URL fragment (`#`) — 서버 로그/리퍼러 노출 차단 |
| Rate Limiting | `/auth/google`, `/auth/google/callback`에 기존 `@Throttle({ short: 2/1s, long: 5/60s })` 적용 |
| 단독 OAuth 가입자 비번 | `crypto.randomBytes(32).toString('hex')` → bcrypt 해시 (실제 시크릿이며, 사용자 미노출) |

### 2.4 CQRS 분류

| Command | 설명 |
|---|---|
| `GoogleLoginCommand` | 콜백에서 신규 가입/기존 로그인 통합 처리 |
| `LinkGoogleAccountCommand` | 인증된 사용자에 구글 계정 연결 |
| `UnlinkGoogleAccountCommand` | 구글 계정 연결 해제 |

3개 모두 상태 변경이므로 Command. 신규 Query는 없음(`GetProfileHandler` 재사용).

### 2.5 토큰 발급 로직 단일화

기존 `LoginHandler`(`apps/service/src/auth/command/login.handler.ts:21-58`)와 `RefreshTokenHandler`에 분산되어 있는 JWT 발급 + `hashedRefreshToken` 저장 로직을 `AuthTokenIssuer` 서비스로 추출하여 3개 Handler(`Login`, `RefreshToken`, `GoogleLogin`)가 공유한다.

```ts
// apps/service/src/auth/auth-token-issuer.service.ts
@Injectable()
export class AuthTokenIssuer {
  async issueTokens(user: User): Promise<AuthTokens> {
    // 1. accessToken 발급 (JWT_ACCESS_SECRET, JWT_ACCESS_EXPIRATION)
    // 2. refreshToken 발급 (JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRATION, type: 'refresh', jti: uuid)
    // 3. SHA256 digest → bcrypt(10) → users.hashedRefreshToken 업데이트
    // 4. { accessToken, refreshToken } 반환
  }
}
```

### 2.6 패키지 의존성

```bash
# 런타임
pnpm add passport-google-oauth20

# 개발용
pnpm add -D @types/passport-google-oauth20
```

기존 `@nestjs/passport` / `passport` / `@nestjs/jwt` / `bcrypt`는 그대로 재사용.

---

## 3. 파일 구조

### 3.1 신규 생성 파일

```
libs/shared/src/
├── entities/
│   └── oauth-account.entity.ts                     # OAuthAccount 엔티티
└── migrations/
    └── {timestamp}-CreateOauthAccountTable.ts       # oauth_accounts 마이그레이션

apps/service/src/auth/
├── interface/
│   ├── oauth-account-read-repository.interface.ts   # IOAuthAccountReadRepository + Filter
│   └── oauth-account-write-repository.interface.ts  # IOAuthAccountWriteRepository + CreateInput
├── oauth-account.repository.ts                      # OAuthAccountRepository (BaseRepository 상속)
├── oauth-account-repository.provider.ts             # DI provider 배열 (useExisting 패턴)
├── auth-token-issuer.service.ts                     # JWT 발급 + hashedRefreshToken 저장 헬퍼
├── auth-token-issuer.service.spec.ts                # 단위 테스트
├── command/
│   ├── google-login.command.ts                      # GoogleLoginCommand 값 객체
│   ├── google-login.handler.ts                      # GoogleLoginHandler (4분기)
│   ├── google-login.handler.spec.ts                 # 단위 테스트
│   ├── link-google-account.command.ts
│   ├── link-google-account.handler.ts
│   ├── link-google-account.handler.spec.ts
│   ├── unlink-google-account.command.ts
│   ├── unlink-google-account.handler.ts
│   └── unlink-google-account.handler.spec.ts
└── strategy/
    ├── google.strategy.ts                           # 'google' Passport 전략 (로그인 콜백)
    └── google-link.strategy.ts                      # 'google-link' 전략 (연결 콜백)

test/
├── service/
│   └── google-oauth.integration-spec.ts             # 통합 테스트
└── setup/
    └── google-strategy.mock.ts                      # 통합 테스트용 Strategy stub
```

### 3.2 수정 파일

| 파일 | 변경 |
|---|---|
| `libs/shared/src/database/typeorm.config.ts` | `entities` 배열에 `OAuthAccount` 추가 |
| `apps/service/src/auth/auth.controller.ts` | 5개 신규 엔드포인트 추가 + Swagger 데코레이터 |
| `apps/service/src/auth/auth.module.ts` | 신규 handler/strategy/provider 등록 |
| `apps/service/src/auth/command/login.handler.ts` | `AuthTokenIssuer`로 토큰 발급 위임(리팩토링) |
| `apps/service/src/auth/command/refresh-token.handler.ts` | `AuthTokenIssuer`로 토큰 발급 위임(리팩토링) |
| `.env.example` | Google OAuth 환경변수 5개 추가 |
| `.env.local` / `.env.development` / `.env.production` | 동일 변수 동기화 |
| `test/setup/global-setup.ts` | 동일 변수 더미 값 주입(부팅 시 `getOrThrow` 통과용) |

---

## 4. 데이터베이스 설계

### 4.1 `oauth_accounts` 테이블 (신규)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | int | PK, auto-increment | |
| user_id | int | FK → users.id, ON DELETE CASCADE, NOT NULL | |
| provider | varchar(20) | NOT NULL | 현재 `'google'`, 향후 확장 |
| provider_id | varchar(255) | NOT NULL | Google `sub` 클레임 |
| provider_email | varchar(255) | NOT NULL | 가입 시점 이메일 스냅샷 |
| email_verified | boolean | NOT NULL DEFAULT false | Google이 검증한 이메일인지 |
| created_at | timestamp | DEFAULT now() | |
| updated_at | timestamp | DEFAULT now() | |

> 컬럼명은 `SnakeNamingStrategy`로 자동 변환. 엔티티 프로퍼티는 camelCase(`userId`, `providerId`)로 작성하고 `@Column({ name: ... })`을 박지 않는다(strategy와 중복 — `CLAUDE.md` 가이드 준수).

### 4.2 인덱스/제약

| 인덱스 | 컬럼 | 목적 |
|---|---|---|
| `UQ_oauth_provider_provider_id` | (provider, provider_id) UNIQUE | 동일 Google 계정이 여러 사용자에게 연결되는 것 차단 |
| `UQ_oauth_user_provider` | (user_id, provider) UNIQUE | 한 사용자가 동일 프로바이더 다중 연결 차단 |

엔티티 선언:

```ts
@Entity('oauth_accounts')
@Index('UQ_oauth_provider_provider_id', ['provider', 'providerId'], { unique: true })
@Index('UQ_oauth_user_provider', ['userId', 'provider'], { unique: true })
export class OAuthAccount extends BaseTimeEntity {
  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: Relation<User>;

  @Column({ length: 20 })
  provider: string;

  @Column({ length: 255 })
  providerId: string;

  @Column({ length: 255 })
  providerEmail: string;

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;
}
```

> SWC 빌드 호환을 위해 `Relation<T>`로 감싸고 `import type { Relation } from 'typeorm'`로 들여온다. User 엔티티의 양방향 관계는 추가하지 않는다(현재 사용 사례 없음, 필요 시 후속 추가).

### 4.3 `User` 엔티티 변경 없음

- `password`는 NOT NULL 그대로 유지
- 구글 단독 가입자는 `crypto.randomBytes(32).toString('hex')`을 bcrypt(10) 해시하여 저장
- 사용자가 해당 비번을 알지 못하므로 비번 로그인은 자연스럽게 실패(의도된 동작)
- 향후 "비밀번호 설정" 기능을 별도 PATCH 엔드포인트로 추가하면 덮어쓸 수 있어 nullable 변경보다 유연

### 4.4 마이그레이션 생성 명령

```bash
pnpm migration:generate:local -- libs/shared/src/migrations/CreateOauthAccountTable
```

생성 후 `pnpm test:migration`으로 컨테이너 기동 + migration 검증.

---

## 5. 환경변수

`.env.example`에 추가:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/v1/auth/google/callback
GOOGLE_LINK_CALLBACK_URL=http://localhost:3000/v1/auth/google/link/callback
GOOGLE_FRONTEND_REDIRECT_URL=http://localhost:5173/oauth/callback
```

| 변수 | 설명 | 예시 |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console에서 발급한 Client ID | `1234567890-xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Client Secret | `GOCSPX-xxx` |
| `GOOGLE_CALLBACK_URL` | 로그인 콜백 URL (Google Console에 등록 필요) | `http://localhost:3000/v1/auth/google/callback` |
| `GOOGLE_LINK_CALLBACK_URL` | 연결 콜백 URL (Google Console에 등록 필요) | `http://localhost:3000/v1/auth/google/link/callback` |
| `GOOGLE_FRONTEND_REDIRECT_URL` | 토큰 fragment 전달 대상 프론트 URL | `http://localhost:5173/oauth/callback` |

> production 환경에서는 https + 실제 도메인으로 교체. `GOOGLE_FRONTEND_REDIRECT_URL`은 단일 값으로 고정하여 open redirect 방지.

### 5.1 Google OAuth Client 발급 절차

`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`은 [Google Cloud Console](https://console.cloud.google.com/)에서 직접 발급받는다. 무료이며 신용카드 등록 불필요.

#### 1단계 — 프로젝트 생성/선택

1. [https://console.cloud.google.com/](https://console.cloud.google.com/) 접속 후 Google 계정 로그인
2. 상단 좌측 프로젝트 드롭다운 클릭 → **새 프로젝트** 또는 기존 프로젝트 선택
3. 프로젝트 이름 입력 (예: `nest-repository-pattern`) 후 **만들기**
4. 생성 완료 후 해당 프로젝트로 컨텍스트 전환되었는지 상단에서 확인

#### 2단계 — OAuth 동의 화면 구성 (최초 1회 필수)

1. 좌측 메뉴 ☰ → **API 및 서비스** → **OAuth 동의 화면**
2. User Type 선택
   - **External** — 일반 사용자 대상 (대부분 이 옵션). Google Workspace 외부 사용자도 로그인 가능
   - **Internal** — Google Workspace 조직 내부 사용자만 (Workspace 계정 보유 시)
3. **만들기** → 앱 정보 입력
   - **앱 이름**: 사용자에게 동의 화면에 표시될 이름 (예: `Nest Repo Service`)
   - **사용자 지원 이메일**: 본인 Gmail
   - **앱 로고**: 선택 사항 (개발 중에는 생략)
   - **앱 도메인**: 개발 단계에서는 모두 비워둘 수 있음
   - **개발자 연락처 정보**: 본인 이메일
4. **저장 후 계속**
5. **범위(Scopes)** 단계 → **범위 추가 또는 삭제** 클릭 → 다음 2개 체크
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - (`openid`는 자동 포함됨)
6. **저장 후 계속**
7. **테스트 사용자(Test users)** 단계 (External + 게시 안 함 상태에서만 표시)
   - 개발 중에는 본인 Gmail 등 테스트할 계정을 추가 (등록한 계정만 로그인 가능)
   - 정식 출시 시 **앱 게시(Publish app)** 후 모든 사용자 허용
8. **저장 후 계속** → 요약 확인 후 종료

#### 3단계 — OAuth Client ID 발급

1. 좌측 메뉴 → **API 및 서비스** → **사용자 인증 정보(Credentials)**
2. 상단 **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID** 선택
3. **애플리케이션 유형: 웹 애플리케이션** 선택
4. **이름** 입력 (예: `local-dev` 또는 `service-prod` 등 환경별 분리 권장)
5. **승인된 JavaScript 원본** — 비워두거나 프론트 origin 입력 (서버 사이드 플로우만 쓰면 비워도 됨)
6. **승인된 리디렉션 URI**(Authorized redirect URIs) — **반드시 정확히 일치해야 함**
   ```
   http://localhost:3000/v1/auth/google/callback
   http://localhost:3000/v1/auth/google/link/callback
   ```
   - `/v1/` 버전 prefix 누락 주의
   - production은 `https://api.example.com/v1/auth/google/callback` 형태로 등록
   - 환경별로 OAuth Client를 분리하는 것을 권장(local/dev/prod 각각 별도 Client ID)
7. **만들기** 클릭

#### 4단계 — 자격 증명 다운로드 및 저장

1. 발급 직후 모달에 **클라이언트 ID** / **클라이언트 보안 비밀번호(Client Secret)** 노출
2. **JSON 다운로드** 또는 두 값을 클립보드 복사
3. `.env.local`에 입력:
   ```env
   GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxx
   ```
4. **Client Secret 노출 주의**
   - 절대 git에 커밋 금지 (`.env.local`은 `.gitignore` 대상 확인)
   - 노출 의심 시 즉시 콘솔에서 **REGENERATE SECRET** 버튼으로 재발급
   - production secret은 SecretManager / GitHub Secrets / Kubernetes Secret 등으로 관리

#### 5단계 — 사후 변경/관리

| 작업 | 위치 |
|---|---|
| Redirect URI 추가/수정 | Credentials → 해당 Client ID 클릭 → **승인된 리디렉션 URI** 편집 (반영까지 수 분 지연 가능) |
| Client Secret 재발급 | Client ID 상세 → **RESET SECRET** (이전 secret 즉시 무효) |
| 테스트 사용자 추가 | OAuth 동의 화면 → **테스트 사용자** |
| 정식 출시 (External) | OAuth 동의 화면 → **앱 게시** (검수 필요할 수 있음 — 민감/제한 범위 사용 시) |

> **검수가 필요한 경우**: 본 프로젝트가 사용하는 `email`/`profile`/`openid` 범위는 비민감 범위라 **검수 없이 게시 가능**. 단, 인증되지 않은 앱은 첫 로그인 시 "이 앱은 확인되지 않았습니다" 경고 화면이 표시되며 사용자가 "고급 → 안전하지 않음으로 이동"을 클릭해야 진행됨.

#### 트러블슈팅

| 증상 | 원인/해결 |
|---|---|
| `Error 400: redirect_uri_mismatch` | 콘솔에 등록한 redirect URI와 백엔드가 보낸 URI가 정확히 다름 (스킴/포트/path/슬래시 1글자 단위로 일치 필요) |
| `Access blocked: This app's request is invalid` | redirect URI 미등록 또는 OAuth 동의 화면 구성 미완료 |
| `Error 403: access_denied` | External + 게시 전 상태에서 테스트 사용자 미등록. 본인 계정을 테스트 사용자로 추가 |
| `invalid_client` | `GOOGLE_CLIENT_SECRET` 오타 또는 콘솔에서 reset됨. 다시 복사 |
| `email_verified: false`로 거부됨 | Google Workspace 도메인이 메일 검증을 안 한 케이스. 의도된 동작(보안) — 다른 계정으로 시도 |

---

## 6. Repository 설계 (ISP)

### 6.1 `IOAuthAccountReadRepository`

```ts
// apps/service/src/auth/interface/oauth-account-read-repository.interface.ts

export interface OAuthAccountFilter {
  provider: 'google';
  providerId: string;
}

export abstract class IOAuthAccountReadRepository {
  abstract findByProviderId(filter: OAuthAccountFilter): Promise<OAuthAccount | null>;
  abstract findByUserAndProvider(userId: number, provider: 'google'): Promise<OAuthAccount | null>;
}
```

### 6.2 `IOAuthAccountWriteRepository`

```ts
// apps/service/src/auth/interface/oauth-account-write-repository.interface.ts

export interface CreateOAuthAccountInput {
  userId: number;
  provider: 'google';
  providerId: string;
  providerEmail: string;
  emailVerified: boolean;
}

export abstract class IOAuthAccountWriteRepository {
  abstract create(input: CreateOAuthAccountInput): Promise<OAuthAccount>;
  abstract delete(userId: number, provider: 'google'): Promise<number>;
}
```

### 6.3 구현체 + Provider

`apps/service/src/auth/oauth-account.repository.ts`는 기존 `UserRepository`(`apps/service/src/auth/user.repository.ts`)와 동일하게 `BaseRepository` 상속.

`apps/service/src/auth/oauth-account-repository.provider.ts`:

```ts
export const oauthAccountRepositoryProviders: Provider[] = [
  OAuthAccountRepository,
  { provide: IOAuthAccountReadRepository, useExisting: OAuthAccountRepository },
  { provide: IOAuthAccountWriteRepository, useExisting: OAuthAccountRepository },
];
```

> `userRepositoryProviders` 패턴 그대로 — `useExisting`으로 단일 인스턴스를 두 토큰에 매핑.

---

## 7. Passport Strategy 설계

### 7.1 `GoogleStrategy` (로그인 플로우)

```ts
// apps/service/src/auth/strategy/google.strategy.ts

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      state: true, // CSRF 방어
    });
  }

  async validate(_at: string, _rt: string, profile: Profile): Promise<GoogleProfilePayload> {
    const email = profile.emails?.[0];
    if (!email?.value) {
      throw new UnauthorizedException('Google 이메일 누락');
    }
    return {
      providerId: profile.id,
      email: email.value,
      emailVerified: email.verified ?? false,
      displayName: profile.displayName,
    };
  }
}
```

`validate()` 반환값은 `request.user`에 주입되며, 컨트롤러에서 `GoogleLoginCommand`로 전달.

### 7.2 `GoogleLinkStrategy` (연결 플로우)

연결 콜백 URL이 다르므로 별도 전략으로 등록(`'google-link'` name).

```ts
@Injectable()
export class GoogleLinkStrategy extends PassportStrategy(Strategy, 'google-link') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.getOrThrow('GOOGLE_CLIENT_ID'),
      clientSecret: configService.getOrThrow('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow('GOOGLE_LINK_CALLBACK_URL'),
      scope: ['email', 'profile'],
      state: true,
    });
  }
  // validate() 동일
}
```

컨트롤러에서 `@UseGuards(JwtAuthGuard, AuthGuard('google-link'))`로 사용.

### 7.3 `GoogleProfilePayload` 타입

```ts
// apps/service/src/auth/strategy/google-profile.type.ts
export interface GoogleProfilePayload {
  providerId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
}
```

---

## 8. Controller 구현

```ts
// apps/service/src/auth/auth.controller.ts (신규 라우트만 발췌)

@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('google'))
  @Throttle({ short: { limit: 2, ttl: 1000 }, long: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Google OAuth 로그인 시작' })
  googleLogin() {
    /* passport가 자동 redirect */
  }

  @Get('callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as GoogleProfilePayload;
    const frontUrl = this.configService.getOrThrow<string>('GOOGLE_FRONTEND_REDIRECT_URL');

    try {
      const tokens = await this.commandBus.execute<GoogleLoginCommand, AuthTokens>(
        new GoogleLoginCommand(profile),
      );
      return res.redirect(
        `${frontUrl}#accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
      );
    } catch (e) {
      if (e instanceof ConflictException) {
        return res.redirect(
          `${frontUrl}#error=email_already_exists&email=${encodeURIComponent(profile.email)}`,
        );
      }
      if (e instanceof UnauthorizedException) {
        return res.redirect(`${frontUrl}#error=email_not_verified`);
      }
      throw e;
    }
  }

  @Get('link')
  @UseGuards(JwtAuthGuard, AuthGuard('google-link'))
  @ApiBearerAuth()
  googleLinkStart() {
    /* passport 자동 redirect */
  }

  @Get('link/callback')
  @UseGuards(JwtAuthGuard, AuthGuard('google-link'))
  @ApiExcludeEndpoint()
  async googleLinkCallback(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const profile = req.user as GoogleProfilePayload;
    const frontUrl = this.configService.getOrThrow<string>('GOOGLE_FRONTEND_REDIRECT_URL');

    await this.commandBus.execute(new LinkGoogleAccountCommand(user.id, profile));
    return res.redirect(`${frontUrl}#linked=true`);
  }

  @Delete('unlink')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiBearerAuth()
  async googleUnlink(@CurrentUser() user: AuthUser): Promise<void> {
    await this.commandBus.execute(new UnlinkGoogleAccountCommand(user.id));
  }
}
```

> 기존 `AuthController`를 확장하지 않고 별도 `GoogleAuthController`로 분리한다(파일/책임 분리). 또는 기존 컨트롤러에 메서드를 추가해도 무방 — 팀 컨벤션에 맞춰 결정.

### 8.1 Swagger 처리

| 엔드포인트 | 데코레이터 |
|---|---|
| `GET /auth/google` | `@ApiOperation()` (단순 redirect 유발 — Swagger UI에서 직접 테스트는 비권장) |
| `GET /auth/google/callback` | `@ApiExcludeEndpoint()` (Google이 호출하는 콜백, 사용자 직접 호출 X) |
| `GET /auth/google/link` | `@ApiBearerAuth()` |
| `GET /auth/google/link/callback` | `@ApiExcludeEndpoint()` |
| `DELETE /auth/google/unlink` | `@ApiBearerAuth()` + `@ApiNoContentResponse()` |

---

## 9. Command Handler 분기 상세

### 9.1 `GoogleLoginHandler`

```ts
@CommandHandler(GoogleLoginCommand)
export class GoogleLoginHandler implements ICommandHandler<GoogleLoginCommand, AuthTokens> {
  constructor(
    private readonly userReadRepo: IUserReadRepository,
    private readonly userWriteRepo: IUserWriteRepository,
    private readonly oauthReadRepo: IOAuthAccountReadRepository,
    private readonly oauthWriteRepo: IOAuthAccountWriteRepository,
    private readonly tokenIssuer: AuthTokenIssuer,
  ) {}

  async execute(cmd: GoogleLoginCommand): Promise<AuthTokens> {
    const { providerId, email, emailVerified, displayName } = cmd.profile;

    // 1. 미검증 이메일 거부
    if (!emailVerified) {
      throw new UnauthorizedException('Google 미검증 이메일');
    }

    // 2. 이미 연결된 OAuth 계정 → 로그인
    const oauth = await this.oauthReadRepo.findByProviderId({ provider: 'google', providerId });
    if (oauth) {
      const user = await this.userReadRepo.findById(oauth.userId);
      if (!user) throw new NotFoundException('User not found'); // 데이터 정합성 검증
      return this.tokenIssuer.issueTokens(user);
    }

    // 3. 동일 이메일 비번 사용자 존재 → 충돌
    const existing = await this.userReadRepo.findByEmail(email);
    if (existing) {
      throw new ConflictException('이미 가입된 이메일입니다');
    }

    // 4. 신규 가입
    const randomSecret = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(randomSecret, 10);
    const user = await this.userWriteRepo.create({
      email,
      password: hashedPassword,
      name: displayName,
    });
    await this.oauthWriteRepo.create({
      userId: user.id,
      provider: 'google',
      providerId,
      providerEmail: email,
      emailVerified,
    });
    return this.tokenIssuer.issueTokens(user);
  }
}
```

### 9.2 `LinkGoogleAccountHandler`

| 단계 | 동작 | 실패 시 |
|---|---|---|
| 1 | `emailVerified === false` 검증 | `UnauthorizedException` |
| 2 | 동일 `(provider, providerId)`가 다른 사용자에 연결되어 있는지 확인 | `ConflictException` ('Google 계정이 다른 사용자에 연결됨') |
| 3 | 현재 사용자가 이미 google 연결되어 있는지 확인 | `ConflictException` ('이미 연결됨') |
| 4 | `oauth_accounts` 레코드 생성 | — |

### 9.3 `UnlinkGoogleAccountHandler`

| 단계 | 동작 | 실패 시 |
|---|---|---|
| 1 | `oauthWriteRepo.delete(userId, 'google')` 호출 | — |
| 2 | affected count === 0 검증 | `NotFoundException` |

> 단독 OAuth 가입자가 unlink 호출 시 별도 차단하지 않는다 — 본 PRD 범위 외 (후속: "비밀번호 설정" 엔드포인트 추가 후 재검토).

---

## 10. 모듈 등록

`apps/service/src/auth/auth.module.ts` 변경:

```ts
const commandHandlers = [
  RegisterHandler,
  LoginHandler,
  RefreshTokenHandler,
  LogoutHandler,
  GoogleLoginHandler,            // 추가
  LinkGoogleAccountHandler,      // 추가
  UnlinkGoogleAccountHandler,    // 추가
];

@Module({
  imports: [CqrsModule, PassportModule, JwtModule.register({}), AppCacheModule],
  controllers: [AuthController, GoogleAuthController], // GoogleAuthController 추가
  providers: [
    ...commandHandlers,
    GetProfileHandler,
    ...userRepositoryProviders,
    ...oauthAccountRepositoryProviders, // 추가
    JwtStrategy,
    GoogleStrategy,        // 추가
    GoogleLinkStrategy,    // 추가
    JwtAuthGuard,
    AuthTokenIssuer,       // 추가
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
```

---

## 11. 테스트 전략

### 11.1 단위 테스트

Suites(`TestBed.solitary`) + `unitRef.get(Token)` 패턴 준수. abstract class 토큰은 `as Type<...>` 캐스팅(`CLAUDE.md` 가이드).

| 파일 | 케이스 |
|---|---|
| `google-login.handler.spec.ts` | (1) 미검증 이메일 → 401, (2) 기존 OAuthAccount 매칭 → 토큰 발급, (3) 동일 이메일 충돌 → 409, (4) 신규 가입 성공 |
| `link-google-account.handler.spec.ts` | 정상 연결, 미검증 이메일 거부, 다른 사용자에 이미 연결됨, 본인이 이미 연결됨 |
| `unlink-google-account.handler.spec.ts` | 정상 삭제, affected=0 → NotFound |
| `auth-token-issuer.service.spec.ts` | accessToken/refreshToken payload, hashedRefreshToken 저장 검증 |

### 11.2 통합 테스트

`test/service/google-oauth.integration-spec.ts` — Google API는 외부 의존이므로 Strategy를 mock으로 교체.

#### 11.2.1 Strategy Mock 헬퍼

```ts
// test/setup/google-strategy.mock.ts
export class MockGoogleStrategy extends PassportStrategy(Strategy, 'google') {
  static profile: GoogleProfilePayload | null = null;

  constructor() {
    super(/* dummy options */);
  }

  authenticate(req: Request) {
    if (!MockGoogleStrategy.profile) {
      return this.fail('No profile injected', 401);
    }
    this.success(MockGoogleStrategy.profile);
  }
}
```

테스트에서:

```ts
beforeEach(() => {
  MockGoogleStrategy.profile = {
    providerId: 'google-sub-123',
    email: 'newuser@example.com',
    emailVerified: true,
    displayName: '신규 사용자',
  };
});
```

`createIntegrationApp()` 사용 시 `AuthModule`의 provider를 override하여 `GoogleStrategy` → `MockGoogleStrategy`로 교체.

#### 11.2.2 시나리오

| 케이스 | 검증 |
|---|---|
| 신규 사용자 콜백 | 302 redirect + URL fragment에 토큰 포함 + DB에 user/oauth_account 생성 |
| 기존 OAuth 사용자 재로그인 | 동일 user.id로 토큰 발급, oauth_account 중복 생성 안 됨 |
| 동일 이메일 비번 사용자 충돌 | redirect URL에 `#error=email_already_exists`, oauth_account 미생성 |
| 미검증 이메일 | redirect URL에 `#error=email_not_verified` |
| `/auth/google/link` 인증 후 연결 | oauth_account 추가, 302 redirect with `#linked=true` |
| 다른 사용자가 이미 연결한 Google 계정으로 link 시도 | 409 또는 redirect with error |
| `/auth/google/unlink` 정상 | 204 + oauth_account 삭제 |
| `/auth/google/unlink` 미연결 상태 | 404 |

### 11.3 회귀 테스트

`AuthTokenIssuer` 추출로 `LoginHandler` / `RefreshTokenHandler`가 영향받으므로 기존 `auth.integration-spec.ts`의 register/login/refresh 시나리오 회귀 확인 필수.

### 11.4 검증 체크리스트

```bash
pnpm format
pnpm lint:check
pnpm build:all
pnpm test
pnpm test:e2e          # auth 변경이므로 필수 (CLAUDE.md 가이드)
pnpm test:migration    # 신규 마이그레이션 안전성 검증
```

#### 수동 E2E

1. Google Cloud Console에서 OAuth 2.0 Client 생성 후 callback URL 등록
   - `http://localhost:3000/v1/auth/google/callback`
   - `http://localhost:3000/v1/auth/google/link/callback`
2. `.env.local`에 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 입력
3. `pnpm start:service:local`로 서버 기동
4. 브라우저에서 `http://localhost:3000/v1/auth/google` 접속
   - Google 동의 화면 → 로그인 → 콜백 → 프론트 URL의 fragment에 토큰 도착 확인
5. 동일 Google 계정으로 재접속 → 동일 user.id 매칭 확인 (DB로 검증)
6. 다른 이메일로 비번 가입 후 동일 이메일 Google 시도 → 에러 redirect 확인
7. Bearer 토큰으로 `/v1/auth/google/link` 호출 → 연결 후 `/v1/auth/profile` 정상 응답
8. `/v1/auth/google/unlink` (DELETE) 호출 후 다시 `/v1/auth/google`로 시도 시 신규 가입 분기 진입 확인

---

## 12. 미해결/후속 과제

| 항목 | 설명 |
|---|---|
| 비밀번호 단독 설정 엔드포인트 | `PATCH /v1/auth/password` — 구글 단독 가입자가 비밀번호 추가 시. 본 PRD 범위 외 |
| Kakao/Naver 등 멀티 프로바이더 추가 | `oauth_accounts.provider` 컬럼은 확장 가능하도록 설계됨. 별도 PRD로 진행 |
| Swagger UI에서 OAuth 흐름 직접 테스트 | `DocumentBuilder.addOAuth2()` 추가 가능. 본 PRD에선 `@ApiExcludeEndpoint`로 OAuth 라우트 숨김 |
| Unlink 안전장치 강화 | 단독 OAuth 가입자가 unlink 시 로그인 수단 상실 — "비밀번호 설정" 후속 작업과 함께 재검토 |
| User 엔티티에 OAuthAccount 양방향 관계 추가 | 현재 사용 사례 없어 보류. 필요 시 SWC 호환 패턴(`Relation<T>`)으로 추가 |

---

## 13. 참고 문서

- 단계별 구현 체크리스트: [`google-oauth-todo.md`](./google-oauth-todo.md)
- 기존 Auth 구현: [`auth-implementation-prd.md`](./auth-implementation-prd.md)
- CQRS 패턴: [`cqrs-guide.md`](./cqrs-guide.md)
- Repository ISP: [`interface-segregation-principle.md`](./interface-segregation-principle.md)
- 보안(helmet/CORS): [`helmet-cors-guide.md`](./helmet-cors-guide.md)
- 테스트 전략: [`testing-strategy.md`](./testing-strategy.md)
- SWC 마이그레이션: [`swc-migration-guide.md`](./swc-migration-guide.md)
