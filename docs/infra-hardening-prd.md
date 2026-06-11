# 인프라 소소한 정리 3건 PRD

프로젝트 전수 점검(2026-06)에서 남은 마지막 권장 묶음. 관측성 보강 1건, 중복 제거 1건, 로그 문구 정정 1건을 한 PR로 처리한다. API 동작·응답에는 변화가 없다.

## 1. 변경 항목

### 1.1 `HttpExceptionFilter`에 비-HttpException 방어 로깅 추가

- **현상**: `libs/shared/src/logging/http-exception.filter.ts`는 `@Catch()`로 모든 예외를 잡아 비-HttpException을 500으로 변환하지만 로깅이 없다. 핸들러 단계 예외는 `LoggingInterceptor`의 error 경로가 stack까지 로깅하지만, **가드/미들웨어 단계(인터셉터 진입 전)에서 터진 비-HttpException은 어디에도 stack이 남지 않는다.**
- **변경**: `PinoLogger`(nestjs-pino, `LoggingInterceptor`와 동일 선례)를 주입하고, **비-HttpException일 때만** error 레벨로 메시지+stack을 로깅한다. HttpException(4xx 의도된 예외)은 기존처럼 로깅하지 않는다 — 핸들러 단계 예외는 인터셉터가 이미 로깅하므로 중복을 최소화하되, 500 변환 직전의 미기록 예외만 잡는 안전망이다.
- **참고**: 핸들러 단계의 비-HttpException은 인터셉터와 필터 양쪽에서 로깅되어 중복 1회가 발생할 수 있다. 가드 단계 예외의 완전 유실(현재)보다 중복이 낫다고 판단 — 중복 제거를 위한 상태 공유는 복잡도 대비 이득이 없어 도입하지 않는다.
- **단위 테스트**: 분기가 생기므로 Classical School 원칙에 따라 spec 추가 — (1) HttpException은 로깅하지 않고 해당 status로 응답, (2) 비-HttpException은 error 로깅 + 500 응답.

### 1.2 bcrypt rounds 하드코딩 5곳 상수화

- **현상**: `bcrypt.hash(…, 10)`이 5곳에 하드코딩되어 있다 — 강도 조정 시 5곳을 찾아 고쳐야 하고 누락 위험이 있다.
  - `apps/service/src/auth/auth-token-issuer.service.ts:52`
  - `apps/service/src/auth/command/register.handler.ts:21`
  - `apps/service/src/auth/command/google-login.handler.ts:96`
  - `apps/back-office/src/auth/admin-token-issuer.service.ts:57`
  - `apps/back-office/src/auth/command/admin-register.handler.ts:24`
- **변경**: `libs/shared/src/common/security.constant.ts`에 `BCRYPT_SALT_ROUNDS = 10`을 신설하고 `@app/shared`로 export, 5곳을 모두 상수 참조로 교체한다. 값은 10 그대로 — 동작 변화 없음.
- **env 설정화는 하지 않는다**: 잘못된 env 값(예: 4)으로 보안 강도가 조용히 낮아지는 위험이 상수의 이점보다 크다. 강도 변경은 코드 리뷰를 거치는 상수 수정으로 충분하다.

### 1.3 Idempotency 인터셉터 로그 문구 정정

- **현상**: `idempotency.interceptor.ts:89`가 손상된 캐시 엔트리에서 `'Corrupted cache entry, reprocessing'`을 로깅하지만, 실제로는 키 삭제 후 **409를 반환**한다(클라이언트가 재시도해야 재처리됨). 1번 작업(`docs/shared-infra-unit-tests-prd.md` §7-1)에서 발견·기록한 항목의 후속 조치다.
- **변경**: 로그 문구만 실제 동작에 맞게 수정 — `'Corrupted cache entry deleted, responding 409 so the client retry can reprocess'`. 동작(del + 409)은 변경하지 않으며, 기존 단위 테스트(`del` 호출 + `ConflictException` 검증)는 그대로 통과한다.
- 발견 기록 문서(`shared-infra-unit-tests-prd.md` §7-1)에 처리 완료를 표기한다.

## 2. 수용 기준 (Acceptance Criteria)

- [x] `HttpExceptionFilter`가 비-HttpException을 error 레벨(stack 포함)로 로깅하고, HttpException은 로깅하지 않는다. 응답 변환 동작은 기존과 동일하다.
- [x] `http-exception.filter.spec.ts`가 두 분기를 검증한다.
- [x] `BCRYPT_SALT_ROUNDS` 상수가 신설되고, `bcrypt.hash(…, 10)` 직접 호출이 0곳이 된다 (값은 10 유지).
- [x] idempotency 로그 문구가 실제 동작(삭제 후 409)을 서술하고, 기존 인터셉터 spec이 수정 없이 통과한다.
- [x] `shared-infra-unit-tests-prd.md` §7-1에 처리 완료가 표기된다.
- [x] `pnpm format` → `pnpm lint:check` → `pnpm build:all` → `pnpm test` → `pnpm test:e2e` 전부 통과한다 (auth 파일 변경이므로 test:e2e 필수).

## 3. 범위 외 (Out of scope)

- bcrypt rounds 값 변경 (10 → 12 등) — 보안 정책 결정 사항.
- 인터셉터/필터 로깅의 중복 제거 메커니즘 — §1.1 참고대로 복잡도 대비 이득 없음.
- idempotency 동작 변경 (손상 캐시 시 즉시 재처리 등) — 현재 409 + 클라이언트 재시도가 안전한 설계.
