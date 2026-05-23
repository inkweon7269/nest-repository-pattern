# Compression 가이드

## 개요

NestJS 모노레포(`apps/service`, `apps/back-office`)의 HTTP 응답 본문을 gzip으로 압축하는 가이드. `compression` 미들웨어로 응답 페이로드를 압축하여 네트워크 전송량과 응답 지연을 줄인다. JSON 응답(예: `GET /v1/posts` 목록)처럼 텍스트 기반 본문은 gzip으로 큰 압축 이득을 얻는다.

helmet/CORS(`applySecurityMiddleware`)와 동일하게 main.ts 두 곳과 통합 테스트 헬퍼에서 같은 로직이 필요하므로, 압축 설정을 `libs/shared`의 공유 헬퍼로 추출하여 단일 진실 원천을 유지한다.

`compression`은 Express 미들웨어 패키지다. 두 앱 모두 기본 Express 어댑터 위에서 동작하므로 `app.use()`로 그대로 등록할 수 있다.

## 설계 원칙

### 1. 단일 소스

- main.ts 2곳 + `createIntegrationApp` 1곳에 동일 로직이 중복 적용되어야 한다. 압축 설정의 일관성을 위해 **`libs/shared/src/bootstrap/compression.ts`**에 헬퍼 1개로 통합한다.
- threshold·filter 등 압축 동작을 바꿔야 하면 반드시 이 헬퍼 한 곳에서만 수정한다. main.ts에 옵션을 중복 정의하지 않는다 (security.ts 선례와 동일).

### 2. 작은 응답은 압축하지 않음 (threshold)

- 응답 본문이 작으면 압축으로 줄어드는 바이트보다 압축에 드는 CPU·헤더 오버헤드가 더 클 수 있다. threshold(1KB) 미만 응답은 압축하지 않는다.
- `compression` 패키지의 기본 threshold(1KB)를 그대로 유지한다.

### 3. 라우트별 opt-out

- SSE(Server-Sent Events)·스트리밍처럼 압축이 부적합하거나 청크 단위 flush가 필요한 응답은 라우트가 직접 압축을 건너뛸 수 있어야 한다.
- `compression` 권장 패턴에 따라 기본 filter를 확장하여, 응답에 `x-no-compression` 헤더가 설정되어 있으면 압축을 건너뛴다.

### 4. 미들웨어 순서

- `applySecurityMiddleware` 호출 **이후**에 `applyCompressionMiddleware`를 호출한다. 두 미들웨어 모두 라우트 핸들러보다 먼저 등록되므로 헤더/압축 동작에 충돌은 없으나, 적용 순서를 모든 진입점에서 일관되게 유지한다.

## 아키텍처

```text
[요청 흐름]
HTTP Request
   │
   ▼
Express 미들웨어 레이어
   ├─ helmet            ← 응답 보안 헤더 주입
   ├─ CORS              ← Origin 검사, preflight 응답
   └─ compression       ← 응답 본문 gzip 압축 (조건 충족 시)
   │
   ▼
NestJS 파이프라인 (Guards → Interceptors → Pipes → Handlers)
```

```text
[압축 여부 판단]
응답 준비됨
   ├─ x-no-compression 헤더 있음        → 압축 안 함 (opt-out)
   ├─ Accept-Encoding에 gzip 없음        → 압축 안 함 (평문 반환)
   ├─ 본문 크기 < 1KB(threshold)         → 압축 안 함
   ├─ 이미 압축된 콘텐츠 타입            → 압축 안 함 (compression 기본 filter)
   └─ 그 외 (gzip + 1KB 초과 텍스트 등)  → gzip 압축 + Content-Encoding: gzip
```

## 구성 요소

### `applyCompressionMiddleware`

**파일**: `libs/shared/src/bootstrap/compression.ts`

`INestApplication`을 받아 압축 미들웨어를 적용하는 부트스트랩 유틸리티. 두 앱이 동일하게 사용하므로 앱별로 다른 인자가 필요 없다. 옵션은 선택적으로 받아 헬퍼 기본값에 병합한다.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `app` | `INestApplication` | NestFactory.create로 생성된 앱 인스턴스 |
| `options` | `CompressionOptions`(선택) | `compression` 옵션. 미지정 시 헬퍼 기본값(threshold 1KB + opt-out filter) 사용 |

### 압축 옵션

기본값을 유지하되, opt-out을 위한 filter만 확장한다.

| 옵션 | 값 | 이유 |
|------|-----|------|
| `threshold` | `1024` (1KB) | 작은 응답에 대한 압축 오버헤드 회피 (`compression` 기본값 유지) |
| `filter` | opt-out filter | `x-no-compression` 응답 헤더가 있으면 압축 건너뜀, 그 외에는 `compression` 기본 filter 위임 |

opt-out filter는 `compression`의 기본 filter를 감싸 다음 순서로 동작한다.

1. 응답에 `x-no-compression` 헤더가 있으면 `false`를 반환하여 압축을 건너뛴다.
2. 그렇지 않으면 `compression`의 기본 filter(Content-Type 기반 압축 가능 여부 판단)에 위임한다.

> gzip/deflate 선택은 클라이언트의 `Accept-Encoding` 헤더에 따라 `compression`이 자동 협상한다. 별도 인코딩 강제 옵션은 두지 않는다.

## 적용 위치

### main.ts

`applySecurityMiddleware` 호출 **직후**에 호출한다. 보안 헤더 적용 다음에 응답 압축을 등록하는 순서를 모든 앱에서 동일하게 유지한다.

```typescript
// apps/service/src/main.ts
import { applySecurityMiddleware, applyCompressionMiddleware } from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  applySecurityMiddleware(app, { corsOriginEnvKey: 'SERVICE_CORS_ORIGINS' });
  applyCompressionMiddleware(app);

  app.useLogger(app.get(Logger));
  // ... 기존 미들웨어
}
```

back-office도 동일하게 `applySecurityMiddleware` 직후 `applyCompressionMiddleware(app)`를 호출한다 (CORS 키만 `BACK_OFFICE_CORS_ORIGINS`로 다름).

### 통합 테스트 헬퍼

**파일**: `test/setup/integration-helper.ts`

`createIntegrationApp`이 main.ts와 별도로 미들웨어를 적용하므로, 압축 미들웨어도 동일하게 호출해야 통합 테스트가 프로덕션 동작을 반영한다.

```typescript
export async function createIntegrationApp(
  appModule: Type,
  options: { corsOriginEnvKey?: CorsOriginEnvKey } = {},
): Promise<INestApplication<App>> {
  // ... 기존 설정
  const app = module.createNestApplication();
  applySecurityMiddleware(app, { corsOriginEnvKey });
  applyCompressionMiddleware(app);
  // ... useLogger, ValidationPipe, Versioning 등
}
```

- 보안 미들웨어와 동일한 순서(보안 → 압축)를 통합 테스트에서도 유지한다.
- service / back-office 양쪽 통합 테스트가 같은 헬퍼를 통해 압축 동작을 검증한다.

## 라우트별 opt-out 방법

압축을 건너뛰고 싶은 응답에서는 본문을 보내기 전에 `x-no-compression` 헤더를 설정한다. opt-out filter가 이 헤더를 감지하면 해당 응답을 압축하지 않는다.

```typescript
// 예: SSE / 스트리밍 응답을 압축하지 않고 청크 단위로 즉시 flush
@Get('stream')
stream(@Res() res: Response) {
  res.setHeader('x-no-compression', 'true');
  res.setHeader('Content-Type', 'text/event-stream');
  // ... res.write(...)로 스트리밍
}
```

- `x-no-compression`은 압축 판단에만 쓰이는 내부 신호다. 클라이언트에 의미가 있는 헤더가 아니므로, 필요하면 응답 직전에 제거해도 무방하다.
- 일반적인 JSON API 응답은 별도 작업 없이 자동으로 압축 대상이 된다. opt-out은 스트리밍 등 특수한 경우에만 사용한다.

## 검증

분기 로직(`shouldCompressResponse`의 opt-out/위임)은 단위 테스트로, 미들웨어 wiring과 실제 압축 동작은 통합 테스트로 검증한다.

### 단위 테스트

**파일**: `libs/shared/src/bootstrap/compression.spec.ts`

opt-out filter 함수 `shouldCompressResponse`의 분기를 직접 검증한다.

| 검증 항목 | 기대 결과 |
|-----------|----------|
| `x-no-compression` 헤더가 설정된 응답 | `false` 반환 (압축 대상에서 제외) |
| compressible content-type(`application/json`) + opt-out 없음 | `true` 반환 (기본 filter에 위임) |
| 비압축 대상 content-type(`image/png`) | `false` 반환 |

### 통합 테스트

**파일**: `test/service/compression.integration-spec.ts`, `test/back-office/compression.integration-spec.ts`

pass-through 레이어 단위 테스트를 피하고 HTTP 레이어를 통합 테스트로 검증하는 프로젝트 원칙에 따라, 헬퍼의 wiring과 압축 동작을 다음 assertion으로 확인한다.

| 검증 항목 | 기대 결과 |
|-----------|----------|
| `Accept-Encoding: gzip` + 1KB 초과 응답 (service) | `Content-Encoding: gzip` 헤더 설정, 본문이 정상 디코딩됨 |
| 1KB 미만 응답 `/health` (service) | `Content-Encoding` 미설정 (threshold 미달), `Vary: Accept-Encoding`은 설정 |
| `/health` (back-office) | `Vary: Accept-Encoding` 설정 — 미들웨어 wiring 확인 |

supertest는 기본적으로 gzip 응답을 자동 해제하므로, 압축 여부는 본문 비교가 아니라 `Content-Encoding` 응답 헤더로 확인한다.

```typescript
request(app.getHttpServer())
  .get('/v1/...')
  .set('Accept-Encoding', 'gzip')
  // → res.headers['content-encoding'] === 'gzip'
```

### 수동 검증 (선택)

```bash
pnpm start:service:local
# 다른 터미널에서, 1KB 초과 응답을 반환하는 엔드포인트에 대해
curl -i -H 'Accept-Encoding: gzip' http://localhost:3000/v1/...
# → content-encoding: gzip 헤더 확인 (--compressed로 디코딩된 본문도 확인 가능)
```

### 자동 검증

작업 완료 후 프로젝트 표준 검증을 실행한다.

```bash
pnpm format
pnpm lint:check
pnpm build:all
pnpm test
pnpm test:e2e
```

## 적용하지 않은 것 (Out of Scope)

- **Brotli(`br`) 인코딩** — `compression` 패키지는 gzip/deflate만 지원한다. Brotli는 별도 패키지(`shrink-ray-current` 등)가 필요하므로 이번 범위에서 제외.
- **env 기반 런타임 튜닝** — threshold/압축 레벨을 환경변수로 조정하지 않는다. 기본값(threshold 1KB)을 고정하며, 필요 시 별도 작업으로 다룬다.
- **정적 파일 사전 압축(precompressed assets), CDN 레벨 압축** — 인프라/배포 레이어의 책임으로 분리.
- **요청 본문(request body) 압축 해제** — 표준 클라이언트는 요청을 압축하지 않으므로 제외.

## 참고

- [compression 미들웨어](https://github.com/expressjs/compression)
- [NestJS Compression 가이드](https://docs.nestjs.com/techniques/compression)
- [Helmet + CORS 가이드](./helmet-cors-guide.md) — 동일한 공유 헬퍼 패턴의 선례
