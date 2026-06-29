import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "homepage_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"category_id" integer NOT NULL,
  	"title_override" varchar,
  	"limit" numeric DEFAULT 4
  );
  
  CREATE TABLE "homepage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "homepage_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer
  );
  
  CREATE TABLE "main_menu_items_children" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"category_id" integer,
  	"url" varchar
  );
  
  CREATE TABLE "main_menu_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"category_id" integer,
  	"url" varchar
  );
  
  CREATE TABLE "main_menu" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "_posts_v" ADD COLUMN "autosave" boolean;
  ALTER TABLE "_pages_v" ADD COLUMN "autosave" boolean;
  ALTER TABLE "homepage_sections" ADD CONSTRAINT "homepage_sections_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_sections" ADD CONSTRAINT "homepage_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "main_menu_items_children" ADD CONSTRAINT "main_menu_items_children_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "main_menu_items_children" ADD CONSTRAINT "main_menu_items_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."main_menu_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "main_menu_items" ADD CONSTRAINT "main_menu_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "main_menu_items" ADD CONSTRAINT "main_menu_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."main_menu"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_sections_order_idx" ON "homepage_sections" USING btree ("_order");
  CREATE INDEX "homepage_sections_parent_id_idx" ON "homepage_sections" USING btree ("_parent_id");
  CREATE INDEX "homepage_sections_category_idx" ON "homepage_sections" USING btree ("category_id");
  CREATE INDEX "homepage_rels_order_idx" ON "homepage_rels" USING btree ("order");
  CREATE INDEX "homepage_rels_parent_idx" ON "homepage_rels" USING btree ("parent_id");
  CREATE INDEX "homepage_rels_path_idx" ON "homepage_rels" USING btree ("path");
  CREATE INDEX "homepage_rels_posts_id_idx" ON "homepage_rels" USING btree ("posts_id");
  CREATE INDEX "main_menu_items_children_order_idx" ON "main_menu_items_children" USING btree ("_order");
  CREATE INDEX "main_menu_items_children_parent_id_idx" ON "main_menu_items_children" USING btree ("_parent_id");
  CREATE INDEX "main_menu_items_children_category_idx" ON "main_menu_items_children" USING btree ("category_id");
  CREATE INDEX "main_menu_items_order_idx" ON "main_menu_items" USING btree ("_order");
  CREATE INDEX "main_menu_items_parent_id_idx" ON "main_menu_items" USING btree ("_parent_id");
  CREATE INDEX "main_menu_items_category_idx" ON "main_menu_items" USING btree ("category_id");
  CREATE INDEX "_posts_v_autosave_idx" ON "_posts_v" USING btree ("autosave");
  CREATE INDEX "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "main_menu_items_children" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "main_menu_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "main_menu" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "homepage_sections" CASCADE;
  DROP TABLE "homepage" CASCADE;
  DROP TABLE "homepage_rels" CASCADE;
  DROP TABLE "main_menu_items_children" CASCADE;
  DROP TABLE "main_menu_items" CASCADE;
  DROP TABLE "main_menu" CASCADE;
  DROP INDEX "_posts_v_autosave_idx";
  DROP INDEX "_pages_v_autosave_idx";
  ALTER TABLE "_posts_v" DROP COLUMN "autosave";
  ALTER TABLE "_pages_v" DROP COLUMN "autosave";`)
}
