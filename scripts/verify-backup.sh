#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/backup-common.sh
source "$SCRIPT_DIR/lib/backup-common.sh"

usage() {
  cat <<'EOF'
Usage: verify-backup.sh --backup FILE [--admin-url POSTGRES_URL] [--allow-remote-admin]

Creates a throwaway database, restores the backup, verifies the 0045-equivalent
schema and compares the 10-table sanity signature with the backup manifest.
The throwaway database is dropped on success or failure.
EOF
}

BACKUP_FILE=""
ADMIN_URL="${VERIFY_ADMIN_DATABASE_URL:-${DATABASE_URL:-}}"
ALLOW_REMOTE=false
TEMP_DATABASE=""
TEMP_DATABASE_CREATED=false
TEMP_MANIFEST=""
CURRENT_STEP="parsing arguments"

cleanup() {
  if [[ "$TEMP_DATABASE_CREATED" == true && -n "$TEMP_DATABASE" ]]; then
    psql "$ADMIN_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q \
      -c "DROP DATABASE IF EXISTS \"$TEMP_DATABASE\" WITH (FORCE)" >/dev/null 2>&1 || true
  fi
  [[ -z "$TEMP_MANIFEST" ]] || rm -f "$TEMP_MANIFEST"
}
on_error() {
  local status=$?
  trap - ERR
  vaka_emit_event "backup.verification.failed" "error" "$CURRENT_STEP" "$BACKUP_FILE" "$TEMP_DATABASE"
  exit "$status"
}
trap cleanup EXIT
trap on_error ERR

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup)
      [[ $# -ge 2 ]] || vaka_die "--backup requires a file"
      BACKUP_FILE="$2"
      shift 2
      ;;
    --admin-url)
      [[ $# -ge 2 ]] || vaka_die "--admin-url requires a PostgreSQL URL"
      ADMIN_URL="$2"
      shift 2
      ;;
    --allow-remote-admin)
      ALLOW_REMOTE=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      vaka_die "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$BACKUP_FILE" ]] || vaka_die "--backup is required"
[[ -f "$BACKUP_FILE" ]] || vaka_die "Backup file does not exist: $BACKUP_FILE"
[[ -n "$ADMIN_URL" ]] || vaka_die "--admin-url or VERIFY_ADMIN_DATABASE_URL is required"

vaka_require_command node
vaka_require_command psql
vaka_require_command pg_restore

CURRENT_STEP="checking verification target"
ADMIN_IDENTITY=$(vaka_database_identity "$ADMIN_URL")
IFS=$'\t' read -r ADMIN_DATABASE ADMIN_HOST ADMIN_USER <<< "$ADMIN_IDENTITY"
if vaka_is_production_target "$ADMIN_DATABASE" "$ADMIN_HOST" "$ADMIN_USER"; then
  vaka_die "Backup verification refuses every protected production project"
fi
if ! vaka_is_local_host "$ADMIN_HOST" && [[ "$ALLOW_REMOTE" != true ]]; then
  vaka_die "Remote verification requires --allow-remote-admin and a confirmed non-production host"
fi

PLAIN_BACKUP="${BACKUP_FILE%.enc}"
[[ "$PLAIN_BACKUP" == *.dump ]] || vaka_die "Backup filename must end in .dump or .dump.enc"
MANIFEST_FILE="${PLAIN_BACKUP%.dump}.manifest.json"
if [[ "$BACKUP_FILE" == *.enc ]]; then
  MANIFEST_FILE="$MANIFEST_FILE.enc"
fi
[[ -f "$MANIFEST_FILE" ]] || vaka_die "Matching backup manifest is missing: $MANIFEST_FILE"

READABLE_MANIFEST="$MANIFEST_FILE"
if [[ "$MANIFEST_FILE" == *.enc ]]; then
  CURRENT_STEP="decrypting manifest"
  [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] \
    || vaka_die "BACKUP_ENCRYPTION_KEY is required for encrypted backups"
  vaka_require_command openssl
  TEMP_MANIFEST=$(mktemp "${TMPDIR:-/tmp}/vaka-manifest.XXXXXX")
  chmod 600 "$TEMP_MANIFEST"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 \
    -pass env:BACKUP_ENCRYPTION_KEY \
    -in "$MANIFEST_FILE" \
    -out "$TEMP_MANIFEST"
  READABLE_MANIFEST="$TEMP_MANIFEST"
fi
EXPECTED_SIGNATURE=$(vaka_manifest_sanity "$READABLE_MANIFEST")

CURRENT_STEP="creating throwaway database"
TEMP_DATABASE="vaka_backup_verify_test_$(date -u '+%Y%m%d%H%M%S')_${RANDOM}"
TARGET_URL=$(vaka_database_url_with_name "$ADMIN_URL" "$TEMP_DATABASE")
psql "$ADMIN_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q \
  -c "CREATE DATABASE \"$TEMP_DATABASE\"" >/dev/null
TEMP_DATABASE_CREATED=true

CURRENT_STEP="restoring throwaway database"
RESTORE_ARGS=(--backup "$BACKUP_FILE" --target-url "$TARGET_URL" --yes)
"$SCRIPT_DIR/restore.sh" "${RESTORE_ARGS[@]}"

CURRENT_STEP="checking restored database"
vaka_assert_expected_migration "$TARGET_URL"
ACTUAL_SIGNATURE=$(vaka_canonical_json "$(vaka_sanity_signature "$TARGET_URL")")
[[ "$ACTUAL_SIGNATURE" == "$EXPECTED_SIGNATURE" ]] \
  || vaka_die "Restored sanity signature does not match the backup manifest"

printf 'Verified migration: %s\n' "$VAKA_EXPECTED_MIGRATION"
printf 'Verified sanity signature: %s\n' "$ACTUAL_SIGNATURE"
trap - ERR
vaka_emit_event "backup.verification.succeeded" "info" "complete" "$BACKUP_FILE" "$TEMP_DATABASE"
