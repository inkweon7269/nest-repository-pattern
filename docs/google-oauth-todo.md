# Google OAuth 로그인 구현 체크리스트

> `apps/service`에 Google OAuth 로그인을 추가하기 위한 단계별 체크리스트.
> 각 Phase는 의존성 순서로 정렬되어 있으며, 순서대로 진행해야 한다.
>
> 설계 배경, 분기 로직, 코드 예시는 [google-oauth-prd.md](./google-oauth-prd.md)를 참고한다.

---

## 진행 현황 (요약)

| Phase | 상태 | 비고 |
|---|---|---|
| 1. 환경 준비 | ✅ 완료 | OAuth Client 발급, 패키지 설치, 환경변수 |
| 2. DB 스키마 | ✅ 완료 | `oauth_accounts` 테이블 + 마이그레이션 |
| 3. AuthTokenIssuer 추출 | ✅ 완료 | LoginHandler/RefreshTokenHandler 리팩토링 포함 |
| 4. Repository 레이어 | ✅ 완료 | ISP + `useExisting` 패턴 |
| 5. Passport Strategy | ✅ 완료 | `GoogleStrategy`, `GoogleLinkStrategy` (link strategy는 라우트 미연결 상태로 보존) |
| 6. Command Handler | ✅ 완료 | login/link/unlink 3종 + 단위 테스트 12케이스 |
| 7. Controller | ⚠️ **부분 완료** | `/google`, `/callback`, `DELETE /unlink` 3개. **link 라우트 2개는 OAuth state 인프라 필요로 후속 PRD 분리** |
| 8. 통합 테스트 | ✅ 완료 | 9개 시나리오, MockGoogleStrategy 헬퍼 |
| 9. 검증 | ✅ 완료 | format/lint/build/test/test:e2e 통과 |
| 수동 E2E | ⏳ 사용자 작업 | 실제 Google credential로 브라우저 검증 |

**커밋 범위**: `feature/google-login` 브랜치, `0052d1e` ~ `28c25fe` (8개 커밋)

---

## 용어 빠른 참조

체크리스트에서 자주 등장하는 용어 요약. 자세한 설명은 PRD 문서를 참고한다.

| 용어 | 한줄 요약 |
|------|-----------|
| **Authorization Code Flow** | OAuth 표준 서버사이드 플로우. Google이 redirect로 `code` 전달 → 백엔드가 token exchange 수행 |
| **`passport-google-oauth20`** | Google OAuth 2.0용 Passport 전략. `@nestjs/passport`와 통합 |
| **`OAuthAccount`** | 신규 엔티티. `(provider, providerId)` 1:N으로 User에 연결됨 |
| **`AuthTokenIssuer`** | JWT access/refresh 발급 + `hashedRefreshToken` 저장 로직을 단일화한 헬퍼 서비스 |
| **명시적 연결** | 동일 이메일 비번 사용자가 구글 로그인 시 자동 연결 금지 → 비번 로그인 후 별도 엔드포인트로 연결 |
| **Fragment redirect** | 토큰을 URL `#`(fragment)로 전달 → 서버 로그/리퍼러 노출 차단 |
| **`email_verified`** | Google이 보낸 이메일 검증 플래그. `false`면 거부(계정 탈취 방지) |

---

## Phase 1: 환경 준비

> **이 단계에서 하는 일:** 외부 서비스(Google OAuth Client) 발급, 패키지 설치, 환경변수 정의. 후속 작업의 토대가 되므로 가장 먼저 완료한다.

### 1.1 Google Cloud Console 설정

> 상세 발급 절차(스크린 흐름, 권한 범위 선택, 트러블슈팅)는 [PRD §5.1 Google OAuth Client 발급 절차](./google-oauth-prd.md#51-google-oauth-client-발급-절차) 참고.

- [ ] **프로젝트 생성** — [Google Cloud Console](https://console.cloud.google.com/) 접속 → 새 프로젝트 또는 기존 선택
- [ ] **OAuth 동의 화면 구성** (최초 1회) — APIs & Services → OAuth consent screen
  - User Type: **External**(일반) 또는 **Internal**(Workspace 전용)
  - 앱 이름, 지원 이메일, 개발자 연락처 입력
  - Scopes: `userinfo.email`, `userinfo.profile` 추가 (`openid` 자동 포함)
  - **테스트 사용자**에 본인 Gmail 추가 (게시 전 필수, External 한정)
- [ ] **OAuth Client ID 발급** — APIs & Services → Credentials → Create Credentials → OAuth client ID
  - Application type: **Web application**
  - Authorized redirect URIs 정확히 등록 (스킴/포트/path 1글자도 일치해야 함):
    - `http://localhost:3000/v1/auth/google/callback`
    - `http://localhost:3000/v1/auth/google/link/callback`
- [ ] 발급된 **Client ID / Client Secret** 보관
  - `.env.local`에 입력 예정
  - 절대 git에 커밋 금지 (`.gitignore` 확인)
  - 노출 의심 시 콘솔에서 즉시 **RESET SECRET**
- [ ] dev/production 환경용 OAuth Client는 **별도로 발급 권장** (환경 격리)
  - dev redirect URI: `https://dev-api.example.com/v1/auth/google/callback` 등
  - prod secret은 SecretManager / GitHub Secrets / K8s Secret으로 관리

### 1.2 패키지 설치

- [ ] `pnpm add passport-google-oauth20`
- [ ] `pnpm add -D @types/passport-google-oauth20`
- [ ] 설치 후 `pnpm install` lockfile 갱신 확인

### 1.3 환경변수 정의

- [ ] `.env.example`에 다음 5개 키 추가
  ```env
  GOOGLE_CLIENT_ID=your-google-client-id
  GOOGLE_CLIENT_SECRET=your-google-client-secret
  GOOGLE_CALLBACK_URL=http://localhost:3000/v1/auth/google/callback
  GOOGLE_LINK_CALLBACK_URL=http://localhost:3000/v1/auth/google/link/callback
  GOOGLE_FRONTEND_REDIRECT_URL=http://localhost:5173/oauth/callback
  ```
- [ ] `.env.local`에 실제 값 입력 (gitignore 대상)
- [ ] `.env.development` / `.env.production` 동기화 (실제 값은 배포 secret으로 관리)
- [ ] `test/setup/global-setup.ts`에 더미 값 추가
  - 테스트 부팅 시 `getOrThrow` 통과를 위해 필요
  - 통합 테스트는 Strategy를 mock하므로 실제 호출 X

---

## Phase 2: DB 스키마

> **이 단계에서 하는 일:** `oauth_accounts` 테이블 신설. 멀티 프로바이더 확장을 고려한 1:N 관계로 설계하며, `users` 엔티티는 변경하지 않는다.

### 2.1 엔티티 작성

- [ ] `libs/shared/src/entities/oauth-account.entity.ts` 생성
  - `BaseTimeEntity` 상속 (id, createdAt, updatedAt 자동)
  - 컬럼: `userId`(int), `provider`(varchar 20), `providerId`(varchar 255), `providerEmail`(varchar 255), `emailVerified`(boolean default false)
  - `@ManyToOne(() => User, { onDelete: 'CASCADE' })` 관계 (양방향 X — User에 역참조 추가하지 않음)
  - 관계 타입은 `Relation<User>`로 감싸고 `import type { Relation } from 'typeorm'` 사용 (SWC 호환)
  - `@Column({ name: ... })`을 박지 않음 — `SnakeNamingStrategy`로 자동 변환
- [ ] 인덱스 2개 추가
  - `@Index('UQ_oauth_provider_provider_id', ['provider', 'providerId'], { unique: true })`
  - `@Index('UQ_oauth_user_provider', ['userId', 'provider'], { unique: true })`

### 2.2 typeorm.config.ts 수정

- [ ] `libs/shared/src/database/typeorm.config.ts`의 `entities` 배열에 `OAuthAccount` 추가

### 2.3 마이그레이션 생성 및 검증

- [ ] `pnpm migration:generate:local -- libs/shared/src/migrations/CreateOauthAccountTable` 실행
- [ ] 생성된 마이그레이션 파일 검토
  - `oauth_accounts` 테이블 + 2개 unique index + FK with CASCADE 포함 확인
  - 누락된 제약이 있으면 엔티티 데코레이터로 보완 후 재생성 (raw migration 직접 수정 금지 — 회귀 발생)
- [ ] `pnpm migration:local`로 로컬 DB에 적용
- [ ] PostgreSQL 직접 접속하여 `\d oauth_accounts` 확인
- [ ] `pnpm test:migration`으로 CI용 검증 (컨테이너 기동 + migration 실행)

---

## Phase 3: 공통 헬퍼 추출 (`AuthTokenIssuer`)

> **이 단계에서 하는 일:** 기존 `LoginHandler`/`RefreshTokenHandler`에 분산된 JWT 발급 로직을 단일 서비스로 추출한다. `GoogleLoginHandler`도 동일 헬퍼를 사용하여 토큰 발급 패턴이 갈라지지 않게 한다.

### 3.1 `AuthTokenIssuer` 작성

- [ ] `apps/service/src/auth/auth-token-issuer.service.ts` 생성
  - `@Injectable()` 데코레이터
  - 의존성: `JwtService`, `ConfigService`, `IUserWriteRepository`
  - `issueTokens(user: User): Promise<AuthTokens>` 메서드
    1. `accessToken` 발급 (`JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRATION`)
    2. `refreshToken` 발급 (`JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRATION`, payload에 `type: 'refresh'`, `jti: randomUUID()`)
    3. SHA256 digest → bcrypt(10) → `hashedRefreshToken` DB 업데이트
    4. `{ accessToken, refreshToken }` 반환

### 3.2 기존 Handler 리팩토링

- [ ] `apps/service/src/auth/command/login.handler.ts`
  - 직접 JWT/bcrypt 호출 제거
  - 생성자에 `AuthTokenIssuer` 주입
  - 비밀번호 검증 후 `tokenIssuer.issueTokens(user)` 호출
- [ ] `apps/service/src/auth/command/refresh-token.handler.ts`
  - 토큰 검증 + 사용자 조회까지 그대로 유지
  - 새 토큰 발급은 `tokenIssuer.issueTokens(user)`로 위임

### 3.3 단위 테스트

- [ ] `auth-token-issuer.service.spec.ts` 작성 (Suites 사용)
  - accessToken payload(`sub`, `email`) 검증
  - refreshToken payload(`sub`, `email`, `type='refresh'`, `jti` 존재) 검증
  - `hashedRefreshToken` 저장 호출 검증 (SHA256 → bcrypt)
- [ ] 기존 `login.handler.spec.ts` / `refresh-token.handler.spec.ts` 통과 확인
  - mock 대상이 `JwtService` → `AuthTokenIssuer`로 변경됨
  - abstract class DI 토큰은 `as Type<...>` 캐스팅 필요 (`CLAUDE.md` 가이드)

### 3.4 모듈 등록

- [ ] `apps/service/src/auth/auth.module.ts`의 `providers`에 `AuthTokenIssuer` 추가

---

## Phase 4: Repository 레이어

> **이 단계에서 하는 일:** 기존 `UserRepository` 패턴(ISP + `BaseRepository` + `useExisting`)을 그대로 따라 OAuthAccount용 레이어를 만든다.

### 4.1 인터페이스 작성

- [ ] `apps/service/src/auth/interface/oauth-account-read-repository.interface.ts`
  - `OAuthAccountFilter` 인터페이스 (`provider: 'google'`, `providerId: string`)
  - `IOAuthAccountReadRepository` abstract class
    - `findByProviderId(filter: OAuthAccountFilter): Promise<OAuthAccount | null>`
    - `findByUserAndProvider(userId: number, provider: 'google'): Promise<OAuthAccount | null>`
- [ ] `apps/service/src/auth/interface/oauth-account-write-repository.interface.ts`
  - `CreateOAuthAccountInput` 인터페이스 (5개 필드)
  - `IOAuthAccountWriteRepository` abstract class
    - `create(input: CreateOAuthAccountInput): Promise<OAuthAccount>`
    - `delete(userId: number, provider: 'google'): Promise<number>` (affected 반환)

### 4.2 구현체 작성

- [ ] `apps/service/src/auth/oauth-account.repository.ts`
  - `OAuthAccountRepository extends BaseRepository implements IOAuthAccountReadRepository, IOAuthAccountWriteRepository`
  - `getRepository(OAuthAccount)`로 TypeORM Repository 획득
  - 검증/예외 던지기 없음 — 순수 데이터 접근만 (CLAUDE.md 원칙)

### 4.3 Provider 등록

- [ ] `apps/service/src/auth/oauth-account-repository.provider.ts`
  ```ts
  export const oauthAccountRepositoryProviders: Provider[] = [
    OAuthAccountRepository,
    { provide: IOAuthAccountReadRepository, useExisting: OAuthAccountRepository },
    { provide: IOAuthAccountWriteRepository, useExisting: OAuthAccountRepository },
  ];
  ```

---

## Phase 5: Passport Strategy 작성

> **이 단계에서 하는 일:** Google OAuth용 Passport Strategy 2개(로그인용/연결용)를 작성한다. callback URL이 다르므로 별도 strategy로 분리한다.

### 5.1 공통 타입

- [ ] `apps/service/src/auth/strategy/google-profile.type.ts`
  ```ts
  export interface GoogleProfilePayload {
    providerId: string;
    email: string;
    emailVerified: boolean;
    displayName: string;
  }
  ```

### 5.2 `GoogleStrategy` (로그인 콜백용)

- [ ] `apps/service/src/auth/strategy/google.strategy.ts`
  - `PassportStrategy(Strategy, 'google')` 상속
  - `clientID`, `clientSecret`, `callbackURL`은 `ConfigService.getOrThrow`로 로드
  - `scope: ['email', 'profile']`
  - `state: true` — CSRF 방어
  - `validate(_at, _rt, profile)` 메서드
    - `profile.emails?.[0]` 추출
    - 이메일 누락 시 `UnauthorizedException`
    - `GoogleProfilePayload` 형태로 반환

### 5.3 `GoogleLinkStrategy` (연결 콜백용)

- [ ] `apps/service/src/auth/strategy/google-link.strategy.ts`
  - `PassportStrategy(Strategy, 'google-link')` 상속
  - `callbackURL`만 `GOOGLE_LINK_CALLBACK_URL` 사용, 나머지 동일
  - `validate()` 동일 (재사용 가능하면 헬퍼 함수로 추출 검토)

---

## Phase 6: Command Handler 작성

> **이 단계에서 하는 일:** 콜백에서 호출되는 3개 Command Handler를 작성한다. 분기 로직이 핵심이므로 단위 테스트를 함께 작성한다.

### 6.1 `GoogleLoginCommand` & Handler

- [ ] `apps/service/src/auth/command/google-login.command.ts`
  - 생성자: `profile: GoogleProfilePayload`
- [ ] `apps/service/src/auth/command/google-login.handler.ts`
  - 의존성: `IUserReadRepository`, `IUserWriteRepository`, `IOAuthAccountReadRepository`, `IOAuthAccountWriteRepository`, `AuthTokenIssuer`
  - 4분기 로직:
    1. `emailVerified === false` → `UnauthorizedException`
    2. `findByProviderId` 매칭 → `findById(oauth.userId)` → `tokenIssuer.issueTokens(user)`
    3. `findByEmail(profile.email)` 존재 → `ConflictException`
    4. 신규 가입: `crypto.randomBytes(32).toString('hex')` → `bcrypt.hash` → `users` create → `oauth_accounts` create → `tokenIssuer.issueTokens(user)`
- [ ] `google-login.handler.spec.ts` 단위 테스트
  - 4분기 각각 1개 이상 케이스
  - Suites + abstract class 토큰 캐스팅 패턴 준수

### 6.2 `LinkGoogleAccountCommand` & Handler

- [ ] `apps/service/src/auth/command/link-google-account.command.ts`
  - 생성자: `userId: number`, `profile: GoogleProfilePayload`
- [ ] `apps/service/src/auth/command/link-google-account.handler.ts`
  - 분기:
    1. `emailVerified === false` → `UnauthorizedException`
    2. `findByProviderId` 결과의 userId가 본인이 아님 → `ConflictException` ('Google 계정이 다른 사용자에 연결됨')
    3. `findByUserAndProvider(userId, 'google')` 존재 → `ConflictException` ('이미 연결됨')
    4. `oauth_accounts` create
- [ ] `link-google-account.handler.spec.ts` 단위 테스트 (4분기 각각)

### 6.3 `UnlinkGoogleAccountCommand` & Handler

- [ ] `apps/service/src/auth/command/unlink-google-account.command.ts`
  - 생성자: `userId: number`
- [ ] `apps/service/src/auth/command/unlink-google-account.handler.ts`
  - `oauthWriteRepo.delete(userId, 'google')` → affected count 0이면 `NotFoundException`
- [ ] `unlink-google-account.handler.spec.ts` (정상/NotFound)

---

## Phase 7: Controller & Module 등록

> **이 단계에서 하는 일:** HTTP 라우팅 계층을 추가하고 신규 컴포넌트를 모듈에 등록한다. Swagger 데코레이터로 OAuth 라우트의 가시성을 적절히 조정한다.

### 7.1 Controller 작성 (3개 엔드포인트 — 본 PRD 범위)

- [x] `apps/service/src/auth/google-auth.controller.ts` 신규 생성
  - `@Controller('auth/google')`
  - 3개 라우트:
    - `GET /` — `@UseGuards(AuthGuard('google'))` + `@Throttle({ short: { limit: 2, ttl: 1000 }, long: { limit: 5, ttl: 60000 } })`
    - `GET /callback` — `@UseGuards(AuthGuard('google'))` + try/catch로 redirect 처리
    - `DELETE /unlink` — `@UseGuards(JwtAuthGuard)` + `@HttpCode(204)`
  - 콜백 redirect URL 생성 시 `encodeURIComponent` 사용 (이메일 등 특수문자 방어)
- [x] SWC 호환을 위해 `import type { Request, Response } from 'express'` 사용 (TS1272 회피)

> **link 라우트 2개(`GET /link`, `GET /link/callback`)는 본 PRD에서 제외.** 이유는 [PRD §1.4](./google-oauth-prd.md#14-api-명세) 참고. 후속 PRD에서 OAuth state 인프라와 함께 추가.

### 7.2 Swagger 처리

- [x] `GET /auth/google` — `@ApiOperation({ summary: 'Google OAuth 로그인 시작' })` + `@ApiTooManyRequestsResponse`
- [x] `GET /auth/google/callback` — `@ApiExcludeEndpoint()` (Google이 호출, Swagger UI 노출 X)
- [x] `DELETE /auth/google/unlink` — `@ApiBearerAuth()` + `@ApiNoContentResponse()` + `@ApiNotFoundResponse()` + `@ApiUnauthorizedResponse()`

### 7.3 모듈 등록

- [x] `apps/service/src/auth/auth.module.ts` 수정
  - `controllers`에 `GoogleAuthController` 추가
  - `providers`에 등록 (Phase 3~6 누적):
    - `GoogleLoginHandler`, `LinkGoogleAccountHandler`, `UnlinkGoogleAccountHandler`
    - `GoogleStrategy`, `GoogleLinkStrategy` (link strategy는 라우트 미연결 상태로 보존)
    - `...oauthAccountRepositoryProviders`
    - `AuthTokenIssuer`

---

## Phase 8: 통합 테스트

> **이 단계에서 하는 일:** Google API는 외부 의존이므로 Strategy를 mock으로 교체하여 콜백 → DB까지 전체 플로우를 검증한다. 본 프로젝트의 Classical School 통합 테스트 원칙을 따른다.

### 8.1 Mock Strategy 헬퍼

- [ ] `test/setup/google-strategy.mock.ts` 작성
  - `MockGoogleStrategy extends PassportStrategy(Strategy, 'google')`
  - `static profile: GoogleProfilePayload | null` — 테스트가 주입할 수 있는 stub
  - `authenticate(req)` 오버라이드 — profile이 있으면 `success()`, 없으면 `fail()`
  - `MockGoogleLinkStrategy`도 동일 패턴 (name: `'google-link'`)

### 8.2 통합 테스트 작성

- [ ] `test/service/google-oauth.integration-spec.ts`
  - `createIntegrationApp(AppModule)` + `useTransactionRollback()`
  - `GoogleStrategy` / `GoogleLinkStrategy`를 mock으로 override
- [ ] 시나리오 작성:
  - [ ] 신규 사용자 콜백 → 302 + URL fragment 토큰 + DB에 user/oauth_account 생성
  - [ ] 기존 OAuth 사용자 재로그인 → 동일 user.id, oauth_account 중복 생성 X
  - [ ] 동일 이메일 비번 사용자 충돌 → `#error=email_already_exists` redirect, oauth_account 미생성
  - [ ] 미검증 이메일 → `#error=email_not_verified` redirect
  - [ ] `/auth/google/link` 인증 후 정상 연결 → oauth_account 추가 + `#linked=true`
  - [ ] 다른 사용자가 이미 연결한 Google 계정 link 시도 → 409 또는 redirect with error
  - [ ] `/auth/google/unlink` 정상 → 204 + oauth_account 삭제
  - [ ] `/auth/google/unlink` 미연결 상태 → 404

### 8.3 회귀 테스트

- [ ] 기존 `test/service/auth.integration-spec.ts` 통과 확인
  - register/login/refresh/profile/logout 모두 그대로 동작해야 함
  - `AuthTokenIssuer` 추출 영향 없는지 검증

---

## Phase 9: 검증

### 9.1 포맷 및 린트

- [ ] `pnpm format` 실행 — 포맷 자동 수정
- [ ] `pnpm lint:check` 실행 — 통과 확인

### 9.2 빌드

- [ ] `pnpm build:all` 실행 — service + back-office 양쪽 빌드 성공 확인
  - SWC 호환 패턴 위반 시 watch 모드(`pnpm start:local`)에서 즉시 잡힘

### 9.3 단위 테스트

- [ ] `pnpm test` 실행 — 모든 단위 테스트 통과
  - `AuthTokenIssuer` spec
  - `GoogleLoginHandler` 4분기
  - `LinkGoogleAccountHandler` 4분기
  - `UnlinkGoogleAccountHandler` 2케이스
  - 기존 `LoginHandler`/`RefreshTokenHandler` spec 회귀

### 9.4 통합 테스트

- [ ] `pnpm test:e2e` 실행 — Docker 필수
  - `google-oauth.integration-spec.ts`
  - `auth.integration-spec.ts` (회귀)
  - `posts.integration-spec.ts` (회귀)
- [ ] `pnpm test:migration` — 신규 마이그레이션 안전성 검증

### 9.5 수동 E2E

- [ ] Google Cloud Console에 로컬 callback URL 2개 등록 완료 확인
- [ ] `.env.local`에 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 입력
- [ ] `pnpm start:service:local` — 로컬 서버 기동
- [ ] **케이스 1: 신규 가입**
  - 브라우저에서 `http://localhost:3000/v1/auth/google` 접속
  - Google 동의 화면 → 로그인 → 콜백 → 프론트 URL fragment에 토큰 도착
  - DB의 `users` / `oauth_accounts` 레코드 생성 확인
- [ ] **케이스 2: 재로그인**
  - 동일 Google 계정으로 다시 `/v1/auth/google` 접속
  - DB에서 동일 `user.id` 매칭, `oauth_accounts` 중복 생성 X 확인
- [ ] **케이스 3: 동일 이메일 충돌**
  - 다른 이메일로 비번 가입(`POST /v1/auth/register`) 후
  - 동일 이메일을 가진 Google 계정으로 `/v1/auth/google` 접속
  - `#error=email_already_exists` redirect 확인
- [ ] **케이스 4: 명시적 연결**
  - 비번 로그인하여 Bearer 토큰 획득
  - Bearer 헤더 포함하여 `/v1/auth/google/link` 호출 (브라우저에서 헤더 못 붙이므로 Postman/curl)
  - 연결 후 `oauth_accounts` 추가 확인
  - `/v1/auth/profile` 정상 응답 확인
- [ ] **케이스 5: 연결 해제**
  - `DELETE /v1/auth/google/unlink` (Bearer 토큰)
  - 204 응답 + `oauth_accounts` 삭제 확인
  - 다시 `/v1/auth/google` 접속 시 신규 가입 분기 진입 확인 (또는 기존 user에 재연결)

---

## 파일 변경 요약

### 신규 생성 (15개)

| 파일 | 유형 |
|------|------|
| `libs/shared/src/entities/oauth-account.entity.ts` | TypeORM 엔티티 |
| `libs/shared/src/migrations/{ts}-CreateOauthAccountTable.ts` | 마이그레이션 |
| `apps/service/src/auth/interface/oauth-account-read-repository.interface.ts` | Repository 인터페이스(Read) |
| `apps/service/src/auth/interface/oauth-account-write-repository.interface.ts` | Repository 인터페이스(Write) |
| `apps/service/src/auth/oauth-account.repository.ts` | Repository 구현체 |
| `apps/service/src/auth/oauth-account-repository.provider.ts` | DI provider 배열 |
| `apps/service/src/auth/auth-token-issuer.service.ts` | JWT 발급 헬퍼 |
| `apps/service/src/auth/auth-token-issuer.service.spec.ts` | 단위 테스트 |
| `apps/service/src/auth/strategy/google-profile.type.ts` | 공통 타입 |
| `apps/service/src/auth/strategy/google.strategy.ts` | 로그인용 Passport 전략 |
| `apps/service/src/auth/strategy/google-link.strategy.ts` | 연결용 Passport 전략 |
| `apps/service/src/auth/command/google-login.{command,handler,handler.spec}.ts` | 신규 가입/로그인 분기 |
| `apps/service/src/auth/command/link-google-account.{command,handler,handler.spec}.ts` | 명시적 연결 |
| `apps/service/src/auth/command/unlink-google-account.{command,handler,handler.spec}.ts` | 연결 해제 |
| `apps/service/src/auth/google-auth.controller.ts` | 5개 엔드포인트 컨트롤러 |
| `test/setup/google-strategy.mock.ts` | 통합 테스트용 mock |
| `test/service/google-oauth.integration-spec.ts` | 통합 테스트 |

### 수정 (6개)

| 파일 | 변경 내용 |
|------|-----------|
| `libs/shared/src/database/typeorm.config.ts` | `entities` 배열에 `OAuthAccount` 추가 |
| `apps/service/src/auth/auth.module.ts` | 신규 controller/handler/strategy/provider 등록 |
| `apps/service/src/auth/command/login.handler.ts` | `AuthTokenIssuer`로 토큰 발급 위임 |
| `apps/service/src/auth/command/refresh-token.handler.ts` | `AuthTokenIssuer`로 토큰 발급 위임 |
| `.env.example` (+ `.env.local` 등) | Google OAuth 환경변수 5개 추가 |
| `test/setup/global-setup.ts` | Google OAuth 환경변수 더미 값 주입 |

### 변경 없음

| 파일 | 이유 |
|------|------|
| `libs/shared/src/entities/user.entity.ts` | `oauth_accounts` 테이블 분리로 User 스키마 보존. `password`는 NOT NULL 유지 |
| `apps/back-office/**` | 적용 범위에서 제외 |
| `apps/service/src/auth/strategy/jwt.strategy.ts` | 기존 JWT 검증 그대로 재사용 |
| `apps/service/src/auth/guard/jwt-auth.guard.ts` | 변경 불필요 |
| `apps/service/src/auth/query/get-profile.handler.ts` | 프로필 조회는 그대로 재사용 |

---

## 의존성 그래프

```
Phase 1 (환경)
  └─▶ Phase 2 (DB 스키마)
        └─▶ Phase 4 (Repository)
              └─▶ Phase 6 (Command Handler)
                    ▲
Phase 3 (AuthTokenIssuer) ────┘
  ▲
  │
  └─▶ Phase 5 (Strategy) ─▶ Phase 7 (Controller & Module)
                                 └─▶ Phase 8 (통합 테스트)
                                       └─▶ Phase 9 (검증)
```

> **병렬 진행 가능**: Phase 3(AuthTokenIssuer)과 Phase 4(Repository)는 독립적이므로 병렬 작업 가능. Phase 5(Strategy)는 Phase 1만 완료되면 시작 가능.

---

## 주의 사항

| 항목 | 주의 |
|------|------|
| 마이그레이션 직접 수정 금지 | DB 제약은 엔티티에 선언, raw migration만 박으면 다음 `migration:generate` 시 누락. 인덱스/FK 누락 시 엔티티 데코레이터로 보완 후 재생성 |
| `@Column({ name: ... })` 금지 | `SnakeNamingStrategy`로 자동 변환되므로 중복 명명 금지 |
| `@JoinColumn`에 `name` 인자 금지 | 하드코딩하면 strategy 우회하여 camelCase 컬럼 생성됨 |
| 양방향 관계 시 `Relation<T>` 필수 | SWC + `decoratorMetadata` TDZ 회피. `import type { Relation } from 'typeorm'` |
| abstract class DI 토큰 캐스팅 | Suites `unitRef.get`은 `Type<T>` 시그니처 — `as Type<IFoo>` 캐스팅 필요 |
| Open Redirect 방지 | `GOOGLE_FRONTEND_REDIRECT_URL`은 단일 환경변수로 고정. 사용자 입력 받지 않음 |
| `email_verified` 강제 | Google이 미검증 이메일 보내는 케이스(드물게 G Workspace) 차단. `false`면 즉시 거부 |
| Auth 변경 시 `pnpm test:e2e` 필수 | CLAUDE.md 가이드 |

---

## 후속 작업 (본 PRD 범위 외)

- [ ] **Google 계정 link 플로우** (`GET /v1/auth/google/link`, `/link/callback`)
  - 사전 작업: signed JWT를 OAuth `state` 파라미터에 인코딩하는 인프라 설계
  - 구현: `GoogleLinkInitGuard` 커스텀 가드 (동적 `state` 옵션 전달) + 콜백에서 state 검증 → user.id 복원
  - 활용: 이미 작성된 `LinkGoogleAccountHandler`, `LinkGoogleAccountCommand`, `GoogleLinkStrategy`를 라우트에 연결만 하면 됨
- [ ] 비밀번호 단독 설정 엔드포인트 (`PATCH /v1/auth/password`) — 구글 단독 가입자 대상
- [ ] Kakao/Naver 등 멀티 프로바이더 추가 (별도 PRD)
- [ ] Swagger UI에서 OAuth 직접 테스트 (`DocumentBuilder.addOAuth2()`)
- [ ] Unlink 안전장치 강화 (단독 OAuth 가입자가 unlink 시 경고/차단)
