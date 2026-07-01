import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "categories" ADD COLUMN "seo_meta_title" varchar;
  ALTER TABLE "categories" ADD COLUMN "seo_meta_description" varchar;
  ALTER TABLE "categories" ADD COLUMN "seo_og_image_id" integer;
  ALTER TABLE "categories" ADD COLUMN "seo_canonical_u_r_l" varchar;
  ALTER TABLE "categories" ADD COLUMN "seo_no_index" boolean DEFAULT false;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_seo_og_image_id_media_id_fk" FOREIGN KEY ("seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "categories_seo_seo_og_image_idx" ON "categories" USING btree ("seo_og_image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "categories" DROP CONSTRAINT "categories_seo_og_image_id_media_id_fk";
  
  DROP INDEX "categories_seo_seo_og_image_idx";
  ALTER TABLE "categories" DROP COLUMN "seo_meta_title";
  ALTER TABLE "categories" DROP COLUMN "seo_meta_description";
  ALTER TABLE "categories" DROP COLUMN "seo_og_image_id";
  ALTER TABLE "categories" DROP COLUMN "seo_canonical_u_r_l";
  ALTER TABLE "categories" DROP COLUMN "seo_no_index";`)
}
