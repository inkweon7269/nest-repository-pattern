# TypeScript 엄격성 강화 1단계 PRD

`noImplicitAny` 활성화와 eslint `no-explicit-any` 예외 범위 축소로 타입 안전성의 구멍을 막는다. 사전 측정 결과 **두 변경 모두 기존 코드 위반 0건**이라 코드 수정 없이 설정만 조이는 작업이다.

## 1. 배경

- `tsconfig.json`은 `strictNullChecks: true`이지만 `noImplicitAny: false`, `strictBindCallApply: false`, `noFallthroughCasesInSwitch: false`로 부분 strict 상태다.
- CI의 `typescript-strict.yml`이 `tsc --noEmit --strict`를 advisory(`continue-on-error: true`)로 돌리고 있어, 현재 설정과 strict 목표 사이의 갭이 측정만 되고 강제되지 않는다.
- eslint는 `'@typescript-eslint/no-explicit-any': 'off'`가 **전역**이라 프로덕션 코드에서도 명시적 `any`가 차단되지 않는다.
- 느슨한 상태가 유지될수록 신규 코드에 암묵적/명시적 `any`가 쌓여 나중에 켤 때 수정 비용이 커진다. 위반이 0인 지금이 비용 없이 조일 수 있는 시점이다.

## 2. 사전 측정 결과 (2026-06-12, main `0f6ec77` 기준)

| 항목 | 위반 건수 | 비고 |
| --- | --- | --- |
| `tsc --noEmit --noImplicitAny` | **0건** | 즉시 활성화 가능 |
| `tsc --noEmit --strictBindCallApply` | **0건** | 현재 명시적 `false` — 같이 켜도 무비용 |
| `tsc --noEmit --noFallthroughCasesInSwitch` | **0건** | 동일 |
| 프로덕션 코드 명시적 `any` (grep) | **0건** | eslint 규칙 활성화 시 위반 없음 예상 |
| `tsc --noEmit --strict` (전체) | 102건 | 잔여 갭 — 대부분 `strictPropertyInitialization`(엔티티/DTO 필드). **범위 외** |

## 3. 변경 내용

### 3.1 `tsconfig.json` — 위반 0건인 플래그 3개 활성화

- `noImplicitAny: false` → `true` (핵심 목표)
- **제안 포함**: `strictBindCallApply: false` → `true`, `noFallthroughCasesInSwitch: false` → `true` — 둘 다 명시적으로 꺼져 있지만 위반이 0건이라 같이 켜는 비용이 없다. 별도 PR로 쪼갤 실익이 없어 이번에 묶는 것을 제안한다 (검토 시 제외 요청 가능).

### 3.2 `eslint.config.mjs` — `no-explicit-any` 예외를 테스트 파일로 한정

- 전역 rules 블록에서 `'@typescript-eslint/no-explicit-any': 'off'` 제거 → 프로덕션 코드에는 `recommendedTypeChecked` 기본값(error)이 적용된다.
- 기존 테스트 파일 오버라이드 블록(`**/*.spec.ts`, `**/*.integration-spec.ts`, `test/**/*.ts`)에 `'@typescript-eslint/no-explicit-any': 'off'` 추가 — mock·stub 작성에서 `any`가 실용적인 테스트 코드는 기존처럼 허용 (`no-unsafe-member-access` 등 기존 4개 규칙과 동일 선례).

## 4. 수용 기준 (Acceptance Criteria)

- [x] `tsconfig.json`에서 `noImplicitAny`·`strictBindCallApply`·`noFallthroughCasesInSwitch`가 `true`다.
- [x] `eslint.config.mjs`의 전역 `no-explicit-any: off`가 제거되고 테스트 파일 오버라이드로 이동한다.
- [x] `npx tsc --noEmit` 통과 (코드 수정 0건으로).
- [x] `pnpm lint:check` 통과 (코드 수정 0건으로).
- [x] `pnpm format` → `pnpm build:all` → `pnpm test` → `pnpm test:e2e` 전부 통과한다.
- [x] CI `typescript-strict.yml`의 advisory strict 체크는 변경하지 않는다 (잔여 102건이 advisory로 계속 측정됨).

## 5. 범위 외 (Out of scope)

- **full `--strict` 활성화 (잔여 102건)** — 대부분 `strictPropertyInitialization`으로, 엔티티/DTO 필드 선언 방식(`!` 단언 또는 생성자 초기화) 결정이 필요한 별도 작업.
- `typescript-strict.yml`의 `continue-on-error` 제거 — full strict 달성 후에나 의미 있음.
- 테스트 파일의 `any` 정리 — mock 패턴상 의도된 허용.

## 6. 리스크

- 설정상 위반 0건이지만, SWC 빌드(타입 체크는 ForkTsChecker 비동기)와 `tsc` 체크 경로 차이로 watch 모드에서만 드러나는 케이스가 이론상 있을 수 있다 → 수용 기준의 빌드·테스트 전체 실행으로 확인한다.
- 머지 이후 작성되는 코드부터는 암묵적/명시적 `any`가 컴파일·린트에서 차단된다 — 의도된 효과이며, 테스트 코드는 영향 없다.
