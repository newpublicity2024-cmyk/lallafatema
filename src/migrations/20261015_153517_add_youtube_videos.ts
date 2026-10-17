import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds the `youtube_videos` table that the `/sync-youtube` cron mirrors the Lalla Fatema
 * channel into.
 *
 * The unique index on `video_id` is load-bearing, not hygiene: it is the upsert key, and
 * without it a cron running every half hour would duplicate the whole band on every tick.
 *
 * WHAT WAS DELIBERATELY REMOVED FROM THE GENERATED OUTPUT. `payload migrate:create`
 * diffs the database against the whole config, so it also emitted a rebuild of
 * `enum_ads_placement` — dropping the `sidebar` and `popup` values that exist in the
 * production enum but no longer appear in `src/collections/Ads.ts`. That is real drift
 * from an earlier, unmigrated change to the Ads collection, and it is unrelated to this
 * one. Dropping enum values from a live database as a side effect of adding a video table
 * is not a trade worth making silently, so those statements were taken out by hand and the
 * drift was reported to the owner instead. This migration therefore creates a table and
 * nothing else.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "youtube_videos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"thumbnail_url" varchar NOT NULL,
  	"is_short" boolean DEFAULT false,
  	"hidden" boolean DEFAULT false,
  	"duration_seconds" numeric,
  	"views" numeric,
  	"channel_id" varchar NOT NULL,
  	"synced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "youtube_videos_id" integer;
  CREATE UNIQUE INDEX "youtube_videos_video_id_idx" ON "youtube_videos" USING btree ("video_id");
  CREATE INDEX "youtube_videos_published_at_idx" ON "youtube_videos" USING btree ("published_at");
  CREATE INDEX "youtube_videos_is_short_idx" ON "youtube_videos" USING btree ("is_short");
  CREATE INDEX "youtube_videos_hidden_idx" ON "youtube_videos" USING btree ("hidden");
  CREATE INDEX "youtube_videos_channel_id_idx" ON "youtube_videos" USING btree ("channel_id");
  CREATE INDEX "youtube_videos_updated_at_idx" ON "youtube_videos" USING btree ("updated_at");
  CREATE INDEX "youtube_videos_created_at_idx" ON "youtube_videos" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_youtube_videos_fk" FOREIGN KEY ("youtube_videos_id") REFERENCES "public"."youtube_videos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_youtube_videos_id_idx" ON "payload_locked_documents_rels" USING btree ("youtube_videos_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_youtube_videos_fk";

  DROP INDEX "payload_locked_documents_rels_youtube_videos_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "youtube_videos_id";
  ALTER TABLE "youtube_videos" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "youtube_videos" CASCADE;`)
}
