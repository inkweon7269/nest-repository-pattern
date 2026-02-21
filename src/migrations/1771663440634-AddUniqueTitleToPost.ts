import { MigrationInterface, QueryRunner, TableUnique } from 'typeorm';

export class AddUniqueTitleToPost1771663440634 implements MigrationInterface {
  name = 'AddUniqueTitleToPost1771663440634';

  private readonly uniqueConstraint = new TableUnique({
    name: 'UQ_posts_title',
    columnNames: ['title'],
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createUniqueConstraint('posts', this.uniqueConstraint);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropUniqueConstraint('posts', this.uniqueConstraint);
  }
}
