# Jest 커버리지 수집 범위 한정 체크리스트

> 배경과 수용 기준은 [jest-coverage-scope-prd.md](./jest-coverage-scope-prd.md)를 참고한다.

## 진행 현황 (요약)

| Phase | 상태 | 비고 |
|---|---|---|
| 1. 설정 변경 | ✅ 완료 | `collectCoverageFrom` 1줄 |
| 2. 커버리지 산출 검증 | ✅ 완료 | 리포트 파일 목록 + CI용 json 생성 확인 |
| 3. 최종 검증 | ✅ 완료 | format → lint:check → build:all → test → test:e2e |

## Phase 1: 설정 변경

- [x] `package.json` jest의 `collectCoverageFrom`을 `["apps/**/*.ts", "libs/**/*.ts"]`로 변경

## Phase 2: 커버리지 산출 검증

- [x] `pnpm test -- --coverage --coverageReporters=text --coverageReporters=json-summary --coverageReporters=json` 실행
- [x] 리포트 파일 목록에 `test/`·`webpack.config.js`·`*.spec.ts` 없음 확인
- [x] (로컬 빌드 후 재실행) `dist/` 경로 없음 확인
- [x] `coverage/coverage-summary.json`·`coverage-final.json` 생성 확인 (CI 액션 입력 호환)

## Phase 3: 최종 검증

- [x] `pnpm format`
- [x] `pnpm lint:check`
- [x] `pnpm build:all`
- [x] `pnpm test`
- [x] `pnpm test:e2e` (Docker 필요)
- [x] 변경 파일이 `package.json`·docs 2개뿐인지 확인
