import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMarketingConsentToUser1779528943000 implements MigrationInterface {
  name = 'AddMarketingConsentToUser1779528943000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "marketing_consent" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "marketing_consent"`,
    );
  }
}
