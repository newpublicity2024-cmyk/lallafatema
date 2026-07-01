import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage" ADD COLUMN "featured_category_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "video_band_enabled" boolean DEFAULT true;
  ALTER TABLE "homepage" ADD COLUMN "ads_between_sections" boolean DEFAULT true;
  ALTER TABLE "homepage_rels" ADD COLUMN "videos_id" integer;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_featured_category_id_categories_id_fk" FOREIGN KEY ("featured_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_featured_category_idx" ON "homepage" USING btree ("featured_category_id");
  CREATE INDEX "homepage_rels_videos_id_idx" ON "homepage_rels" USING btree ("videos_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage" DROP CONSTRAINT "homepage_featured_category_id_categories_id_fk";
  
  ALTER TABLE "homepage_rels" DROP CONSTRAINT "homepage_rels_videos_fk";
  
  DROP INDEX "homepage_featured_category_idx";
  DROP INDEX "homepage_rels_videos_id_idx";
  ALTER TABLE "homepage" DROP COLUMN "featured_category_id";
  ALTER TABLE "homepage" DROP COLUMN "video_band_enabled";
  ALTER TABLE "homepage" DROP COLUMN "ads_between_sections";
  ALTER TABLE "homepage_rels" DROP COLUMN "videos_id";`)
}
