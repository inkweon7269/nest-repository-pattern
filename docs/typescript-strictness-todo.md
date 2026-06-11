# TypeScript 엄격성 강화 1단계 체크리스트

> 사전 측정 결과(위반 0건 근거), 범위 외 결정은 [typescript-strictness-prd.md](./typescript-strictness-prd.md)를 참고한다.

## 진행 현황 (요약)

| Phase | 상태 | 비고 |
|---|---|---|
| 1. tsconfig 플래그 활성화 | ✅ 완료 | noImplicitAny + strictBindCallApply + noFallthroughCasesInSwitch |
| 2. eslint 예외 범위 축소 | ✅ 완료 | no-explicit-any: 전역 off → 테스트 파일만 off |
| 3. 최종 검증 | ✅ 완료 | tsc → format → lint:check → build:all → test → test:e2e |

## Phase 1: `tsconfig.json` 플래그 활성화

- [x] `noImplicitAny: true`
- [x] `strictBindCallApply: true`
- [x] `noFallthroughCasesInSwitch: true`
- [x] `npx tsc --noEmit` 통과 확인

## Phase 2: `eslint.config.mjs` 예외 범위 축소

- [x] 전역 rules에서 `'@typescript-eslint/no-explicit-any': 'off'` 제거
- [x] 테스트 파일 오버라이드 블록에 `'@typescript-eslint/no-explicit-any': 'off'` 추가
- [x] `pnpm lint:check` 통과 확인 (프로덕션 코드 위반 0건)

## Phase 3: 최종 검증

- [x] `pnpm format`
- [x] `pnpm lint:check`
- [x] `pnpm build:all`
- [x] `pnpm test`
- [x] `pnpm test:e2e` (Docker 필요)
- [x] 변경 파일이 `tsconfig.json`·`eslint.config.mjs`·docs 2개뿐인지 확인 (코드 수정 0건 목표)
