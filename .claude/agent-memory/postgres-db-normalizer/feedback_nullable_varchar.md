---
name: feedback-nullable-varchar-type
description: TypeORM nullable string column requires explicit type:'varchar' to avoid Object inference error
metadata:
  type: feedback
---

TypeScript `string | null` union type을 가진 컬럼에는 반드시 `type: 'varchar'`를 명시해야 한다.

**Why:** TypeORM + ts-node 환경에서 `@Column({ nullable: true })` 만 선언하면 TypeORM이 TypeScript 리플렉션으로 타입을 추론할 때 `string | null` union을 "Object"로 읽어 `DataTypeNotSupportedError` 발생. `migration:generate` 실패.

**How to apply:** nullable 컬럼 선언 시 항상 `type: 'varchar'`(또는 적절한 DB 타입) 명시.

```typescript
// ❌ 잘못된 예
@Column({ length: 30, unique: true, nullable: true })
nickname: string | null;

// ✅ 올바른 예
@Column({ type: 'varchar', length: 30, unique: true, nullable: true })
nickname: string | null;
```

기존 패턴 참고: `hashedRefreshToken: string | null` → `@Column({ type: 'varchar', length: 255, nullable: true })`
