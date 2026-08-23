-- Better Auth 1.6 -> 1.7 account identity migration (PostgreSQL / Drizzle).
--
-- Run in a maintenance window after stopping every authentication writer.
-- The transaction and ACCESS EXCLUSIVE lock ensure that unknown providers or
-- collisions roll back the complete migration. This schema uses snake_case;
-- Prisma installations must use @modern-admin/system-prisma's migration.

BEGIN;

SET LOCAL lock_timeout = '10s';
LOCK TABLE ma_account IN ACCESS EXCLUSIVE MODE;

ALTER TABLE ma_account ADD COLUMN issuer TEXT;

DO $$
DECLARE
  provider_inventory TEXT;
BEGIN
  SELECT string_agg(format('%s (%s rows)', provider_id, row_count), ', ' ORDER BY provider_id)
  INTO provider_inventory
  FROM (
    SELECT provider_id, count(*) AS row_count
    FROM ma_account
    GROUP BY provider_id
  ) AS inventory;

  RAISE NOTICE 'Better Auth account provider inventory: %',
    coalesce(provider_inventory, '<empty>');
END $$;

-- Google has the verified issuer below. Better Auth 1.7's GitHub provider has
-- no authoritative issuer, so encodeURIComponent('github') produces the
-- synthetic local:oauth:github identity namespace. Fail closed for everything
-- else until an operator verifies and adds an explicit provider mapping.
DO $$
DECLARE
  unknown_providers TEXT;
BEGIN
  SELECT string_agg(DISTINCT provider_id, ', ' ORDER BY provider_id)
  INTO unknown_providers
  FROM ma_account
  WHERE provider_id NOT IN ('credential', 'google', 'github');

  IF unknown_providers IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Better Auth 1.7 migration stopped: unknown account providers: ' || unknown_providers,
      HINT = 'Verify each provider issuer, add an explicit mapping to this migration, and rerun the whole transaction.';
  END IF;
END $$;

DO $$
DECLARE
  malformed_credentials TEXT;
BEGIN
  SELECT string_agg(id::text, ', ' ORDER BY id::text)
  INTO malformed_credentials
  FROM ma_account
  WHERE provider_id = 'credential'
    AND (account_id <> user_id::text OR password IS NULL);

  IF malformed_credentials IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Better Auth 1.7 migration stopped: malformed credential account rows: ' || malformed_credentials,
      HINT = 'Repair account_id/user_id linkage or the missing password hash before rerunning; do not reset or rehash valid passwords.';
  END IF;
END $$;

DO $$
DECLARE
  identity_collisions TEXT;
BEGIN
  WITH projected AS (
    SELECT
      id,
      account_id,
      CASE provider_id
        WHEN 'credential' THEN 'local:credential'
        WHEN 'google' THEN 'https://accounts.google.com'
        WHEN 'github' THEN 'local:oauth:github'
      END AS projected_issuer
    FROM ma_account
  ), collisions AS (
    SELECT
      projected_issuer,
      account_id,
      string_agg(id::text, ', ' ORDER BY id::text) AS row_ids
    FROM projected
    GROUP BY projected_issuer, account_id
    HAVING count(*) > 1
  )
  SELECT string_agg(
    format('(%s, %s) rows [%s]', projected_issuer, account_id, row_ids),
    '; '
    ORDER BY projected_issuer, account_id
  )
  INTO identity_collisions
  FROM collisions;

  IF identity_collisions IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Better Auth 1.7 migration stopped: duplicate (issuer, accountId) identities: ' || identity_collisions,
      HINT = 'Resolve ownership manually. This migration will not merge accounts or delete users.';
  END IF;
END $$;

UPDATE ma_account
SET issuer = CASE provider_id
  WHEN 'credential' THEN 'local:credential'
  WHEN 'google' THEN 'https://accounts.google.com'
  WHEN 'github' THEN 'local:oauth:github'
END;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ma_account WHERE issuer IS NULL) THEN
    RAISE EXCEPTION 'Better Auth 1.7 migration stopped: issuer backfill is incomplete';
  END IF;
END $$;

ALTER TABLE ma_account ALTER COLUMN issuer SET NOT NULL;
ALTER TABLE ma_account
  ADD CONSTRAINT ma_account_issuer_account_id_uq UNIQUE (issuer, account_id);
CREATE INDEX ma_account_user_id_idx ON ma_account (user_id);

COMMIT;
