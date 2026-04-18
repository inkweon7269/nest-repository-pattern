# Helmet + CORS 가이드

## 개요

NestJS 모노레포(`apps/service`, `apps/back-office`)에 웹 보안 미들웨어를 적용하는 가이드. `helmet`으로 보안 응답 헤더(CSP, X-Frame-Options 등)를 설정하고, `enableCors`로 환경변수 기반 origin whitelist를 구성한다. main.ts 두 곳과 통합 테스트 헬퍼에서 동일 로직이 필요하므로 `libs/shared`의 공유 헬퍼로 추출한다.

## 설계 원칙

### 1. 최소 권한 (Least Privilege)

- 사용자 API(`apps/service`)와 관리자 API(`apps/back-office`)는 **서로 다른 CORS whitelist**를 갖는다. 관리자 API가 사용자 프론트엔드 도메인에 불필요하게 노출되지 않도록 `SERVICE_CORS_ORIGINS`와 `BACK_OFFICE_CORS_ORIGINS`를 분리.

### 2. Fail-Safe

- `NODE_ENV=production`에서 CORS 환경변수가 누락된 경우 **CORS를 활성화하지 않는다** (브라우저 cross-origin 요청 차단). 개발 편의를 위해 완화된 설정이 production으로 흘러 들어가지 않도록 방어.
- `NODE_ENV=local` / `development`에서 환경변수가 비어 있으면 모든 origin을 허용(`origin: true`)하여 로컬 개발 편의성을 유지.

### 3. Swagger UI와 공존

- helmet 기본 CSP는 인라인 스크립트/스타일을 차단하여 Swagger UI를 깨뜨린다. 모든 환경에서 Swagger UI(`/api`)를 사용 중이므로, CSP directive에 Swagger가 요구하는 항목(`'unsafe-inline'`, `data:`, `validator.swagger.io`)을 허용한다.

### 4. 단일 소스

- main.ts 2곳 + `createIntegrationApp` 1곳에 동일 로직이 중복 적용되어야 한다. 보안 설정의 일관성을 위해 **`libs/shared/src/bootstrap/security.ts`**에 헬퍼 1개로 통합.

## 아키텍처

```text
[요청 흐름]
HTTP Request
   │
   ▼
Express 미들웨어 레이어
   ├─ helmet            ← 응답 보안 헤더 주입
   └─ CORS              ← Origin 검사, preflight 응답
   │
   ▼
NestJS 파이프라인 (Guards → Interceptors → Pipes → Handlers)
```

```text
[환경별 동작]
NODE_ENV=local | development
   └─ SERVICE_CORS_ORIGINS 비어 있음 → origin: true (모든 origin 허용)
   └─ 값 있음                       → whitelist 매칭만 허용

NODE_ENV=production
   └─ 값 없음 → enableCors 미호출 (fail-safe)
   └─ 값 있음 → whitelist 매칭만 허용
```

## 구성 요소

### `applySecurityMiddleware`

**파일**: `libs/shared/src/bootstrap/security.ts`

`INestApplication`과 옵션을 받아 helmet + CORS를 적용하는 부트스트랩 유틸리티. 앱(service/back-office)별로 사용할 CORS 환경변수 키만 달리 주입한다.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `app` | `INestApplication` | NestFactory.create로 생성된 앱 인스턴스 |
| `options.corsOriginEnvKey` | `'SERVICE_CORS_ORIGINS' \| 'BACK_OFFICE_CORS_ORIGINS'` | CORS whitelist를 읽어올 환경변수 키 |

### helmet 옵션

기본값 대부분을 유지하되, Swagger UI 호환성을 위해 CSP directive만 조정한다.

| Directive | 값 | 이유 |
|-----------|-----|------|
| `defaultSrc` | `'self'` | 기본 정책 |
| `styleSrc` | `'self'`, `'unsafe-inline'` | Swagger UI가 인라인 스타일 사용 |
| `scriptSrc` | `'self'`, `'unsafe-inline'` | Swagger UI가 인라인 스크립트 사용 |
| `imgSrc` | `'self'`, `data:`, `validator.swagger.io` | Swagger 로고/아이콘, data URI |

이외 helmet 기본 헤더(`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, `X-DNS-Prefetch-Control` 등)는 자동 적용.

### CORS 옵션

| 옵션 | 값 | 설명 |
|------|-----|------|
| `origin` | 콜백 또는 `true` | whitelist 검사. 개발 fallback 시 `true` |
| `credentials` | `true` | 쿠키/Authorization 헤더 교차 전달 허용 (향후 refresh token 쿠키화 대비) |
| `methods` | `GET, POST, PATCH, PUT, DELETE, OPTIONS` | 명시적 허용 메서드 |
| `allowedHeaders` | `Content-Type, Authorization, Idempotency-Key` | 프로젝트에서 실제 사용하는 커스텀 헤더 포함 |
| `maxAge` | `3600` | preflight 캐시 1시간 |

> `credentials: true` 사용 시 whitelist는 반드시 구체 origin이어야 한다. `origin: '*'`와 `credentials: true`의 조합은 브라우저가 거부한다. 개발 fallback의 `origin: true`는 요청 origin을 반사(reflect)하므로 동작 가능.

## 적용 위치

### main.ts

`NestFactory.create()` 직후, `useLogger`보다 앞에서 호출한다. 미들웨어는 모든 요청 응답에 헤더를 설정하므로 가장 먼저 적용하는 것이 관례.

```typescript
// apps/service/src/main.ts
import { applySecurityMiddleware } from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  applySecurityMiddleware(app, { corsOriginEnvKey: 'SERVICE_CORS_ORIGINS' });

  app.useLogger(app.get(Logger));
  // ... 기존 미들웨어
}
```

back-office는 `corsOriginEnvKey: 'BACK_OFFICE_CORS_ORIGINS'`로 호출.

### 통합 테스트 헬퍼

**파일**: `test/setup/integration-helper.ts`

`createIntegrationApp`이 main.ts와 별도로 미들웨어를 적용하므로, 보안 미들웨어도 동일하게 호출해야 통합 테스트가 프로덕션 동작을 반영한다.

```typescript
export async function createIntegrationApp(
  appModule: Type,
  options: { corsOriginEnvKey?: CorsOriginEnvKey } = {},
): Promise<INestApplication<App>> {
  const { corsOriginEnvKey = 'SERVICE_CORS_ORIGINS' } = options;

  // ... 기존 설정
  const app = module.createNestApplication();
  applySecurityMiddleware(app, { corsOriginEnvKey });
  // ... useLogger, ValidationPipe, Versioning 등
}
```

- back-office 통합 테스트에서는 `createIntegrationApp(AdminTestModule, { corsOriginEnvKey: 'BACK_OFFICE_CORS_ORIGINS' })`로 호출.
- 기존 service 통합 테스트는 1-arg 호출을 유지 (기본값으로 동일 동작).

## 환경변수

### 정의

| 변수 | 필수 여부 | 설명 |
|------|----------|------|
| `SERVICE_CORS_ORIGINS` | production에서 필수 | `apps/service`의 허용 origin. 쉼표 구분 |
| `BACK_OFFICE_CORS_ORIGINS` | production에서 필수 | `apps/back-office`의 허용 origin. 쉼표 구분 |

### 파일별 예시

**`.env.example`**
```env
# CORS (쉼표 구분 origin 목록. production 환경에서는 필수)
SERVICE_CORS_ORIGINS=https://app.example.com
BACK_OFFICE_CORS_ORIGINS=https://admin.example.com
```

**`.env.local`** — 기본적으로 주석 처리하여 fallback(`origin: true`) 동작을 유도.
```env
# SERVICE_CORS_ORIGINS=http://localhost:5173
# BACK_OFFICE_CORS_ORIGINS=http://localhost:5174
```

**`.env.development`**, **`.env.production`** — 실제 배포 도메인으로 채움.

### 테스트 환경

`test/setup/global-setup.ts`에서 `.test-env.json`에 고정값 주입:

```typescript
SERVICE_CORS_ORIGINS: 'http://allowed.test',
BACK_OFFICE_CORS_ORIGINS: 'http://allowed-admin.test',
```

`THROTTLE_SKIP`, `OTEL_ENABLED`와 동일한 선례를 따른다.

## 검증

### 통합 테스트

**파일**: `test/service/security.integration-spec.ts`, `test/back-office/security.integration-spec.ts`

pass-through 레이어 단위 테스트를 피하고 HTTP 레이어를 통합 테스트로 검증하는 프로젝트 원칙에 따라, 헬퍼의 동작을 다음 assertion으로 확인:

| 검증 항목 | 기대 결과 |
|-----------|----------|
| `X-Content-Type-Options` 헤더 | `'nosniff'` |
| `X-Frame-Options` 헤더 | `'SAMEORIGIN'` |
| `Content-Security-Policy` 헤더 | `default-src 'self'` 포함, `validator.swagger.io` 포함 |
| whitelist origin 요청 | `Access-Control-Allow-Origin`에 origin 반영 |
| non-whitelist origin 요청 | `Access-Control-Allow-Origin` 미설정 |
| preflight `OPTIONS /v1/posts` | `Access-Control-Allow-Methods`에 POST 포함, `Access-Control-Allow-Headers`에 `Idempotency-Key` 포함 |

검증 타겟은 인증이 필요 없는 `/health` 엔드포인트를 사용하여 테스트 복잡도를 최소화.

### 수동 검증 (선택)

```bash
pnpm start:service:local
# 다른 터미널에서
curl -i http://localhost:3000/health
# → content-security-policy, x-content-type-options, x-frame-options 헤더 확인

# Swagger UI 확인
open http://localhost:3000/api
# → 브라우저 콘솔에 CSP 위반 없이 UI 정상 로드
```

### 자동 검증

작업 완료 후 프로젝트 표준 검증을 실행:

```bash
pnpm format
pnpm lint:check
pnpm build:all
pnpm test
pnpm test:e2e
```

## 트러블슈팅

### Swagger UI가 빈 화면으로 표시됨

브라우저 콘솔에 `Refused to execute inline script because it violates the following Content Security Policy directive` 경고가 보이면 CSP directive가 Swagger를 허용하지 않은 상태. `styleSrc`/`scriptSrc`에 `'unsafe-inline'`, `imgSrc`에 `data:`, `validator.swagger.io`가 포함되었는지 확인.

### CORS 요청이 차단됨 (prod)

`access-control-allow-origin` 헤더가 없는 경우:
1. `SERVICE_CORS_ORIGINS` 또는 `BACK_OFFICE_CORS_ORIGINS`가 설정되었는지 확인.
2. 값이 정확히 요청 origin과 일치하는지 확인 (프로토콜/포트 포함, trailing slash 없음).
3. 쉼표 구분 포맷이 올바른지 확인 (`https://a.com,https://b.com`).

### `credentials` 관련 오류

브라우저 콘솔에 `Credentials flag is 'true', but the 'Access-Control-Allow-Origin' header is '*'` 오류가 발생하면 `origin: true` fallback이 동작하고 있을 가능성. production에서는 반드시 명시적 whitelist를 설정.

### 테스트에서 `Access-Control-Allow-Origin`이 설정되지 않음

`Origin` 헤더를 요청에 포함했는지 확인. supertest는 기본적으로 `Origin` 헤더를 자동으로 추가하지 않는다.

```typescript
request(app.getHttpServer())
  .get('/health')
  .set('Origin', 'http://allowed.test')  // 필수
```

## 적용하지 않은 것 (Out of Scope)

- production 환경에서 Swagger UI 비활성화 및 엄격한 CSP 전환.
- CORS origin 환경변수 스키마 검증 (Joi 등). 프로젝트에 env 검증 체계가 없으므로 동일 방식 유지.
- `crossOriginResourcePolicy`, `crossOriginEmbedderPolicy` 커스텀. 프로젝트가 API 전용이므로 helmet 기본값 유지.
- Rate Limiting / Auth 가이드. 각각 `@nestjs/throttler` 글로벌 가드, JWT 가이드 참조.

## 참고

- [Helmet 공식 문서](https://helmetjs.github.io/)
- [NestJS Security 가이드](https://docs.nestjs.com/security/helmet)
- [MDN — CORS](https://developer.mozilla.org/ko/docs/Web/HTTP/CORS)
