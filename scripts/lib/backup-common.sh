#!/usr/bin/env bash

# Shared LP-006 backup/restore controls. Callers enable their own strict mode.

VAKA_EXPECTED_MIGRATION="0045_schema_runtime_alignment"
VAKA_PRODUCTION_DATABASE_NAME="${PRODUCTION_DATABASE_NAME:-vaka-os-prod}"
VAKA_PRODUCTION_PROJECT_REF="${PRODUCTION_PROJECT_REF:-ewljdjvqngxweacgwedu}"
VAKA_LEGACY_PRODUCTION_DATABASE_NAME="vaka-platform"
VAKA_LEGACY_PRODUCTION_PROJECT_REF="kjabilwcdwpncthbskvy"

vaka_die() {
  printf 'ERROR: %s\n' "$1" >&2
  return 1
}

vaka_require_command() {
  command -v "$1" >/dev/null 2>&1 || vaka_die "Required command is unavailable: $1"
}

vaka_utc_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

vaka_json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

vaka_emit_event() {
  local event="$1"
  local level="$2"
  local step="${3:-}"
  local artifact="${4:-}"
  local target_database="${5:-}"
  local encrypted="${6:-false}"
  local uploaded="${7:-false}"
  printf '{"timestamp":"%s","level":"%s","message":"%s","event":"%s","requestId":null,"tenantId":null,"userId":null,"route":null,"status":null,"latencyMs":null,"step":"%s","artifact":"%s","targetDatabase":"%s","encrypted":%s,"uploaded":%s}\n' \
    "$(vaka_utc_now)" \
    "$(vaka_json_escape "$level")" \
    "$(vaka_json_escape "$event")" \
    "$(vaka_json_escape "$event")" \
    "$(vaka_json_escape "$step")" \
    "$(vaka_json_escape "$artifact")" \
    "$(vaka_json_escape "$target_database")" \
    "$encrypted" \
    "$uploaded"
}

# Prints: database<TAB>hostname<TAB>username. It never prints passwords.
vaka_database_identity() {
  local database_url="$1"
  VAKA_DATABASE_URL="$database_url" node --input-type=module -e '
    try {
      const parsed = new URL(process.env.VAKA_DATABASE_URL);
      if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error("not PostgreSQL");
      }
      const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      if (!database || database.includes("/")) throw new Error("database name is missing or malformed");
      process.stdout.write([database, parsed.hostname, decodeURIComponent(parsed.username)].join("\t"));
    } catch {
      process.stderr.write("Database URL must be a PostgreSQL URL with an explicit database name.\n");
      process.exit(64);
    }
  '
}

vaka_database_url_with_name() {
  local database_url="$1"
  local database_name="$2"
  VAKA_DATABASE_URL="$database_url" VAKA_DATABASE_NAME="$database_name" node --input-type=module -e '
    try {
      const parsed = new URL(process.env.VAKA_DATABASE_URL);
      const name = process.env.VAKA_DATABASE_NAME;
      if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
        || !/^[A-Za-z0-9_-]+$/.test(name)) throw new Error("invalid input");
      parsed.pathname = `/${name}`;
      process.stdout.write(parsed.toString());
    } catch {
      process.stderr.write("Could not construct a PostgreSQL database URL.\n");
      process.exit(64);
    }
  '
}

vaka_is_production_target() {
  local database_name="$1"
  local hostname="$2"
  local username="$3"
  local database_lower
  local identity_lower
  local configured_name_lower
  database_lower=$(printf '%s' "$database_name" | tr '[:upper:]' '[:lower:]')
  identity_lower=$(printf '%s %s' "$hostname" "$username" | tr '[:upper:]' '[:lower:]')
  configured_name_lower=$(printf '%s' "$VAKA_PRODUCTION_DATABASE_NAME" | tr '[:upper:]' '[:lower:]')

  case "$database_lower" in
    vaka-os-prod|vaka-platform)
      return 0
      ;;
  esac
  if [[ -n "$configured_name_lower" && "$database_lower" == "$configured_name_lower" ]]; then
    return 0
  fi
  if [[ "$identity_lower" == *"$VAKA_PRODUCTION_PROJECT_REF"* \
    || "$identity_lower" == *"$VAKA_LEGACY_PRODUCTION_PROJECT_REF"* \
    || "$identity_lower" == *"vaka-os-prod"* \
    || "$identity_lower" == *"vaka-platform"* ]]; then
    return 0
  fi
  return 1
}

vaka_is_local_host() {
  case "$1" in
    localhost|127.0.0.1|::1|'[::1]'|postgres)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

vaka_migration_status() {
  local database_url="$1"
  psql "$database_url" -X --no-psqlrc -v ON_ERROR_STOP=1 -Atq <<'SQL'
SELECT CASE WHEN (
  to_regclass('public.migration_projects') IS NOT NULL
  AND to_regclass('public.directory_enquiries') IS NOT NULL
  AND to_regclass('public.document_approvals') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_timeline_events'
      AND column_name = 'created_at'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_timeline_events'
      AND column_name = 'projected_at'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants'
      AND column_name = 'invoice_bank_currency' AND udt_name = 'currency'
  )
) THEN '0045_schema_runtime_alignment' ELSE 'schema_mismatch' END;
SQL
}

vaka_assert_expected_migration() {
  local database_url="$1"
  local status
  status=$(vaka_migration_status "$database_url")
  [[ "$status" == "$VAKA_EXPECTED_MIGRATION" ]] \
    || vaka_die "Database schema does not match $VAKA_EXPECTED_MIGRATION"
}

vaka_sanity_signature() {
  local database_url="$1"
  local snapshot_id="${2:-}"
  if [[ -n "$snapshot_id" ]]; then
    psql "$database_url" -X --no-psqlrc -v ON_ERROR_STOP=1 -Atq \
      -v vaka_snapshot="$snapshot_id" <<'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TRANSACTION SNAPSHOT :'vaka_snapshot';
SELECT json_build_object(
  'tenants', (SELECT count(*) FROM public.tenants),
  'users', (SELECT count(*) FROM public.users),
  'contacts', (SELECT count(*) FROM public.contacts),
  'products', (SELECT count(*) FROM public.products),
  'invoices', (SELECT count(*) FROM public.invoices),
  'payments', (SELECT count(*) FROM public.payments),
  'journal_entries', (SELECT count(*) FROM public.journal_entries),
  'journal_lines', (SELECT count(*) FROM public.journal_lines),
  'stock_movements', (SELECT count(*) FROM public.stock_movements),
  'audit_logs', (SELECT count(*) FROM public.audit_logs)
)::text;
COMMIT;
SQL
    return
  fi
  psql "$database_url" -X --no-psqlrc -v ON_ERROR_STOP=1 -Atq <<'SQL'
SELECT json_build_object(
  'tenants', (SELECT count(*) FROM public.tenants),
  'users', (SELECT count(*) FROM public.users),
  'contacts', (SELECT count(*) FROM public.contacts),
  'products', (SELECT count(*) FROM public.products),
  'invoices', (SELECT count(*) FROM public.invoices),
  'payments', (SELECT count(*) FROM public.payments),
  'journal_entries', (SELECT count(*) FROM public.journal_entries),
  'journal_lines', (SELECT count(*) FROM public.journal_lines),
  'stock_movements', (SELECT count(*) FROM public.stock_movements),
  'audit_logs', (SELECT count(*) FROM public.audit_logs)
)::text;
SQL
}

vaka_print_sanity_rows() {
  local database_url="$1"
  psql "$database_url" -X --no-psqlrc -v ON_ERROR_STOP=1 -Atq <<'SQL'
SELECT table_name || E'\t' || row_count FROM (VALUES
  ('tenants', (SELECT count(*) FROM public.tenants)),
  ('users', (SELECT count(*) FROM public.users)),
  ('contacts', (SELECT count(*) FROM public.contacts)),
  ('products', (SELECT count(*) FROM public.products)),
  ('invoices', (SELECT count(*) FROM public.invoices)),
  ('payments', (SELECT count(*) FROM public.payments)),
  ('journal_entries', (SELECT count(*) FROM public.journal_entries)),
  ('journal_lines', (SELECT count(*) FROM public.journal_lines)),
  ('stock_movements', (SELECT count(*) FROM public.stock_movements)),
  ('audit_logs', (SELECT count(*) FROM public.audit_logs))
) AS signature(table_name, row_count)
ORDER BY table_name;
SQL
}

vaka_canonical_json() {
  local json_value="$1"
  VAKA_JSON_VALUE="$json_value" node --input-type=module -e '
    try {
      process.stdout.write(JSON.stringify(JSON.parse(process.env.VAKA_JSON_VALUE)));
    } catch {
      process.stderr.write("Invalid JSON value.\n");
      process.exit(65);
    }
  '
}

vaka_manifest_sanity() {
  local manifest_path="$1"
  VAKA_MANIFEST_PATH="$manifest_path" node --input-type=module -e '
    import { readFileSync } from "node:fs";
    try {
      const manifest = JSON.parse(readFileSync(process.env.VAKA_MANIFEST_PATH, "utf8"));
      if (manifest.formatVersion !== 1 || manifest.expectedMigration !== "0045_schema_runtime_alignment"
        || !manifest.sanity || typeof manifest.sanity !== "object") throw new Error("invalid manifest");
      process.stdout.write(JSON.stringify(manifest.sanity));
    } catch {
      process.stderr.write("Backup manifest is invalid or incompatible.\n");
      process.exit(65);
    }
  '
}
