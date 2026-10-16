import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION payload_json_references_media(value jsonb, media_id text)
    RETURNS boolean
    LANGUAGE plpgsql
    IMMUTABLE
    AS $function$
    DECLARE
      item jsonb;
      key text;
      child jsonb;
    BEGIN
      IF jsonb_typeof(value) = 'array' THEN
        FOR item IN SELECT jsonb_array_elements(value) LOOP
          IF payload_json_references_media(item, media_id) THEN
            RETURN true;
          END IF;
        END LOOP;
      ELSIF jsonb_typeof(value) = 'object' THEN
        IF value->>'type' = 'upload'
          AND value->>'relationTo' = 'media'
          AND COALESCE(value->'value'->>'id', value->'value' #>> '{}') = media_id THEN
          RETURN true;
        END IF;

        IF (value->>'relationTo' = 'media' OR value->>'relation_to' = 'media')
          AND COALESCE(value->'value'->>'id', value->'value' #>> '{}') = media_id THEN
          RETURN true;
        END IF;

        FOR key, child IN SELECT entry.key, entry.value FROM jsonb_each(value) AS entry LOOP
          IF (key = 'media_id' OR key LIKE '%_media_id')
            AND jsonb_typeof(child) IN ('number', 'string')
            AND child #>> '{}' = media_id THEN
            RETURN true;
          END IF;

          IF payload_json_references_media(child, media_id) THEN
            RETURN true;
          END IF;
        END LOOP;
      END IF;

      RETURN false;
    END;
    $function$
  `)

  await db.execute(sql`
    CREATE OR REPLACE FUNCTION payload_json_references_missing_media(value jsonb)
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    AS $function$
    DECLARE
      item jsonb;
      key text;
      child jsonb;
      referenced_id text;
    BEGIN
      IF jsonb_typeof(value) = 'array' THEN
        FOR item IN SELECT jsonb_array_elements(value) LOOP
          IF payload_json_references_missing_media(item) THEN
            RETURN true;
          END IF;
        END LOOP;
      ELSIF jsonb_typeof(value) = 'object' THEN
        IF value->>'type' = 'upload'
          AND value->>'relationTo' = 'media' THEN
          referenced_id := COALESCE(value->'value'->>'id', value->'value' #>> '{}');
        ELSIF value->>'relationTo' = 'media' OR value->>'relation_to' = 'media' THEN
          referenced_id := COALESCE(value->'value'->>'id', value->'value' #>> '{}');
        END IF;

        IF referenced_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM media WHERE id::text = referenced_id) THEN
          RETURN true;
        END IF;

        FOR key, child IN SELECT entry.key, entry.value FROM jsonb_each(value) AS entry LOOP
          IF (key = 'media_id' OR key LIKE '%_media_id')
            AND jsonb_typeof(child) IN ('number', 'string')
            AND NOT EXISTS (SELECT 1 FROM media WHERE id::text = child #>> '{}') THEN
            RETURN true;
          END IF;

          IF payload_json_references_missing_media(child) THEN
            RETURN true;
          END IF;
        END LOOP;
      END IF;

      RETURN false;
    END;
    $function$
  `)

  await db.execute(sql`
    CREATE OR REPLACE FUNCTION payload_validate_media_reference_write()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF payload_json_references_missing_media(to_jsonb(NEW)) THEN
        RAISE EXCEPTION 'Cannot reference media that does not exist'
          USING ERRCODE = '23503';
      END IF;

      RETURN NEW;
    END;
    $function$
  `)

  await db.execute(sql`
    DO $block$
    DECLARE
      source_table record;
    BEGIN
      FOR source_table IN
        SELECT table_schema, table_name
        FROM information_schema.tables AS tables
        WHERE tables.table_type = 'BASE TABLE'
          AND tables.table_schema = current_schema()
          AND tables.table_name <> 'media'
          AND EXISTS (
            SELECT 1
            FROM information_schema.columns AS columns
            WHERE columns.table_schema = tables.table_schema
              AND columns.table_name = tables.table_name
              AND (
                columns.data_type IN ('json', 'jsonb')
                OR columns.column_name = 'media_id'
                OR columns.column_name LIKE '%_media_id'
                OR columns.column_name IN ('relation_to', 'relationTo', 'value')
              )
          )
      LOOP
        EXECUTE format(
          'DROP TRIGGER IF EXISTS validate_media_reference_write ON %I.%I',
          source_table.table_schema,
          source_table.table_name
        );
        EXECUTE format(
          'CREATE TRIGGER validate_media_reference_write BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION payload_validate_media_reference_write()',
          source_table.table_schema,
          source_table.table_name
        );
      END LOOP;
    END;
    $block$
  `)

  await db.execute(sql`
    CREATE OR REPLACE FUNCTION payload_prevent_deleting_referenced_media()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      source_table record;
      source_row jsonb;
      media_id text := OLD.id::text;
    BEGIN
      FOR source_table IN
        SELECT tables.table_schema, tables.table_name
        FROM information_schema.tables AS tables
        WHERE tables.table_type = 'BASE TABLE'
          AND tables.table_schema = current_schema()
          AND tables.table_name <> TG_TABLE_NAME
          AND EXISTS (
            SELECT 1
            FROM information_schema.columns AS columns
            WHERE columns.table_schema = tables.table_schema
              AND columns.table_name = tables.table_name
              AND (
                columns.data_type IN ('json', 'jsonb')
                OR columns.column_name = 'media_id'
                OR columns.column_name LIKE '%_media_id'
                OR columns.column_name IN ('relation_to', 'relationTo', 'value')
              )
          )
      LOOP
        EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE', source_table.table_schema, source_table.table_name);

        FOR source_row IN EXECUTE format(
          'SELECT to_jsonb(source) FROM %I.%I AS source',
          source_table.table_schema,
          source_table.table_name
        )
        LOOP
          IF payload_json_references_media(source_row, media_id) THEN
            RAISE EXCEPTION 'Cannot delete media % while a Payload document references it', OLD.id
              USING ERRCODE = '23503';
          END IF;
        END LOOP;
      END LOOP;

      RETURN OLD;
    END;
    $function$
  `)

  await db.execute(sql`
    DROP TRIGGER IF EXISTS prevent_deleting_referenced_media ON media
  `)
  await db.execute(sql`
    CREATE TRIGGER prevent_deleting_referenced_media
    BEFORE DELETE ON media
    FOR EACH ROW
    EXECUTE FUNCTION payload_prevent_deleting_referenced_media()
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS prevent_deleting_referenced_media ON media
  `)
  await db.execute(sql`DROP FUNCTION IF EXISTS payload_prevent_deleting_referenced_media()`)
  await db.execute(sql`
    DO $block$
    DECLARE
      source_trigger record;
    BEGIN
      FOR source_trigger IN
        SELECT event_object_schema AS table_schema, event_object_table AS table_name
        FROM information_schema.triggers
        WHERE trigger_name = 'validate_media_reference_write'
          AND event_object_schema = current_schema()
      LOOP
        EXECUTE format(
          'DROP TRIGGER IF EXISTS validate_media_reference_write ON %I.%I',
          source_trigger.table_schema,
          source_trigger.table_name
        );
      END LOOP;
    END;
    $block$
  `)
  await db.execute(sql`DROP FUNCTION IF EXISTS payload_validate_media_reference_write()`)
  await db.execute(sql`DROP FUNCTION IF EXISTS payload_json_references_missing_media(jsonb)`)
  await db.execute(sql`DROP FUNCTION IF EXISTS payload_json_references_media(jsonb, text)`)
}
