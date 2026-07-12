import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "legacy_wp_id" numeric;
  ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_wp_id" numeric;
  CREATE UNIQUE INDEX "posts_legacy_wp_id_idx" ON "posts" USING btree ("legacy_wp_id");
  CREATE INDEX "_posts_v_version_version_legacy_wp_id_idx" ON "_posts_v" USING btree ("version_legacy_wp_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "posts_legacy_wp_id_idx";
  DROP INDEX "_posts_v_version_version_legacy_wp_id_idx";
  ALTER TABLE "posts" DROP COLUMN "legacy_wp_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_legacy_wp_id";`)
}
