import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTagAndPostTagTables1779529302473 implements MigrationInterface {
  name = 'CreateTagAndPostTagTables1779529302473';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tags" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" integer NOT NULL, "name" character varying(50) NOT NULL, CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_tags_user_id_name" ON "tags" ("user_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "post_tags" ("posts_id" integer NOT NULL, "tags_id" integer NOT NULL, CONSTRAINT "PK_297a2aa2d29337748de4b075e55" PRIMARY KEY ("posts_id", "tags_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_493a35163a3681947bc2519f7c" ON "post_tags" ("posts_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0e926b96ace9d137603da0a102" ON "post_tags" ("tags_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tags" ADD CONSTRAINT "FK_74603743868d1e4f4fc2c0225b6" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_tags" ADD CONSTRAINT "FK_493a35163a3681947bc2519f7c5" FOREIGN KEY ("posts_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_tags" ADD CONSTRAINT "FK_0e926b96ace9d137603da0a1025" FOREIGN KEY ("tags_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "post_tags" DROP CONSTRAINT "FK_0e926b96ace9d137603da0a1025"`,
    );
    await queryRunner.query(
      `ALTER TABLE "post_tags" DROP CONSTRAINT "FK_493a35163a3681947bc2519f7c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tags" DROP CONSTRAINT "FK_74603743868d1e4f4fc2c0225b6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0e926b96ace9d137603da0a102"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_493a35163a3681947bc2519f7c"`,
    );
    await queryRunner.query(`DROP TABLE "post_tags"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_tags_user_id_name"`);
    await queryRunner.query(`DROP TABLE "tags"`);
  }
}
