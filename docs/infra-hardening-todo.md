# 인프라 소소한 정리 3건 체크리스트

> 변경 근거, 설계 결정(중복 로깅 허용, env 설정화 안 함 등)은 [infra-hardening-prd.md](./infra-hardening-prd.md)를 참고한다.

## 진행 현황 (요약)

| Phase | 상태 | 비고 |
|---|---|---|
| 1. HttpExceptionFilter 방어 로깅 | ✅ 완료 | PinoLogger 주입 + 비-HttpException만 error 로깅 + spec |
| 2. bcrypt rounds 상수화 | ✅ 완료 | BCRYPT_SALT_ROUNDS 신설 + 5곳 교체 |
| 3. idempotency 로그 문구 정정 | ✅ 완료 | 문구만 수정, 동작 무변경 |
| 4. 최종 검증 | ✅ 완료 | format → lint:check → build:all → test → test:e2e |

## Phase 1: `HttpExceptionFilter` 방어 로깅

- [x] `PinoLogger` 주입 + `setContext` (LoggingInterceptor 선례)
- [x] 비-HttpException이면 error 레벨로 메시지+stack 로깅
- [x] HttpException은 로깅하지 않음 (기존 동작 유지)
- [x] `http-exception.filter.spec.ts` 추가 — 두 분기 검증
- [x] `npx jest libs/shared/src/logging/http-exception.filter.spec.ts` 통과

## Phase 2: bcrypt rounds 상수화

- [x] `libs/shared/src/common/security.constant.ts` 신설 (`BCRYPT_SALT_ROUNDS = 10`)
- [x] `libs/shared/src/index.ts` export 추가
- [x] 5곳 교체: auth-token-issuer.service / register.handler / google-login.handler / admin-token-issuer.service / admin-register.handler
- [x] `grep "bcrypt.hash" 결과에 숫자 리터럴 0곳` 확인

## Phase 3: idempotency 로그 문구 정정

- [x] `idempotency.interceptor.ts:89` 문구를 실제 동작(삭제 후 409) 서술로 수정
- [x] 기존 `idempotency.interceptor.spec.ts` 수정 없이 통과 확인
- [x] `shared-infra-unit-tests-prd.md` §7-1에 처리 완료 표기

## Phase 4: 최종 검증

- [x] `pnpm format`
- [x] `pnpm lint:check`
- [x] `pnpm build:all`
- [x] `pnpm test`
- [x] `pnpm test:e2e` (auth 파일 변경 — 필수)
- [x] 변경 범위 확인 (코드 8개 파일 + spec 1개 + docs 3개)
