# TypeScript full strict 활성화 체크리스트

> 위반 분석(102건 분해), `!` 선택 근거, 범위 외 결정은 [typescript-full-strict-prd.md](./typescript-full-strict-prd.md)를 참고한다.

## 진행 현황 (요약)

| Phase | 상태 | 비고 |
|---|---|---|
| 1. 필드 `!` 추가 | ✅ 완료 | TS2564 100건 / 26개 파일 (엔티티·DTO·타입 클래스) |
| 2. spec mock 타이핑 수정 | ✅ 완료 | TS2345 2건 (ConfigService.get mock) |
| 3. tsconfig strict 통합 + CI 정리 | ✅ 완료 | "strict": true + advisory 단계 제거 |
| 4. 최종 검증 | ✅ 완료 | tsc 0건 + format → lint:check → build:all → test → test:e2e |

## Phase 1: 필드 `!` 추가 (100건)

- [x] 엔티티 6개 파일 (base/post/user/admin/tag/oauth-account)
- [x] Response DTO 9개 파일
- [x] Request DTO 8개 파일 (기본값 있는 필드는 제외)
- [x] 타입 클래스 2개 (`auth-user.type.ts`, `auth-admin.type.ts`)
- [x] 기타 잔여 파일 — `/tmp/strict-errors.txt` 목록 기준 전부 소진

## Phase 2: spec mock 타이핑 수정 (2건)

- [x] `apps/service/src/auth/auth-token-issuer.service.spec.ts:47`
- [x] `apps/back-office/src/auth/admin-token-issuer.service.spec.ts:49`
- [x] 해당 spec 2개 단독 실행 통과

## Phase 3: tsconfig + CI

- [x] `tsconfig.json` — `"strict": true`, 중복 개별 플래그 제거, `noFallthroughCasesInSwitch` 유지
- [x] `npx tsc --noEmit` 0건 확인
- [x] `.github/workflows/typescript-strict.yml` — advisory 단계 제거

## Phase 4: 최종 검증

- [x] `pnpm format`
- [x] `pnpm lint:check`
- [x] `pnpm build:all`
- [x] `pnpm test` (185개, 수 불변)
- [x] `pnpm test:e2e` (160 + 34, Docker 필요)
- [x] diff 검토 — `!` 추가·mock 수정·tsconfig·CI yml 외 변경 없음
