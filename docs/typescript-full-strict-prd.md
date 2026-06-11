# TypeScript full strict 활성화 PRD

엄격성 강화 2단계(1단계: PR #78). `tsconfig.json`을 `"strict": true`로 전환하고 잔여 위반 102건을 해소한다. 완료 시 CI의 advisory strict 체크가 본 체크와 동일해지므로 중복 단계를 정리한다.

## 1. 위반 분석 (main `24e68f7` 기준, 총 102건)

| TS 코드 | 건수 | 의미 | 해소 방법 |
| --- | --- | --- | --- |
| TS2564 (`strictPropertyInitialization`) | **100건 / 26개 파일** | 필드가 생성자에서 확정 할당되지 않음 | `!`(definite assignment assertion) 추가 |
| TS2345 (`strictFunctionTypes`) | **2건** | spec의 ConfigService mock 시그니처가 overload와 불일치 | mock 타이핑 수정 |

TS2564의 분포: 엔티티 6개 파일(31건), Response DTO 9개(33건), Request DTO 8개(19건), 타입 클래스 2개(`auth-user.type`, `auth-admin.type`, 5건), 기타(12건). `noImplicitThis`·`alwaysStrict`·`useUnknownInCatchVariables` 위반은 0건 (catch 블록은 이미 `(error as Error)` 캐스팅 패턴 사용).

## 2. 변경 내용

### 2.1 필드 선언에 `!` 추가 (TS2564, 100건)

- TypeORM 엔티티·class-transformer DTO·데코레이터 주입 타입은 **프레임워크가 런타임에 값을 채우는** 클래스라 생성자 초기화가 부자연스럽다. TypeORM/NestJS 생태계의 표준 해법인 `!` 단언을 일괄 적용한다: `title: string;` → `title!: string;`
- `!`는 타입 선언 전용이라 **런타임 동작·SWC 빌드 산출물에 영향이 없다** (생성자 초기화 방식은 인스턴스 생성 시 실제 할당이 발생해 동작 변화 가능성이 있어 배제).
- 기본값이 이미 있는 필드(`page: number = 1` 등)와 `?` 옵셔널 필드는 에러가 아니므로 손대지 않는다.

### 2.2 spec의 ConfigService mock 타이핑 수정 (TS2345, 2건)

- `apps/service/src/auth/auth-token-issuer.service.spec.ts:47`, `apps/back-office/src/auth/admin-token-issuer.service.spec.ts:49` — `strictFunctionTypes`에서 ConfigService.get overload 해석이 엄격해져 mock 구현 시그니처가 거부된다. 구현 시점에 실제 코드를 보고 최소 수정(시그니처 조정 또는 명시적 캐스팅)한다.

### 2.3 `tsconfig.json` — `"strict": true`로 통합

- 개별 플래그(`strictNullChecks`, `noImplicitAny`, `strictBindCallApply`)를 `"strict": true` 한 줄로 대체한다 (모두 strict 포함 항목). `noFallthroughCasesInSwitch`는 strict 미포함이므로 유지.

### 2.4 (구현 중 발견) slack.service.ts 템플릿 리터럴 1건

- `"strict": true` 적용으로 `useUnknownInCatchVariables`가 켜지면서 catch 변수가 `unknown`이 되었고, `slack.service.ts:108`의 템플릿 리터럴 else 분기(`: error`)가 eslint `restrict-template-expressions`에 걸렸다 (tsc가 아닌 type-aware lint에서 검출 — §1 사전 측정에 잡히지 않은 이유).
- `String(error)`로 수정 — 문자열 보간 결과는 동일하므로 런타임 무변경.

### 2.5 CI `typescript-strict.yml` — advisory 단계 정리

- tsconfig가 strict면 기존 "Type check (current config)" 단계(`npx tsc --noEmit`)가 곧 strict 체크다. 동일 명령을 `--strict`로 한 번 더 돌리는 advisory 단계(`continue-on-error: true`)는 중복이므로 **제거**한다. 이제 strict 위반은 CI에서 차단된다 — PR #78에서 "full strict 달성 후"로 미뤄둔 항목의 완결.

## 3. 수용 기준 (Acceptance Criteria)

- [x] `tsconfig.json`이 `"strict": true`이고 중복 개별 플래그가 정리된다.
- [x] `npx tsc --noEmit` 에러 0건.
- [x] `typescript-strict.yml`에서 advisory 단계가 제거된다 (본 체크 1개만 남음).
- [x] `!` 추가와 spec mock 수정 외 코드 변경이 없다 — 런타임 동작 무변경.
- [x] 테스트 수 불변: 단위 185 / 통합 160 + 34.
- [x] `pnpm format` → `pnpm lint:check` → `pnpm build:all` → `pnpm test` → `pnpm test:e2e` 전부 통과한다.

## 4. 범위 외 (Out of scope)

- `exactOptionalPropertyTypes`·`noUncheckedIndexedAccess` 등 strict 미포함 추가 플래그 — 별도 결정.
- `!` 대신 생성자 초기화/`declare`로의 구조 변경 — 생태계 표준에서 벗어나고 런타임 영향 가능성.
- 엔티티/DTO 필드의 타입 자체 변경.
