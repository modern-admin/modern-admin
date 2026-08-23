-- Better Auth 1.6 -> 1.7 account identity migration (PostgreSQL / Prisma).
--
-- Run this during a maintenance window with every authentication writer
-- stopped. The ACCESS EXCLUSIVE lock is a final fence, not a substitute for
-- draining application traffic. Review the provider inventory NOTICE before
-- applying this in production and extend the explicit mapping only after
-- verifying the provider's authoritative issuer.
--
-- Prisma keeps these fields camel-cased in SQL. Drizzle installations must use
-- the sibling migration shipped by @modern-admin/system-drizzle instead.

BEGIN;

SET LOCAL lock_timeout = '10s';
LOCK TABLE "ma_account" IN ACCESS EXCLUSIVE MODE;

-- Add nullable first. NOT NULL is applied only after every row is backfilled.
ALTER TABLE "ma_account" ADD COLUMN "issuer" TEXT;

-- Inventory the legacy provider ids without trusting any request/user data.
DO $$
DECLARE
  provider_inventory TEXT;
BEGIN
  SELECT string_agg(format('%s (%s rows)', "providerId", row_count), ', ' ORDER BY "providerId")
  INTO provider_inventory
  FROM (
    SELECT "providerId", count(*) AS row_count
    FROM "ma_account"
    GROUP BY "providerId"
  ) AS inventory;

  RAISE NOTICE 'Better Auth account provider inventory: %',
    coalesce(provider_inventory, '<empty>');
END $$;

-- These are the providers configured by the Modern Admin reference app.
-- Google exposes a verified authoritative issuer. Better Auth 1.7's built-in
-- GitHub provider has no authoritative account issuer and deliberately uses
-- local:oauth:<encodeURIComponent(providerId)> ("github" needs no escaping).
-- Any other provider must be mapped deliberately after checking the installed
-- Better Auth 1.7 provider definition; never infer an issuer from user data,
-- request input, display names, email domains, or an unverified endpoint.
DO $$
DECLARE
  unknown_providers TEXT;
BEGIN
  SELECT string_agg(DISTINCT "providerId", ', ' ORDER BY "providerId")
  INTO unknown_providers
  FROM "ma_account"
  WHERE "providerId" NOT IN ('credential', 'google', 'github');

  IF unknown_providers IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Better Auth 1.7 migration stopped: unknown account providers: ' || unknown_providers,
      HINT = 'Verify each provider issuer, add an explicit mapping to this migration, and rerun the whole transaction.';
  END IF;
END $$;

-- A credential identity is bound to the stable linked user id in Better Auth
-- 1.7. Refuse malformed legacy rows instead of silently relinking an account.
DO $$
DECLARE
  malformed_credentials TEXT;
BEGIN
  SELECT string_agg("id", ', ' ORDER BY "id")
  INTO malformed_credentials
  FROM "ma_account"
  WHERE "providerId" = 'credential'
    AND ("accountId" <> "userId" OR "password" IS NULL);

  IF malformed_credentials IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Better Auth 1.7 migration stopped: malformed credential account rows: ' || malformed_credentials,
      HINT = 'Repair accountId/userId linkage or the missing password hash before rerunning; do not reset or rehash valid passwords.';
  END IF;
END $$;

-- Detect projected identity collisions before changing any row. Never merge or
-- delete users automatically: an operator must resolve each collision.
DO $$
DECLARE
  identity_collisions TEXT;
BEGIN
  WITH projected AS (
    SELECT
      "id",
      "accountId",
      CASE "providerId"
        WHEN 'credential' THEN 'local:credential'
        WHEN 'google' THEN 'https://accounts.google.com'
        WHEN 'github' THEN 'local:oauth:github'
      END AS projected_issuer
    FROM "ma_account"
  ), collisions AS (
    SELECT
      projected_issuer,
      "accountId",
      string_agg("id", ', ' ORDER BY "id") AS row_ids
    FROM projected
    GROUP BY projected_issuer, "accountId"
    HAVING count(*) > 1
  )
  SELECT string_agg(
    format('(%s, %s) rows [%s]', projected_issuer, "accountId", row_ids),
    '; '
    ORDER BY projected_issuer, "accountId"
  )
  INTO identity_collisions
  FROM collisions;

  IF identity_collisions IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Better Auth 1.7 migration stopped: duplicate (issuer, accountId) identities: ' || identity_collisions,
      HINT = 'Resolve ownership manually. This migration will not merge accounts or delete users.';
  END IF;
END $$;

UPDATE "ma_account"
SET "issuer" = CASE "providerId"
  WHEN 'credential' THEN 'local:credential'
  WHEN 'google' THEN 'https://accounts.google.com'
  WHEN 'github' THEN 'local:oauth:github'
END;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ma_account" WHERE "issuer" IS NULL) THEN
    RAISE EXCEPTION 'Better Auth 1.7 migration stopped: issuer backfill is incomplete';
  END IF;
END $$;

ALTER TABLE "ma_account" ALTER COLUMN "issuer" SET NOT NULL;
ALTER TABLE "ma_account"
  ADD CONSTRAINT "ma_account_issuer_accountId_key" UNIQUE ("issuer", "accountId");
CREATE INDEX "ma_account_userId_idx" ON "ma_account" ("userId");

COMMIT;
