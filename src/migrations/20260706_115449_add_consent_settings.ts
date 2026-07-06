import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" ADD COLUMN "consent_enabled" boolean DEFAULT true;
  ALTER TABLE "site_settings" ADD COLUMN "privacy_policy_url" varchar DEFAULT '/privacy';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP COLUMN "consent_enabled";
  ALTER TABLE "site_settings" DROP COLUMN "privacy_policy_url";`)
}
