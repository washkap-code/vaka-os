#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/backup-common.sh
source "$SCRIPT_DIR/lib/backup-common.sh"

usage() {
  cat <<'EOF'
Usage: restore.sh --backup FILE --target-url POSTGRES_URL [--yes] [--i-know-this-is-production]

Restores a VAKA custom-format dump into the explicitly named target database.
--yes bypasses the interactive confirmation. It never bypasses the production
safety rail; production additionally requires --i-know-this-is-production.
EOF
}

BACKUP_FILE=""
TARGET_URL=""
ASSUME_YES=false
PRODUCTION_OVERRIDE=false
CURRENT_STEP="parsing arguments"
TARGET_DATABASE=""
TEMP_DUMP=""
RESTORE_ENCRYPTED=false

on_error() {
  local status=$?
  trap - ERR
  vaka_emit_event "restore.failed" "error" "$CURRENT_STEP" "$BACKUP_FILE" "$TARGET_DATABASE" "$RESTORE_ENCRYPTED"
  exit "$status"
}
cleanup() {
  [[ -z "$TEMP_DUMP" ]] || rm -f "$TEMP_DUMP"
}
trap on_error ERR
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup)
      [[ $# -ge 2 ]] || vaka_die "--backup requires a file"
      BACKUP_FILE="$2"
      shift 2
      ;;
    --target-url)
      [[ $# -ge 2 ]] || vaka_die "--target-url requires a PostgreSQL URL"
      TARGET_URL="$2"
      shift 2
      ;;
    --yes)
      ASSUME_YES=true
      shift
      ;;
    --i-know-this-is-production)
      PRODUCTION_OVERRIDE=true
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
[[ -n "$TARGET_URL" ]] || vaka_die "--target-url is required"
[[ "$BACKUP_FILE" != *.enc ]] || RESTORE_ENCRYPTED=true

vaka_require_command node

CURRENT_STEP="checking production safety rail"
IDENTITY=$(vaka_database_identity "$TARGET_URL")
IFS=$'\t' read -r TARGET_DATABASE TARGET_HOST TARGET_USER <<< "$IDENTITY"
IS_PRODUCTION=false
if vaka_is_production_target "$TARGET_DATABASE" "$TARGET_HOST" "$TARGET_USER"; then
  IS_PRODUCTION=true
fi
if [[ "$IS_PRODUCTION" == true && "$PRODUCTION_OVERRIDE" != true ]]; then
  trap - ERR
  vaka_emit_event "restore.refused" "warn" "production safety rail" "$BACKUP_FILE" "$TARGET_DATABASE"
  printf 'PRODUCTION RESTORE REFUSED: target %s matches a protected VAKA production marker.\n' \
    "$TARGET_DATABASE" >&2
  printf 'A separately authorised production recovery requires --i-know-this-is-production.\n' >&2
  exit 64
fi

vaka_require_command psql
vaka_require_command pg_restore

printf 'Restore plan:\n'
printf '  Backup: %s\n' "$BACKUP_FILE"
printf '  Target host: %s\n' "$TARGET_HOST"
printf '  Target database: %s\n' "$TARGET_DATABASE"
printf '  Existing objects in the target will be replaced.\n'
if [[ "$IS_PRODUCTION" == true ]]; then
  printf '  WARNING: production override accepted; incident/change approval must already exist.\n'
fi

if [[ "$ASSUME_YES" != true ]]; then
  printf 'Type RESTORE to continue: '
  read -r CONFIRMATION
  [[ "$CONFIRMATION" == "RESTORE" ]] || vaka_die "Restore cancelled"
fi

RESTORE_DUMP="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.enc ]]; then
  CURRENT_STEP="decrypting backup"
  [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] \
    || vaka_die "BACKUP_ENCRYPTION_KEY is required for encrypted backups"
  vaka_require_command openssl
  TEMP_DUMP=$(mktemp "${TMPDIR:-/tmp}/vaka-restore.XXXXXX")
  chmod 600 "$TEMP_DUMP"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 \
    -pass env:BACKUP_ENCRYPTION_KEY \
    -in "$BACKUP_FILE" \
    -out "$TEMP_DUMP"
  RESTORE_DUMP="$TEMP_DUMP"
fi

CURRENT_STEP="validating backup format"
pg_restore --list "$RESTORE_DUMP" >/dev/null

CURRENT_STEP="restoring database"
PGAPPNAME=vaka-restore pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --single-transaction \
  --dbname "$TARGET_URL" \
  "$RESTORE_DUMP"

CURRENT_STEP="checking restored migration status"
vaka_assert_expected_migration "$TARGET_URL"
printf 'Migration status: %s\n' "$VAKA_EXPECTED_MIGRATION"
printf 'Sanity signature (10 tables):\n'
vaka_print_sanity_rows "$TARGET_URL"

trap - ERR
vaka_emit_event "restore.succeeded" "info" "complete" "$BACKUP_FILE" "$TARGET_DATABASE" "$RESTORE_ENCRYPTED"
