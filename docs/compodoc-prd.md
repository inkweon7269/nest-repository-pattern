# Compodoc PRD

소스 코드 구조(모듈 트리 · 클래스 카탈로그 · DI 의존성 그래프 · JSDoc 본문)를 정적 HTML 사이트로 자동 문서화하는 내부 개발자용 문서 도구 도입. 기존 Swagger(`/api`)는 외부 API 소비자용 문서로 그대로 유지하며, 두 도구는 보완 관계다 (Compodoc = 평면도, OpenAPI = 메뉴판).

## 1. 목표

- service / back-office / shared 3개 패키지의 구조 문서를 **통합 1사이트**로 자동 생성한다 — `libs/shared`를 양쪽 앱이 공유하므로 의존성 그래프를 한 화면에서 보는 것이 구조 파악·온보딩 목적에 부합.
- 기존 `docs/`의 아키텍처 가이드 문서를 Compodoc 사이트의 "Guides" 메뉴로 편입하여, 신규 합류자가 **구조(자동 추출) + 설계 의도(가이드)** 를 한 진입점에서 보게 한다.
- 설정은 `.compodocrc.json` 단일 파일로 표준화하고, 실행은 `package.json` scripts로 노출한다 (매번 CLI 플래그 입력 금지).
- 런타임·빌드 파이프라인에 영향 없는 순수 dev 도구로 도입한다 (devDependency, 빌드 타임 소스 분석).

## 2. 사용자 시나리오

1. 개발자가 `pnpm docs:serve`를 실행하면 `http://localhost:8080`에 모듈 트리·클래스 카탈로그·의존성 그래프가 라이브 서버로 뜬다 (`-w` watch 포함).
2. `pnpm docs:build`를 실행하면 `documentation/` 디렉터리에 정적 HTML 사이트가 생성된다 (커밋되지 않음 — gitignore).
3. 신규 합류자가 사이트의 "Guides" 메뉴에서 CQRS·캐시·보안·테스트 전략 등 기존 가이드 문서를 함께 읽는다.
4. 리팩터링 전 의존성 그래프로 영향 범위를 확인하고, 순환 의존성이 시각적으로 드러나면 `forwardRef()` 적용 전 원인 파악에 활용한다.

## 3. 수용 기준 (Acceptance Criteria)

- [ ] `@compodoc/compodoc`이 devDependency로 추가된다.
- [ ] `tsconfig.doc.json`이 신설된다 — 루트 `tsconfig.json`을 extends하고 `include: ["apps/**/*.ts", "libs/**/*.ts"]`, `exclude: ["**/*.spec.ts"]`로 스캔 범위를 한정 (test 헬퍼·spec 파일 제외).
- [ ] `.compodocrc.json`이 신설되어 tsconfig 경로·출력 디렉터리·이름·노출 정책(`disablePrivate` 등)을 단일 파일로 관리한다.
- [ ] `package.json`에 `docs:serve`(로컬 서버 + watch), `docs:build`(정적 빌드) scripts가 추가된다.
- [ ] `.gitignore`에 `/documentation`이 추가된다.
- [ ] `docs/summary.json`이 신설되어 큐레이션된 가이드 문서가 사이트 "Guides" 메뉴에 계층 구조로 노출된다.
- [ ] `pnpm docs:build` 실행 시 에러 없이 사이트가 생성되고, 모듈 트리에 service / back-office / shared 모듈이 모두 표시된다.
- [ ] `pnpm build:all`, `pnpm test` 가 기존과 동일하게 통과한다 (도입으로 인한 회귀 없음).
- [ ] `CLAUDE.md`에 Compodoc 섹션 + scripts 안내가 추가된다.

## 4. 비기능 요구사항

- **출력 디렉터리는 `documentation/`** — 노트/일반 예시의 `-d ./docs`는 기존 `docs/`(마크다운 가이드·PRD)와 충돌하므로 Compodoc 기본값을 유지하고 gitignore 처리한다. 빌드 산출물은 커밋하지 않는다.
- **스캔 범위는 tsconfig로 제어** — Compodoc에는 `--exclude` CLI 플래그가 없다. 파일 스캔은 tsconfig의 `include`/`exclude`를 따르므로 반드시 전용 `tsconfig.doc.json`으로 제어한다. 루트 `tsconfig.json`·빌드(webpack+SWC)·마이그레이션 CLI(`ts-node`) 경로에는 손대지 않는다.
- **설정 단일 진실 원천** — 옵션은 `.compodocrc.json` 한 곳에만 둔다. scripts에 CLI 플래그를 중복 정의하지 않는다 (`docs:serve`의 `-s -w`처럼 실행 모드 플래그만 예외).
- **노출 정책** — `disablePrivate: true`, `disableInternal: true`, `disableLifeCycleHooks: true`, `hideGenerator: true`. public API 중심 문서로 노이즈를 줄인다.
- **가이드 큐레이션 원칙** — `summary.json`에는 현재 유효한 아키텍처 가이드만 포함한다. PRD·todo 문서는 작업 이력이므로 제외한다. 파일 이동 없이 `summary.json` 목록만으로 큐레이션한다 (`--includes`는 summary.json에 명시된 파일만 포함).

## 5. 범위 외 (Out of scope)

- **CI/CD 배포 (Phase 3)** — GitHub Actions `docs:build` + GitHub Pages 배포. 레포 공개 여부/Pages 사용 가능 여부 확인 후 별도 작업.
- **JSDoc 보강 + `--coverageTest` 게이트 (Phase 4)** — 핵심 클래스 JSDoc 보강 후 CI 커버리지 게이트는 점진 도입. 초기부터 임계값 강제 시 노이즈만 발생.
- **`@nestjs/swagger` CLI 플러그인 `introspectComments`** — "JSDoc 한 벌로 Compodoc + OpenAPI 동시 활용" 시너지는 tsc transformer 전제라 이 레포의 webpack + swc-loader 빌드에서는 동작하지 않음. Swagger는 기존 데코레이터 방식 유지.
- **앱별 분리 사이트** — 통합 1사이트로 시작. 규모가 커져 분리가 필요해지면 `.compodocrc` 다중화로 별도 작업.
- **테마/로고 커스터마이징** — 기본 테마 사용.

## 6. 알려진 제약 (기대치 조정)

- **NestJS 라우트 표는 미지원 (검증 완료)** — Compodoc의 라우트 추출은 Angular `@RouterModule` 전용이라 `ROUTES_INDEX`가 빈 트리로 생성되어 빈 Routes 페이지가 메뉴에 노출됨을 확인. `disableRoutesGraph: true`로 페이지·메뉴를 제거했다. 라우트 문서는 Swagger(`/api`)가 담당.
- **abstract class DI 토큰 그래프 (검증 완료)** — `useExisting`으로 매핑된 concrete 클래스(`PostRepository` 등)는 의존성 그래프에 정상 표현된다. abstract 토큰(`IPostReadRepository`)은 별도 노드로 그려지지 않으나 구조 파악에 지장 없음.
- **가이드 본문 `.md` 상대 링크는 사이트에서 404 (검증 완료)** — 원본 md의 `./xxx-guide.md` 상호 링크를 Compodoc이 HTML 슬러그로 재작성하지 않는다. 사이트용으로 고치면 GitHub 렌더링이 깨지므로 수용. README 페이지의 레포 상대 링크(`./docs/*.md` 등)도 동일.
- **클래스명 = 페이지 키** — 앱 간 동명 클래스는 문서 페이지가 서로 덮어써진다. 루트 모듈을 `ServiceAppModule`/`BackOfficeAppModule`로 리네임하여 해소 (구현 중 발견·결정).
- `tsconfig.json`의 `removeComments: true`는 emit 옵션이라 무관 — Compodoc은 소스를 직접 파싱하므로 JSDoc 추출에 영향 없다.

## 7. 영향받는 파일 목록 (구현 참고)

| 파일 | 변경 내용 |
| --- | --- |
| `package.json` | `@compodoc/compodoc` devDependency, `docs:serve`/`docs:build` scripts 추가 |
| `tsconfig.doc.json` | **신규** — 문서 전용 tsconfig (apps + libs include, spec 제외) |
| `.compodocrc.json` | **신규** — Compodoc 설정 단일 파일 |
| `docs/summary.json` | **신규** — Guides 메뉴 큐레이션 목록 |
| `.gitignore` | `/documentation` 추가 |
| `CLAUDE.md` | Compodoc 섹션 + Build & Run Commands에 docs scripts 추가 |

### Guides 큐레이션 후보 (summary.json)

| 포함 | 문서 |
| --- | --- |
| ✅ | `cqrs-guide.md`, `cache-layer-guide.md`, `helmet-cors-guide.md`, `compression-guide.md`, `idempotency-guide.md`, `swc-migration-guide.md`, `testing-strategy.md`, `interface-segregation-principle.md`, `github-actions-guide.md`, `google-oauth-prd.md` (CLAUDE.md가 상세 가이드로 참조) |
| ❌ | `*-prd.md`(google-oauth 제외)·`*-todo.md` (작업 이력), `improvement-suggestions.md`, `coderabbit-review-automation.md`, `dependabot-auto-merge.md` (레포 운영 자동화 — 구조 문서 아님) |

## 8. 실행 계획 (Task 분해)

| # | Task | 내용 | 의존 |
| --- | --- | --- | --- |
| T1 | 핵심 도입 | 패키지 설치, `tsconfig.doc.json` + `.compodocrc.json` 신설, scripts + gitignore | — |
| T2 | 생성 검증 | `pnpm docs:build` 실행 → 모듈 트리/그래프/카탈로그 확인, abstract token 그래프 표현 확인 | T1 |
| T3 | Guides 통합 | `docs/summary.json` 작성, `.compodocrc.json`에 `includes` 설정, 메뉴 노출 확인 | T2 |
| T4 | 문서화 | `CLAUDE.md` Compodoc 섹션 추가 | T3 |
| T5 | 최종 검증 | `pnpm format` → `lint:check` → `build:all` → `test` 회귀 없음 확인 | T4 |
