import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_featured_type" AS ENUM('image', 'video');
  CREATE TYPE "public"."enum__posts_v_version_featured_type" AS ENUM('image', 'video');
  ALTER TABLE "posts" ADD COLUMN "featured_type" "enum_posts_featured_type" DEFAULT 'image';
  ALTER TABLE "posts" ADD COLUMN "featured_video_url" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_featured_type" "enum__posts_v_version_featured_type" DEFAULT 'image';
  ALTER TABLE "_posts_v" ADD COLUMN "version_featured_video_url" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "featured_type";
  ALTER TABLE "posts" DROP COLUMN "featured_video_url";
  ALTER TABLE "_posts_v" DROP COLUMN "version_featured_type";
  ALTER TABLE "_posts_v" DROP COLUMN "version_featured_video_url";
  DROP TYPE "public"."enum_posts_featured_type";
  DROP TYPE "public"."enum__posts_v_version_featured_type";`)
}
