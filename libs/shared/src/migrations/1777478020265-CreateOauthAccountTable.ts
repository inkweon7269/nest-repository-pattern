import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOauthAccountTable1777478020265 implements MigrationInterface {
  name = 'CreateOauthAccountTable1777478020265';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "oauth_accounts" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" integer NOT NULL, "provider" character varying(20) NOT NULL, "provider_id" character varying(255) NOT NULL, "provider_email" character varying(255) NOT NULL, "email_verified" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_710a81523f515b78f894e33bb10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_oauth_user_provider" ON "oauth_accounts" ("user_id", "provider") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_oauth_provider_provider_id" ON "oauth_accounts" ("provider", "provider_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_accounts" ADD CONSTRAINT "FK_22a05e92f51a983475f9281d3b0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "oauth_accounts" DROP CONSTRAINT "FK_22a05e92f51a983475f9281d3b0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_oauth_provider_provider_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_oauth_user_provider"`);
    await queryRunner.query(`DROP TABLE "oauth_accounts"`);
  }
}
