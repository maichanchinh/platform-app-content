import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE media ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    UPDATE media SET deleted_at = now() WHERE hidden = true AND deleted_at IS NULL;
    ALTER TABLE media DROP COLUMN IF EXISTS hidden;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE media ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
    UPDATE media SET hidden = true WHERE deleted_at IS NOT NULL;
    ALTER TABLE media DROP COLUMN IF EXISTS deleted_at;
  `)
}
