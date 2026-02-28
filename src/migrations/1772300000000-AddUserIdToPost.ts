import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

export class AddUserIdToPost1772300000000 implements MigrationInterface {
  name = 'AddUserIdToPost1772300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 기존 posts 데이터 삭제 (FK 제약 충족을 위해)
    await queryRunner.query('DELETE FROM "posts"');

    // userId 컬럼 추가
    await queryRunner.addColumn(
      'posts',
      new TableColumn({
        name: 'userId',
        type: 'int',
        isNullable: false,
      }),
    );

    // userId → users.id FK 제약 추가
    await queryRunner.createForeignKey(
      'posts',
      new TableForeignKey({
        name: 'FK_posts_userId',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 기존 title 단독 unique 제약 삭제
    await queryRunner.dropUniqueConstraint('posts', 'UQ_posts_title');

    // (userId, title) 복합 unique 제약 추가
    await queryRunner.createUniqueConstraint(
      'posts',
      new TableUnique({
        name: 'UQ_posts_userId_title',
        columnNames: ['userId', 'title'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 복합 unique 제약 삭제
    await queryRunner.dropUniqueConstraint('posts', 'UQ_posts_userId_title');

    // title 단독 unique 제약 복원
    await queryRunner.createUniqueConstraint(
      'posts',
      new TableUnique({
        name: 'UQ_posts_title',
        columnNames: ['title'],
      }),
    );

    // FK 제약 삭제
    await queryRunner.dropForeignKey('posts', 'FK_posts_userId');

    // userId 컬럼 삭제
    await queryRunner.dropColumn('posts', 'userId');
  }
}
