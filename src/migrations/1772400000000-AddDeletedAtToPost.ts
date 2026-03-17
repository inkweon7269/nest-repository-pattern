import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDeletedAtToPost1772400000000 implements MigrationInterface {
  name = 'AddDeletedAtToPost1772400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // deletedAt 컬럼 추가
    await queryRunner.addColumn(
      'posts',
      new TableColumn({
        name: 'deletedAt',
        type: 'timestamp',
        isNullable: true,
        default: null,
      }),
    );

    // 기존 (userId, title) 복합 unique 제약 삭제
    await queryRunner.dropUniqueConstraint('posts', 'UQ_posts_userId_title');

    // deletedAt IS NULL인 행만 대상으로 하는 partial unique index 생성
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_posts_userId_title" ON "posts" ("userId", "title") WHERE "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // partial unique index 삭제
    await queryRunner.query(`DROP INDEX "UQ_posts_userId_title"`);

    // full unique 복원을 위해 soft-deleted 데이터 정리
    await queryRunner.query(
      `DELETE FROM "posts" WHERE "deletedAt" IS NOT NULL`,
    );

    // (userId, title) 복합 unique 제약 복원
    await queryRunner.query(
      `ALTER TABLE "posts" ADD CONSTRAINT "UQ_posts_userId_title" UNIQUE ("userId", "title")`,
    );

    // deletedAt 컬럼 삭제
    await queryRunner.dropColumn('posts', 'deletedAt');
  }
}
