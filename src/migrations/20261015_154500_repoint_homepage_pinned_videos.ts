import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Repoints the homepage video band's `pinnedVideos` relationship from the retired `videos`
 * collection to `youtube-videos`, which is what the band now renders.
 *
 * SAFE BECAUSE IT MOVES NO DATA: `select count(*) from homepage_rels where videos_id is not
 * null` was 0 before this ran. The old column is therefore dropped rather than migrated —
 * there is nothing in it, and leaving a dangling foreign key to a retired collection is how
 * the dead field came about in the first place.
 *
 * Written by hand rather than generated. `payload migrate:create` prompts for an
 * interactive data-loss confirmation when it sees a dropped relationship column (the
 * `--force-accept-warning` flag bypasses the prompt, but it would also have swept in the
 * unrelated `enum_ads_placement` drift described in 20261015_153517_add_youtube_videos.ts).
 * The statements below are the ones it generates, and the matching `.json` schema snapshot
 * beside this file was derived from the previous one so that the NEXT `migrate:create`
 * diffs from the real post-migration state. That was verified: a probe run afterwards
 * emitted only the pre-existing ads drift and nothing about `youtube_videos` or
 * `homepage_rels`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_rels" ADD COLUMN "youtube_videos_id" integer;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_youtube_videos_fk" FOREIGN KEY ("youtube_videos_id") REFERENCES "public"."youtube_videos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_rels_youtube_videos_id_idx" ON "homepage_rels" USING btree ("youtube_videos_id");
  ALTER TABLE "homepage_rels" DROP CONSTRAINT IF EXISTS "homepage_rels_videos_fk";
  DROP INDEX IF EXISTS "homepage_rels_videos_id_idx";
  ALTER TABLE "homepage_rels" DROP COLUMN IF EXISTS "videos_id";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_rels" ADD COLUMN "videos_id" integer;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_rels_videos_id_idx" ON "homepage_rels" USING btree ("videos_id");
  ALTER TABLE "homepage_rels" DROP CONSTRAINT IF EXISTS "homepage_rels_youtube_videos_fk";
  DROP INDEX IF EXISTS "homepage_rels_youtube_videos_id_idx";
  ALTER TABLE "homepage_rels" DROP COLUMN IF EXISTS "youtube_videos_id";`)
}
