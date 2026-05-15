---
name: patterns-snake-naming-strategy
description: 엔티티는 camelCase 프로퍼티만 선언하면 DB 컬럼이 자동 snake_case로 변환된다
metadata:
  type: feedback
---

엔티티 정의 시 `@Column({ name: '...' })` 같은 수동 컬럼명을 지정하지 않는다. `typeorm-naming-strategies`의 `SnakeNamingStrategy`가 `DataSourceOptions.namingStrategy`로 적용되어 있어 camelCase 프로퍼티가 자동으로 snake_case DB 컬럼으로 매핑된다.

**Why:** `@Column({ name: 'snake_case_col' })` 같은 수동 명명은 strategy와 중복되어 우회 효과를 만든다. 다음 번 `migration:generate` 시 strategy가 기대하는 컬럼명과 어긋나 불필요한 ALTER COLUMN 마이그레이션이 생성되거나, 두 군데(엔티티 + strategy)가 다른 명명을 시도해 회귀 위험이 커진다.

**How to apply:**
- 새 컬럼 추가 시 `@Column({ ... 다른 옵션만 ... })` 형태로 두고 프로퍼티명만 camelCase로 선언한다.
- `@JoinColumn`에도 `name` 인자를 붙이지 않는다 — 하드코딩하면 strategy를 우회해 camelCase 컬럼이 생성된다. 인자 없이 `@JoinColumn()`만 사용.
- 매핑 예: `createdAt` → `created_at`, `userId` → `user_id`, `hashedRefreshToken` → `hashed_refresh_token`.
- 참고: `libs/shared/src/database/typeorm.config.ts`에서 전략이 적용된 위치를 확인할 수 있다.

관련: [[feedback-nullable-varchar-type]] — nullable 컬럼에서 `type: 'varchar'` 명시도 함께 챙긴다.
