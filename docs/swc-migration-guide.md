# SWC 적용 가이드 (모노레포 빌드 + Jest)

## 개요

NestJS 모노레포(`apps/service`, `apps/back-office`, `libs/shared`)의 트랜스파일링을 TypeScript 컴파일러(`tsc` / `ts-loader` / `ts-jest`)에서 Rust 기반 [SWC](https://swc.rs/)로 전환하는 가이드. 빌드는 **Webpack + swc-loader**, 테스트는 **`@swc/jest`**로 옮긴다. NestJS 공식 문서가 모노레포 모드에서는 SWC builder를 직접 사용할 수 없고 Webpack을 경유하도록 안내하므로, 본 가이드는 그 경로를 따른다.

> 참고: [NestJS Recipes — SWC](https://docs.nestjs.com/recipes/swc)

## 설계 원칙

### 1. NestJS CLI 기본값 최대 활용

- `@nestjs/cli`는 `webpack: true`일 때 `webpack-defaults.js`를 통해 `webpack-node-externals`, `tsconfig-paths-webpack-plugin`, `ForkTsCheckerWebpackPlugin`, `IgnorePlugin`(NestJS lazy import 무시), `node: { __dirname: false }`를 **자동으로 적용**한다. 사용자 `webpack.config.js`는 nest CLI 기본값을 spread로 보존하고 **`module.rules`만 swc-loader로 교체**한다.
- 결과: 사용자 정의 webpack 설정이 ~15줄로 끝난다.

### 2. SWC 옵션은 NestJS 공식 팩토리에서 받음

- `@nestjs/cli/lib/compiler/defaults/swc-defaults`의 `swcDefaultsFactory()`가 반환하는 옵션은 NestJS DI / TypeORM 메타데이터에 필요한 다음을 모두 포함한다.
  - `legacyDecorator: true`
  - `decoratorMetadata: true`
  - `useDefineForClassFields: false`
  - `keepClassNames: true`
- 직접 옵션을 작성하지 않고 팩토리를 재사용하여 NestJS 메이저 업그레이드 시에도 기본값을 자동 추종.

### 3. 빌드와 테스트의 SWC 옵션 격리

- Jest는 `.swcrc`(루트)를 읽고, 빌드(swc-loader)는 인라인 옵션 + `swcrc: false`로 `.swcrc`를 무시한다.
- 결과: `.swcrc` 변경이 빌드 동작에 새는 것을 차단. 두 경로 모두 명시적으로 결정된 옵션만 사용.

### 4. 마이그레이션 CLI는 ts-node 유지

- TypeORM 마이그레이션은 운영 안정성이 가장 중요한 경로. `ts-node/register + tsconfig-paths/register` 조합을 그대로 둔다. SWC 전환의 검증이 끝난 후 별도 작업으로 `@swc-node/register` 교체를 검토.

## 아키텍처

```text
[빌드 흐름 — nest build {service|back-office}]
nest CLI
   │
   ▼
WebpackCompiler (webpack: true 분기)
   │
   ├─ webpack-defaults (자동)
   │     ├─ target: 'node'
   │     ├─ externals: webpack-node-externals  ← node_modules 외부화
   │     ├─ resolve.plugins: TsconfigPathsPlugin  ← @app/shared 등 별칭 해결
   │     ├─ node: { __dirname: false }  ← typeorm.config 마이그레이션 glob 보존
   │     ├─ IgnorePlugin (NestJS lazy import)
   │     ├─ ignoreWarnings (CriticalDependenciesWarning 외)
   │     └─ ForkTsCheckerWebpackPlugin  ← 타입 체크 병행
   │
   └─ webpack.config.js (사용자, 함수 형태)
         └─ module.rules: swc-loader  ← .ts 파일 트랜스파일
                            ↑
                            options = swcDefaultsFactory().swcOptions + { swcrc: false }
   │
   ▼
dist/apps/{name}/main.js  (단일 번들)
   │
   ▼
node dist/apps/{name}/main  (start:*:prod 무수정 호환)
```

```text
[테스트 흐름 — pnpm test / pnpm test:e2e]
Jest
   │
   ▼
transform: '@swc/jest'
   │
   ▼
.swcrc (루트)  ← legacyDecorator, decoratorMetadata, target, parser
   │
   ▼
moduleNameMapper (기존)  ← @app/shared, @service/*, @back-office/* 별칭 해결
   │
   ▼
테스트 실행
```

## 구성 요소

### `webpack.config.js`

**파일**: `webpack.config.js` (프로젝트 루트, 신규)

함수 형태로 nest CLI가 주입한 webpack 옵션 전체(`options`)를 받아 `module.rules`만 교체한다.

```javascript
const {
  swcDefaultsFactory,
} = require('@nestjs/cli/lib/compiler/defaults/swc-defaults');

const baseSwcOptions = swcDefaultsFactory().swcOptions;
const swcOptions = { ...baseSwcOptions, swcrc: false };

module.exports = function (options) {
  return {
    ...options,
    module: {
      ...options.module,
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: { loader: 'swc-loader', options: swcOptions },
        },
      ],
    },
  };
};
```

| 결정 | 이유 |
|------|------|
| 함수 형태 (`function(options) { ... }`) | nest CLI는 사용자 config를 `{...defaultOptions, ...userConfig}`로 얕게 머지. 객체 형태로 `module`을 주면 nest 기본 `module`이 통째로 교체됨. 함수 형태로 받아 `options.module`을 spread해야 안전 |
| `swcrc: false` | Jest용 루트 `.swcrc`가 빌드 swc-loader에 새지 않도록 격리 |
| 직접 require: `swcDefaultsFactory`만 | 외부 패키지(`webpack-node-externals` 등)를 직접 require하지 않으므로 pnpm strict node_modules 환경에서도 호이스팅 의존 없이 동작 |

### `nest-cli.json` 변경

```diff
   "compilerOptions": {
     "deleteOutDir": true,
-    "webpack": false,
+    "webpack": true,
+    "webpackConfigPath": "webpack.config.js",
     "tsConfigPath": "apps/service/tsconfig.app.json"
   },
```

- `webpack: true` — nest CLI를 `WebpackCompiler` 분기로 진입.
- `webpackConfigPath` — 위 `webpack.config.js` 사용.
- `monorepo`, `root`, `projects`, 각 project의 `tsConfigPath`는 유지.

### `.swcrc` (Jest 전용)

**파일**: `.swcrc` (프로젝트 루트, 신규)

```json
{
  "$schema": "https://swc.rs/schema.json",
  "sourceMaps": true,
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "decorators": true,
      "dynamicImport": true
    },
    "transform": {
      "legacyDecorator": true,
      "decoratorMetadata": true,
      "useDefineForClassFields": false
    },
    "target": "es2021",
    "keepClassNames": true
  },
  "module": {
    "type": "commonjs"
  }
}
```

| 옵션 | 값 | 이유 |
|------|-----|------|
| `parser.decorators` | `true` | NestJS 데코레이터 파싱 |
| `transform.legacyDecorator` | `true` | TypeScript 5의 stage-3 데코레이터가 아닌 **legacy(experimental) 데코레이터** 사용. NestJS 11이 의존 |
| `transform.decoratorMetadata` | `true` | `reflect-metadata` 기반 DI/엔티티 메타데이터 보존 |
| `transform.useDefineForClassFields` | `false` | TypeScript의 기존 클래스 필드 시맨틱 유지 (NestJS DI에 필요) |
| `target` | `es2021` | nest CLI `swcDefaultsFactory`의 빌드 target과 일치시켜 빌드/테스트 동작 차이 최소화 |
| `keepClassNames` | `true` | 클래스 이름 기반 DI/로깅 안정성 |
| `module.type` | `commonjs` | Jest 기본 모듈 시스템 |

### Jest `transform` 변경

**파일**: `package.json` 루트 `jest` 블록

```diff
   "jest": {
     "transform": {
-      "^.+\\.(t|j)s$": "ts-jest"
+      "^.+\\.(t|j)s$": "@swc/jest"
     },
     ...
   }
```

**파일**: `test/service/jest-e2e.json`, `test/back-office/jest-e2e.json`

```diff
   "transform": {
-    "^.+\\.(t|j)s$": "ts-jest"
+    "^.+\\.(t|j)s$": "@swc/jest"
   },
```

`moduleNameMapper`, `globalSetup`, `globalTeardown`, `roots`, `testRegex`, `maxWorkers`는 변경 없음. `@swc/jest`는 같은 폴더의 `.swcrc`를 자동으로 발견.

## 패키지 변경

### 추가 (직접 devDeps)

```bash
pnpm add -D @swc/core @swc/jest swc-loader
```

| 패키지 | 용도 |
|--------|------|
| `@swc/core` | SWC 트랜스파일러 코어 (swc-loader / @swc/jest의 peer) |
| `swc-loader` | webpack 로더 |
| `@swc/jest` | Jest 트랜스폼 |

### 제거

```bash
pnpm remove ts-jest ts-loader
```

| 패키지 | 제거 사유 |
|--------|----------|
| `ts-jest` | `@swc/jest`가 대체 |
| `ts-loader` | nest webpack 기본 rule을 우리 webpack.config.js가 swc-loader로 교체하므로 더 이상 직접 의존하지 않음 |

### 추가하지 않는 것

`webpack`, `webpack-node-externals`, `tsconfig-paths-webpack-plugin`, `fork-ts-checker-webpack-plugin`은 **`@nestjs/cli`의 직접 dependency로 이미 설치**되어 있다. nest CLI 내부에서만 require하므로 사용자가 직접 deps에 추가할 필요 없음.

## 엔티티 호환성 — 순환 참조 + 데코레이터 메타데이터

TypeORM 엔티티가 `@OneToMany` / `@ManyToOne` 등으로 양방향 관계를 가지면 두 엔티티 파일 사이에 **순환 참조**가 생긴다 (예: `User` ↔ `Post`). tsc는 이를 무리 없이 처리하지만, SWC + `decoratorMetadata: true` 조합은 두 가지 문제를 일으킨다.

### 문제 1 — `Reflect.metadata('design:type', ClassRef)` TDZ

**증상**: 단위 테스트 또는 부팅 시 `ReferenceError: Cannot access 'User' before initialization`.

**원인**: SWC는 `decoratorMetadata: true`일 때 데코레이터가 붙은 프로퍼티의 타입을 `Reflect.metadata('design:type', User)`로 즉시 emit. 하지만 순환 참조 중인 모듈은 클래스 선언 직전에 평가되어 TDZ에 빠짐.

**해결**: TypeORM이 SWC 호환을 위해 제공하는 **`Relation<T>` 래퍼**를 사용. `Relation<T>`는 단순 타입 별칭(`type Relation<T> = T`)이지만, 제네릭으로 감싸진 타입은 데코레이터 메타데이터 emit 시 `Object`로 처리되어 클래스 참조를 우회한다.

```diff
  // libs/shared/src/entities/post.entity.ts
- @ManyToOne(() => User)
- user: User;
+ @ManyToOne(() => User)
+ user: Relation<User>;

  // libs/shared/src/entities/user.entity.ts
- @OneToMany(() => Post, (post) => post.user)
- posts: Post[];
+ @OneToMany(() => Post, (post) => post.user)
+ posts: Relation<Post[]>;
```

### 문제 2 — `TS1272: 데코레이터 시그니처의 타입은 import type 필수`

**증상**: `pnpm start:local`(watch 모드) 시 `ForkTsCheckerWebpackPlugin`이 `TS1272: A type referenced in a decorated signature must be imported with 'import type' or a namespace import when 'isolatedModules' and 'emitDecoratorMetadata' are enabled.`로 빌드 거부.

**원인**: `Relation`은 런타임 값이 없는 순수 타입 별칭. `tsconfig.json`이 `isolatedModules: true` + `emitDecoratorMetadata: true`일 때 TypeScript는 데코레이터 시그니처에 등장하는 **타입 전용** 심볼을 반드시 `import type`으로 들여오라고 요구.

**해결**: `Relation`을 `import type`으로 분리 (`User`/`Post`처럼 클래스인 값 import는 그대로 둠).

```diff
- import { Column, Entity, OneToMany, Relation } from 'typeorm';
+ import { Column, Entity, OneToMany } from 'typeorm';
+ import type { Relation } from 'typeorm';
```

### 적용 범위

본 프로젝트에서는 `libs/shared/src/entities/user.entity.ts`와 `post.entity.ts`만 해당. `Admin` 엔티티는 다른 엔티티와 관계가 없어 변경 불요. **새 엔티티가 양방향 관계를 가질 때마다 동일 패턴을 적용해야 한다**.

## 빌드 동작 비교

| 항목 | tsc (이전) | webpack + swc-loader (이후) |
|------|-----------|----------------------------|
| 트랜스파일러 | TypeScript 컴파일러 | SWC (Rust) |
| 타입 체크 | tsc가 동시 수행 | `ForkTsCheckerWebpackPlugin`이 별도 프로세스로 병행 |
| 출력 구조 | 모노레포 미러 트리 (`dist/apps/{name}/apps/{name}/src/main.js` 등) | 단일 번들 (`dist/apps/{name}/main.js`) |
| node_modules 처리 | 미번들 | `webpack-node-externals`로 외부화 (런타임에 require) |
| path alias | nest CLI tsc 빌더가 별칭을 상대 경로로 emit | `TsconfigPathsPlugin`이 컴파일 타임에 해결 |
| `__dirname` | 진짜 경로 유지 | nest 기본 `node: { __dirname: false }`로 진짜 경로 유지 |
| `start:*:prod` | `node dist/apps/{name}/main` | 동일 (출력 경로 호환) |

## 검증

### 자동 검증

작업 완료 후 프로젝트 표준 검증을 실행:

```bash
pnpm format
pnpm lint:check
pnpm build:all     # webpack + swc-loader 빌드. ForkTsChecker가 타입 체크 병행
pnpm test          # 단위 테스트 — @swc/jest
pnpm test:e2e      # service + back-office 통합 테스트 — Docker + Testcontainers
pnpm test:cov      # 커버리지 정상 수집
```

### 수동 검증 (DI 메타데이터 + path alias + `__dirname` 통합 검증)

```bash
NODE_ENV=local node dist/apps/service/main &
SERVICE_PID=$!
NODE_ENV=local node dist/apps/back-office/main &
BO_PID=$!
sleep 3
curl -i http://localhost:3000/health
curl -i http://localhost:3001/health
kill $SERVICE_PID $BO_PID
```

| 검증 항목 | 기대 결과 |
|-----------|----------|
| 두 앱 부팅 | DI 메타데이터/path alias/`__dirname` 모두 동작 |
| `GET /health` 200 OK | TypeORM `entityMetadatas` 정상 로드 (DB 헬스체크가 entity 의존) |
| 통합 테스트 통과 | controller → handler → repository → DB 플로우 SWC 트랜스파일된 코드로 통과 |
| `pnpm build:all` 타입 에러 시 실패 | `ForkTsCheckerWebpackPlugin` 동작 확인 |

### 성능 측정 (선택)

```bash
time pnpm build:all
time pnpm test
```

전환 전후 시간을 비교하여 효과를 정량화. CI 빌드 시간 절감 추정 자료로 활용.

## 트러블슈팅

### `ReferenceError: Cannot access 'User' before initialization` (또는 다른 엔티티명)

순환 참조된 엔티티에 `decoratorMetadata`가 즉시 `Reflect.metadata('design:type', ClassRef)`를 emit하면서 TDZ. 위 [엔티티 호환성 — 순환 참조 + 데코레이터 메타데이터](#엔티티-호환성--순환-참조--데코레이터-메타데이터) 참조. **해결**: 양방향 관계 필드 타입을 `Relation<T>`로 감싸기.

### `TS1272: A type referenced in a decorated signature must be imported with 'import type' ...`

`tsconfig.json`이 `isolatedModules: true` + `emitDecoratorMetadata: true`일 때 데코레이터 시그니처에 사용된 타입은 `import type` 필수. `Relation`이 대표적. **해결**: `import type { Relation } from 'typeorm'`로 분리. `User`/`Post` 같은 클래스(값 + 타입)는 `import type`으로 옮길 필요 없음. `pnpm build:all`(non-watch, `mode: 'none'`)에서는 ForkTsChecker가 비동기 모드라 통과해도, `pnpm start:local`(watch, `mode: 'development'`)에서는 차단된다는 점에 주의.

### `Cannot find module '@nestjs/cli/lib/compiler/defaults/swc-defaults'`

`@nestjs/cli`가 설치되지 않았거나 버전이 너무 낮음. `pnpm install`로 재설치하고 `@nestjs/cli@^11.0.16` 이상인지 확인.

### `decorator metadata` 관련 DI 오류 (`Nest can't resolve dependencies`)

`.swcrc`의 `transform.legacyDecorator: true` + `transform.decoratorMetadata: true`가 누락된 경우. 또는 빌드의 swc-loader 옵션이 `swcDefaultsFactory()` 결과가 아닌 직접 작성한 옵션이라면 동일 키 누락 의심.

### TypeORM이 entityMetadatas를 로드하지 못함

`libs/shared/src/database/typeorm.config.ts`의 `migrations: [__dirname + '/../migrations/*{.ts,.js}']` 경로가 빌드 후에 깨진 경우. nest 기본 `node: { __dirname: false }`가 사용자 webpack.config의 spread 머지로 보존되는지 확인.

```javascript
// 잘못된 패턴 — node 기본값을 통째로 덮어씀
return {
  ...options,
  node: { __dirname: 'mock' },  // ❌ 절대 금지
};

// 올바른 패턴 — node 키 자체를 두지 않음 (nest 기본값 보존)
return {
  ...options,
  module: { ...options.module, rules: [...] },
};
```

### Swagger UI에서 `Cannot find module 'class-transformer/storage'`

nest 기본 `IgnorePlugin`이 사용자 webpack.config에서 보존되지 않은 경우. `plugins`를 사용자 config에서 새로 정의하지 말고, 정의가 필요하면 `[...options.plugins, myPlugin]` 형태로 spread.

### `pnpm test`에서 `Unexpected token` (데코레이터)

`.swcrc`가 Jest에 의해 발견되지 않음. 루트(`package.json`과 동일 디렉토리)에 위치하는지 확인. 또는 inline 옵션 형태로 명시:

```json
"transform": {
  "^.+\\.(t|j)s$": ["@swc/jest", { /* .swcrc 내용과 동일 */ }]
}
```

### webpack 빌드가 `.swcrc`를 읽음

빌드 swc-loader 옵션에 `swcrc: false`가 누락된 경우. `webpack.config.js`의 `swcOptions`가 `{ ...baseSwcOptions, swcrc: false }`인지 확인.

### 빌드는 통과하지만 타입 에러가 잡히지 않음

`ForkTsCheckerWebpackPlugin`이 비활성화된 경우. nest 기본값은 nest 플러그인이 등록되지 않았을 때만 ForkTsChecker를 추가한다 (`webpack-defaults.js:87-95`). 사용자 webpack.config의 spread 머지로 자동 보존되어야 함. 빌드 출력에 `ts-checker` 관련 메시지가 보이지 않으면 `options.plugins` 머지 누락 의심.

## 적용하지 않은 것 (Out of Scope)

- **마이그레이션 CLI의 SWC 전환**. `ts-node/register` → `@swc-node/register` 교체는 운영 영향이 큰 별도 작업으로 분리.
- **HMR (Hot Module Replacement)**. `nest start --watch`는 webpack watch 모드로 충분히 빠르게 동작. 필요 시 NestJS 공식 [hot-reload 레시피](https://docs.nestjs.com/recipes/hot-reload)를 따라 `webpack-hmr.config.js`를 별도 추가.
- **`assets` / `watchAssets`**. 현재 정적 자산 의존이 없으므로 미설정.
- **별도 `tsc --noEmit` CI 단계**. nest 기본 `ForkTsCheckerWebpackPlugin`이 빌드 시 타입 체크를 병행하므로 불필요.
- **SWC `paths` (jsc.baseUrl/paths)**. 빌드는 `TsconfigPathsPlugin`(nest 기본), Jest는 `moduleNameMapper`로 별칭을 해결. SWC 자체 별칭 해석을 추가하면 단일 진실 원천이 분산되므로 의도적으로 회피.

## 참고

- [NestJS Recipes — SWC](https://docs.nestjs.com/recipes/swc)
- [NestJS CLI — Workspaces (Monorepo)](https://docs.nestjs.com/cli/monorepo)
- [SWC 공식 문서](https://swc.rs/docs/configuration/swcrc)
- [@swc/jest README](https://github.com/swc-project/jest)
- [swc-loader README](https://github.com/swc-project/pkgs/tree/main/packages/swc-loader)
- [tsconfig-paths-webpack-plugin](https://github.com/dividab/tsconfig-paths-webpack-plugin)
