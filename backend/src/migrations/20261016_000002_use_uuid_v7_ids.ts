import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

const idTables = [
  'media',
  'users',
  'payload_kv',
  'payload_locked_documents',
  'payload_locked_documents_rels',
  'payload_migrations',
  'payload_preferences',
  'payload_preferences_rels',
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TEMP TABLE payload_uuid_v7_id_map (
      table_name text NOT NULL,
      old_id text NOT NULL,
      new_id uuid NOT NULL DEFAULT uuidv7(),
      PRIMARY KEY (table_name, old_id)
    ) ON COMMIT DROP
  `)

  for (const table of idTables) {
    await db.execute(
      sql.raw(
        `INSERT INTO payload_uuid_v7_id_map (table_name, old_id) SELECT '${table}', id::text FROM "${table}"`,
      ),
    )
  }

  await db.execute(sql`
    DO $block$
    DECLARE constraint_row record;
    BEGIN
      FOR constraint_row IN
        SELECT conrelid::regclass AS table_name, conname
        FROM pg_constraint
        WHERE contype IN ('f', 'p')
          AND connamespace = current_schema()::regnamespace
          AND conrelid::regclass::text IN (
            'media', 'users', 'payload_kv', 'payload_locked_documents',
            'payload_locked_documents_rels', 'payload_migrations',
            'payload_preferences', 'payload_preferences_rels', 'users_sessions'
          )
          AND (contype = 'f' OR conrelid::regclass::text <> 'users_sessions')
        ORDER BY CASE contype WHEN 'f' THEN 0 ELSE 1 END
      LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.table_name, constraint_row.conname);
      END LOOP;
    END;
    $block$
  `)

  for (const [table, column, referencedTable] of [
    ['payload_locked_documents_rels', 'parent_id', 'payload_locked_documents'],
    ['payload_locked_documents_rels', 'users_id', 'users'],
    ['payload_locked_documents_rels', 'media_id', 'media'],
    ['payload_preferences_rels', 'parent_id', 'payload_preferences'],
    ['payload_preferences_rels', 'users_id', 'users'],
    ['users_sessions', '_parent_id', 'users'],
  ]) {
    await db.execute(
      sql.raw(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE text USING "${column}"::text`),
    )
    await db.execute(sql.raw(`
      UPDATE "${table}" AS source
      SET "${column}" = id_map.new_id::text
      FROM payload_uuid_v7_id_map AS id_map
      WHERE id_map.table_name = '${referencedTable}'
        AND id_map.old_id = source."${column}"
    `))
    await db.execute(
      sql.raw(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE uuid USING "${column}"::uuid`),
    )
  }

  for (const table of idTables) {
    await db.execute(sql.raw(`ALTER TABLE "${table}" ADD COLUMN id_uuid uuid`))
    await db.execute(sql.raw(`
      UPDATE "${table}" AS source
      SET id_uuid = id_map.new_id
      FROM payload_uuid_v7_id_map AS id_map
      WHERE id_map.table_name = '${table}' AND id_map.old_id = source.id::text
    `))
    await db.execute(sql.raw(`ALTER TABLE "${table}" DROP COLUMN id`))
    await db.execute(sql.raw(`ALTER TABLE "${table}" RENAME COLUMN id_uuid TO id`))
    await db.execute(sql.raw(`ALTER TABLE "${table}" ALTER COLUMN id SET NOT NULL`))
    await db.execute(sql.raw(`ALTER TABLE "${table}" ALTER COLUMN id SET DEFAULT uuidv7()`))
    await db.execute(sql.raw(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_pkey" PRIMARY KEY (id)`))
  }

  await db.execute(sql`
    ALTER TABLE payload_locked_documents_rels
      ADD CONSTRAINT payload_locked_documents_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES payload_locked_documents(id) ON DELETE CASCADE,
      ADD CONSTRAINT payload_locked_documents_rels_users_fk FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE,
      ADD CONSTRAINT payload_locked_documents_rels_media_fk FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  `)
  await db.execute(sql`
    ALTER TABLE payload_preferences_rels
      ADD CONSTRAINT payload_preferences_rels_parent_fk FOREIGN KEY (parent_id) REFERENCES payload_preferences(id) ON DELETE CASCADE,
      ADD CONSTRAINT payload_preferences_rels_users_fk FOREIGN KEY (users_id) REFERENCES users(id) ON DELETE CASCADE
  `)
  await db.execute(sql`
    ALTER TABLE users_sessions
      ADD CONSTRAINT users_sessions_parent_id_fk FOREIGN KEY (_parent_id) REFERENCES users(id) ON DELETE CASCADE
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $block$
    BEGIN
      RAISE EXCEPTION 'UUID v7 IDs cannot be downgraded without an archived ID mapping.';
    END;
    $block$
  `)
}
