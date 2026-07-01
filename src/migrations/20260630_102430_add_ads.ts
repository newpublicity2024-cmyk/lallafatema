import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ads_placement" AS ENUM('header', 'sidebar', 'in-article', 'between-sections', 'footer', 'popup');
  CREATE TYPE "public"."enum_ads_format" AS ENUM('image', 'script');
  CREATE TABLE "ads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"placement" "enum_ads_placement" NOT NULL,
  	"format" "enum_ads_format" DEFAULT 'image' NOT NULL,
  	"image_id" integer,
  	"target_url" varchar,
  	"alt" varchar,
  	"new_tab" boolean DEFAULT true,
  	"body_script" varchar,
  	"head_script" varchar,
  	"active" boolean DEFAULT true,
  	"priority" numeric DEFAULT 0,
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ads_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "ads_id" integer;
  ALTER TABLE "ads" ADD CONSTRAINT "ads_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "ads_rels" ADD CONSTRAINT "ads_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ads_rels" ADD CONSTRAINT "ads_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "ads_image_idx" ON "ads" USING btree ("image_id");
  CREATE INDEX "ads_updated_at_idx" ON "ads" USING btree ("updated_at");
  CREATE INDEX "ads_created_at_idx" ON "ads" USING btree ("created_at");
  CREATE INDEX "ads_rels_order_idx" ON "ads_rels" USING btree ("order");
  CREATE INDEX "ads_rels_parent_idx" ON "ads_rels" USING btree ("parent_id");
  CREATE INDEX "ads_rels_path_idx" ON "ads_rels" USING btree ("path");
  CREATE INDEX "ads_rels_categories_id_idx" ON "ads_rels" USING btree ("categories_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_ads_fk" FOREIGN KEY ("ads_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_ads_id_idx" ON "payload_locked_documents_rels" USING btree ("ads_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ads" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ads_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "ads" CASCADE;
  DROP TABLE "ads_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_ads_fk";
  
  DROP INDEX "payload_locked_documents_rels_ads_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "ads_id";
  DROP TYPE "public"."enum_ads_placement";
  DROP TYPE "public"."enum_ads_format";`)
}
