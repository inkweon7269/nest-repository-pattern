# Jest 커버리지 수집 범위 한정 PRD

루트 `package.json`의 jest 설정에서 `collectCoverageFrom`을 소스 디렉터리(`apps/`, `libs/`)의 TypeScript 파일로 한정한다. 1줄 설정 변경이며 테스트 코드·프로덕션 코드 변경은 없다.

## 1. 배경

현재 설정은 `"collectCoverageFrom": ["**/*.(t|j)s"]`로, 커버리지 대상이 레포 루트 전체의 `.ts`/`.js` 파일이다. jest 기본 제외는 `node_modules`뿐이라 다음이 커버리지 분모에 섞인다.

| 오염원 | 발생 환경 | 영향 |
| --- | --- | --- |
| `test/**/*.ts` (통합 spec 6개 + setup 헬퍼 등 15개 파일) | CI(coverage.yml) + 로컬 | 단위 테스트가 실행하지 않는 파일이 0%로 집계되어 수치 희석 |
| `webpack.config.js` 등 루트 `.js` 설정 파일 | CI + 로컬 | 동일 |
| `dist/**` 컴파일 산출물 | 로컬에서 빌드 후 `test:cov` 실행 시 | 소스와 산출물 이중 집계 (CI coverage job은 빌드 단계가 없어 미발생) |

PR 커버리지 리포트(coverage.yml의 PR 코멘트)가 실제 소스 커버리지보다 낮게 표시되고, 로컬과 CI의 수치가 빌드 여부에 따라 달라진다.

## 2. 목표

- `collectCoverageFrom`을 `["apps/**/*.ts", "libs/**/*.ts"]`로 변경하여 커버리지 분모를 소스 코드로 한정한다.
- 커버리지 수치가 "단위 테스트가 커버해야 할 코드" 기준으로 일관되게 산출된다 (로컬 빌드 여부·test/ 헬퍼와 무관).

## 3. 수용 기준 (Acceptance Criteria)

- [x] `package.json` jest 설정의 `collectCoverageFrom`이 `["apps/**/*.ts", "libs/**/*.ts"]`로 변경된다.
- [x] `pnpm test -- --coverage` 리포트의 파일 목록에 `test/`, `webpack.config.js`, `dist/` 경로가 나타나지 않는다.
- [x] CI coverage.yml이 사용하는 `coverage/coverage-summary.json`·`coverage-final.json`이 기존과 동일하게 생성된다 (reporter 설정은 변경하지 않으므로 영향 없음 확인).
- [x] `pnpm format` → `pnpm lint:check` → `pnpm build:all` → `pnpm test` → `pnpm test:e2e` 전부 통과한다.

## 4. 범위 외 (Out of scope)

- **`coverageThreshold` 추가** — 기준선 수치 합의가 필요한 별도 결정 사항. 이번 변경으로 정확해진 수치를 보고 추후 판단한다.
- **`main.ts`·`migrations/` 등 세부 제외 규칙** — 부팅·마이그레이션 코드를 분모에서 뺄지는 측정 정책 논의가 필요하므로 이번엔 손대지 않는다.
- coverage.yml 워크플로 자체 변경 (reporter·액션 교체 등).

## 5. 참고

- spec 파일(`*.spec.ts`)은 glob에 매칭되더라도 jest가 테스트 파일을 instrumentation 대상에서 자동 제외하므로 별도 제외 패턴이 필요 없다 — 검증 단계에서 리포트에 spec 파일이 없는 것으로 확인한다.
