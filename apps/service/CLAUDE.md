# apps/service — 사용자 서버 가이드

사용자 서버 (Auth + Posts + Tags, PORT=3000). 이 문서는 service 앱과 도메인 모듈 작성 규칙을 담는다. 전역 빌드/테스트/워크플로는 루트 `CLAUDE.md` 참고.

## CQRS 설계 원칙

- **Command는 상태만 변경**한다. 반환 타입은 `void` 또는 최소 식별자(`number` 등). DTO를 반환하지 않는다.
- **Query는 상태만 조회**한다. DTO 변환은 Query Handler에서 수행한다.
- **Command와 Query를 분리**한다. 하나의 플로우에서 Command와 Query를 혼합하지 않는다. (예: `createPost`는 Command로 ID를 받아 `{ id }`를 반환, `updatePost`는 Command만 실행하여 204 반환)
- **Repository는 순수 데이터 접근**만 담당한다. 예외 던지기, null 체크 등 비즈니스 로직을 포함하지 않는다.
- **검증(존재 확인)은 Handler**에서 수행한다. (affected count가 0이면 `NotFoundException`)
- **Repository 인터페이스는 도메인 타입**을 사용한다. 입력(`CreatePostInput`/`UpdatePostInput`)과 필터(`PostFilter`)를 각각 `IPostWriteRepository`/`IPostReadRepository`와 같은 파일에 정의. HTTP Request DTO에 의존하지 않는다.
- **Query 객체에 파생 값을 포함하지 않는다.** `skip` 계산은 Repository에서 수행한다.
- **페이지네이션 Query는 `PaginatedQuery`를 상속**한다. `libs/shared/src/common/query/paginated.query.ts`에 정의된 추상 클래스로, 도메인별 필터를 `filter` 필드로 추가한다.

### Request Flow 레이어 책임

- **Controller** — 라우팅 + Command/Query 객체 생성. Command와 Query를 분리하여 실행
- **Command** — 상태 변경 의도를 표현하는 순수 값 객체
- **Query** — 상태 조회 의도를 표현하는 순수 값 객체
- **Command Handler** — 존재 검증, 쓰기 로직 수행. `void` 또는 ID 반환
- **Query Handler** — 읽기 로직 + `PostResponseDto.of()` 변환 수행

## Handler Authoring Rules

Service 앱 Command Handler(`apps/service/src/**/command/*.handler.ts`)는 다음 규칙을 따른다. 자동 회귀 검증은 `verify-handler-structure` 스킬, 자세한 코드 예시는 `.claude/agents/nestjs-expert.md`의 "Handler Authoring Rules" 섹션 참고.

- **`execute()`는 호출만** — 검증/조회/조립은 private 메서드로 추출(≤50줄 목표). 검증 R1.
- **메서드 네이밍** — `validate{Subject}{Predicate}`(검증), `load{Subject}…OrThrow`(조회+null체크+예외), `find{Subject}…`(단순 조회), `create/persist/link…OrConflict`(단일 write + 23505 매핑), `emit{Name}Event`/`invalidate{Name}Cache`(side-effect, try 밖에 위치).
- **try-catch는 단일 write 1줄만 감싼다** — 이벤트 emit, 캐시 무효화, 추가 write를 try 안에 두지 않는다. 또한 `cacheService.{get,set,del,delByPattern}` 호출을 별도 try/catch로 다시 감싸지 않는다 — `CacheService` 자체가 Fail-Open이라 dead code가 된다(`libs/shared/CLAUDE.md`의 Cache Layer 참고). 검증 R2.
- **`@Transactional()`은 다중 write 묶음 메서드에만** — `execute()` 전체에 달지 않으며 read는 항상 트랜잭션 밖. 단일 write 핸들러는 `@Transactional()` 불필요. 검증 R3.
- **데코레이터 메서드 파라미터 타입은 `import type`** — SWC + `isolatedModules` + `emitDecoratorMetadata` 조합에서 TS1272 회피 (엔티티 양방향 관계 `Relation<T>`와 동일 이유).

## Repository Pattern DI 구조 (ISP 적용)

1. **`IPostReadRepository`** / **`IPostWriteRepository`** (abstract class) — 읽기/쓰기 분리된 DI 토큰 겸 인터페이스
2. 도메인 타입은 해당 인터페이스 파일에 co-locate: `IPostWriteRepository` → `CreatePostInput`/`UpdatePostInput`, `IPostReadRepository` → `PostFilter`
3. **`PostRepository`** — 두 인터페이스를 모두 구현, `BaseRepository` 상속
4. **`postRepositoryProviders`** — `PostRepository`를 등록 후 `useExisting`으로 두 추상 클래스 토큰에 동일 인스턴스를 매핑
5. 모듈에서 `TypeOrmModule.forFeature()`를 사용하지 않음. `BaseRepository`가 `DataSource`를 직접 주입받아 `getRepository<T>()`로 접근

## Auth 모듈

- JWT 기반 인증 (`register`, `login`, `logout`, `refresh-token`, `profile`)
- `JwtAuthGuard`가 PostsController 전체에 적용됨 — 모든 Post 엔드포인트는 Bearer 토큰 필요
- `@CurrentUser()` 커스텀 데코레이터로 인증된 사용자 정보 주입 (`apps/service/src/auth/decorator/`)
- User 엔티티와 Post 엔티티는 `userId` FK로 연결 (1:N)
- Posts와 동일한 Repository Pattern DI 구조 적용 (`IUserReadRepository` / `IUserWriteRepository`)
- **JWT 발급 헬퍼**: `AuthTokenIssuer` 도메인 서비스(`apps/service/src/auth/auth-token-issuer.service.ts`)가 `accessToken`/`refreshToken` 발급 + `hashedRefreshToken` 저장을 단일화. `LoginHandler`/`RefreshTokenHandler`/`GoogleLoginHandler` 모두 이 서비스를 통해 토큰 발급. JWT secret은 반드시 `configService.getOrThrow<string>('JWT_*_SECRET')`로 로드 (env 누락 시 부팅 실패).
- **OAuth (Google)**: `oauth_accounts` 테이블(1:N)로 멀티 프로바이더 확장 가능한 스키마. `(provider, providerId)` 및 `(userId, provider)` 부분 unique index. 동일 이메일 비번 사용자가 Google 로그인 시 자동 연결 금지 — `ConflictException(409)` 후 명시적 link 플로우(`POST /v1/auth/google/link`)로만 연결 허용. Link 시작은 redirect가 아닌 JSON `{ authorizationUrl }` 반환(브라우저 navigation에 Bearer 헤더 미지원 회피). Link callback은 백엔드 발행 signed JWT state(`type='google-link-state'`, 5분 만료)로 사용자 식별. 상세 가이드: `docs/google-oauth-prd.md`

## API Versioning

- URI 기반 버전 관리 (`VersioningType.URI`, `defaultVersion: '1'`) — 모든 API 라우트에 `/v1/` 프리픽스 자동 적용
- Health 엔드포인트는 `VERSION_NEUTRAL` — `/health`로 버전 프리픽스 없이 접근 (K8s probe 호환)
- 새 컨트롤러 추가 시 `defaultVersion`에 의해 자동으로 `/v1/` 적용. 별도 `@Version()` 데코레이터 불필요
- 통합 테스트 URL도 `/v1/` 프리픽스 사용 필수

## Rate Limiting

- `@nestjs/throttler` 기반 글로벌 Rate Limiting (`APP_GUARD`로 `ThrottlerGuard` 등록)
- Named Throttlers: `short` (1초 3회), `long` (분당 60회)
- `@Throttle()` — login/register에 엄격한 제한 (1초 2회, 분당 5회)
- `@SkipThrottle({ short: true, long: true })` — named throttlers 사용 시 스킵 대상을 명시해야 함
- `skipIf: () => process.env.THROTTLE_SKIP === 'true'` — 통합 테스트 환경에서 비활성화
- 429 Too Many Requests 자동 반환. Swagger에 `@ApiTooManyRequestsResponse` 적용

## Event-Driven (CQRS EventBus + Slack)

- `@nestjs/cqrs`의 `EventBus` 기반 도메인 이벤트 발행 — Command Handler에서 상태 변경 후 `eventBus.publish(new XxxEvent(...))`. 별도 이벤트 문자열 키 없이 이벤트 클래스 자체로 라우팅
- `PostCreatedEvent` → `PostCreatedHandler`(`@EventsHandler` + `IEventHandler<T>`)가 Slack 알림 전송 (`apps/service/src/posts/event/`)
- `SlackModule` / `SlackService` (`libs/shared/src/slack/`) — Slack Bot Token으로 채널 알림 전송. 내부 catch로 Fail-Open (전송 실패가 핸들러로 전파되지 않음)
- 이벤트 핸들러는 RxJS 스트림에서 비동기 처리되므로 메인 요청 흐름에 영향 없음. 핸들러 실패도 publisher(Command Handler)에 전파되지 않음
- **이벤트 핸들러 예외는 Exception filter 미적용** — request-response cycle 밖이므로 `HttpExceptionFilter`가 잡지 못한다. EventBus 내장 `catchError`가 예외를 `UnhandledExceptionBus`(CqrsModule이 export하는 앱 전체 싱글톤)로 발행하고, `CqrsLoggingModule`의 `UnhandledEventExceptionsLogger`(`libs/shared/src/cqrs/`)가 이를 구독하여 앱 전역의 이벤트 핸들러 예외를 중앙 로깅. EventBus로 이벤트를 발행하는 앱의 루트 모듈에서 `CqrsLoggingModule`을 import한다 (현재 `ServiceAppModule`만 — back-office는 이벤트 도입 시점에 추가). 이벤트 핸들러 안에 별도 try/catch를 추가하지 않는다 (SlackService Fail-Open + UnhandledExceptionBus 안전망으로 충분 — dead catch 방지)

## Transaction Infrastructure (typeorm-transactional)

- 다중 테이블 쓰기의 원자성이 필요한 Command Handler는 `@Transactional()` 데코레이터(`typeorm-transactional`) 적용. 메서드 내부의 모든 Repository 호출이 동일 트랜잭션에 자동 참여 — Repository 시그니처 변경 불필요.
- **부트스트랩 필수**: 양쪽 앱의 `main.ts`에서 `NestFactory.create` 전 `initializeTransactionalContext()` 호출 + 생성 후 `addTransactionalDataSource(app.get(DataSource))` 등록. 미등록 시 `@Transactional()`이 런타임 에러("No data sources defined").
- **단위 테스트 mock 패턴**: 단위 테스트는 실 DataSource를 부팅하지 않으므로 `@Transactional`이 throw. 데코레이터를 spec 파일 단위로 no-op 처리: `jest.mock('typeorm-transactional', () => ({ Transactional: () => () => undefined }))`. 트랜잭션 의미는 통합 테스트에서 검증.
- **Pre-check + 23505 이중 안전망**: 이 프로젝트는 `findByEmail`/`findByProviderId` 등 read 선조회 후 DB unique 위반(Postgres 23505)을 `ConflictException`으로 변환하는 패턴을 일관되게 사용한다 (`RegisterHandler`, `GoogleLoginHandler`, `LinkGoogleAccountHandler`). 트랜잭션은 부분 실패 시 자동 rollback을, 23505 catch는 동시성 race를 담당. 둘 다 보존한다 — 한쪽만 있으면 결함 시나리오가 남는다.
- 자세한 구조는 `docs/google-oauth-prd.md` §2.7 참고.

## DTO 구조

- `dto/request/` — 요청 DTO (`class-validator` 데코레이터로 유효성 검증). 페이지네이션+필터 DTO는 `PaginationRequestDto`를 상속하여 도메인별 필터 필드를 추가한다.
- `dto/response/` — 응답 DTO (static `of(entity)` 팩토리 메서드로 엔티티 → DTO 변환)

## Swagger

`/api` 경로에서 Swagger UI 확인 가능. DTO에 `@ApiProperty`/`@ApiPropertyOptional` 적용. Bearer Auth 설정이 포함되어 있으므로 인증이 필요한 엔드포인트에 `@ApiBearerAuth()` 적용.

## 단위 테스트 작성 패턴

원칙(Classical School): 실제 조건 분기/변환 로직이 있는 레이어만 단위 테스트. pass-through 레이어(Controller, Repository)의 단위 테스트는 작성하지 않는다.

- Handler 단위 테스트는 [Suites](https://docs.nestjs.com/recipes/suites)(`TestBed.solitary(...).compile()`)로 작성하고 `unitRef.get(Token)`으로 자동 mock을 회수한다. `Test.createTestingModule(...)`는 통합 테스트 헬퍼(`createIntegrationApp`)에서만 사용한다. `Mocked<T>` 타입은 루트 `suites.d.ts`의 reference로 활성화되므로 spec에서 `import { TestBed, type Mocked } from '@suites/unit'`만 import하면 된다.
- **Repository 인터페이스 토큰(abstract class)은 캐스팅 필수**: `IPostReadRepository`처럼 abstract class를 DI 토큰으로 쓰면 `unitRef.get`의 `Type<T>`(non-abstract constructor) 시그니처에 할당되지 못해 `TS2769` 발생. `import type { Type } from '@suites/types.common'`을 추가하고 `unitRef.get<IPostReadRepository>(IPostReadRepository as Type<IPostReadRepository>)` 패턴을 사용한다. `JwtService`/`ConfigService` 등 concrete class 토큰은 캐스팅 불필요. SWC 빌드(`pnpm build:all`)는 spec을 제외하므로 통과하지만 `tsc` strict 체크에서 잡힘.
- Handler: 분기 로직(검증, 23505→`ConflictException` 매핑, `NotFoundException` 분기, DTO 변환 등)이 있는 Handler는 단위 테스트로 커버. 진정한 pass-through(예: `LogoutHandler`처럼 단일 write로 즉시 반환하고 검증 없음)는 통합 테스트로만.
- DTO: `PostResponseDto.of()`, `PaginatedResponseDto.of()` — 순수 팩토리 함수
