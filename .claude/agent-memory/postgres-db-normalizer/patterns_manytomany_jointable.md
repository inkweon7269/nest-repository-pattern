---
name: patterns-manytomany-jointable
description: M:N @JoinTable 인버스 FK는 onDelete를 데코레이터로 못 박으므로 마이그레이션+synchronize:false 조합으로 CASCADE 유지
metadata:
  type: feedback
---

이 프로젝트에서 M:N 관계(`@ManyToMany` + `@JoinTable`)를 추가할 때 정션 테이블 FK의 `ON DELETE CASCADE`를 양쪽에 보장하려면 주의가 필요하다.

**Why:**
- `@JoinTable`은 정션 테이블 두 FK 중 **owning 쪽(`@JoinTable`이 달린 엔티티의 컬럼, 예: `posts_id`)만** `ON DELETE CASCADE`로 생성한다. **inverse 쪽 FK(예: `tags_id`)는 항상 `ON DELETE NO ACTION`** 으로 굳어지며, TypeORM 데코레이터로 이 동작을 바꿀 방법이 없다(`@JoinTable`에 per-FK onDelete 옵션 없음 — context7 TypeORM 문서 확인).
- inverse FK가 NO ACTION이면, hard-delete 대상 엔티티(soft-delete 없는 Tag 등)를 삭제할 때 정션 행이 남아 FK 위반으로 삭제 실패.
- 마이그레이션에서 inverse FK를 CASCADE로 수정하면, 다음 `migration:generate`가 엔티티 메타데이터(NO ACTION 기대)와 DB(CASCADE) 차이를 감지해 **DROP+ADD로 NO ACTION 되돌리는 회귀 마이그레이션을 생성**한다 (CLAUDE.md "DB 제약은 엔티티에 선언" 규칙과 충돌).

**How to apply:**
- 정션 테이블의 inverse FK까지 CASCADE가 필요하면:
  1. 마이그레이션에서 inverse FK를 `ON DELETE CASCADE ON UPDATE CASCADE`로 직접 작성(생성된 NO ACTION을 손으로 교체).
  2. owning 엔티티의 `@JoinTable`에 `synchronize: false`를 추가 → TypeORM이 정션 테이블을 diff 검사에서 제외하여 회귀 마이그레이션 생성 안 됨. 마이그레이션이 정션 테이블의 단일 진실 원천이 됨.
  3. `migration:generate ... --dr`로 "No changes in database schema" 확인하여 회귀 없음 검증.
- 정션 컬럼 명명: SnakeNamingStrategy의 정션 컬럼명은 `<참조테이블명>_id` 형태 → `posts` + `id` = **`posts_id`**, `tags` + `id` = **`tags_id`** (단수형 `post_id`/`tag_id` 아님). `@JoinTable({ name: 'post_tags' })`처럼 테이블명만 지정하고 joinColumn/inverseJoinColumn name 인자는 주지 않는다.
- 검증: 마이그레이션 적용 후 `migration:revert`로 down()이 up()을 완전히 역순(FK→인덱스→테이블) 복구하는지 실DB에서 확인.

관련: [[patterns-snake-naming-strategy]]
