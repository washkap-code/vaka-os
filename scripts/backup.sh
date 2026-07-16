#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
# shellcheck source=lib/backup-common.sh
source "$SCRIPT_DIR/lib/backup-common.sh"

CURRENT_STEP="initialising"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vaka}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-}"
BACKUP_S3_URI="${BACKUP_S3_URI:-}"
BACKUP_S3_ENDPOINT_URL="${BACKUP_S3_ENDPOINT_URL:-}"
DATABASE_URL="${DATABASE_URL:-}"
ENCRYPTED=false
UPLOADED=false
DUMP_PATH=""
DOCUMENTS_PATH=""
MANIFEST_PATH=""
BASE_PATH=""
SNAPSHOT_FILE=""
SNAPSHOT_HOLDER_PID=""

release_snapshot() {
  if [[ -n "$SNAPSHOT_HOLDER_PID" ]]; then
    kill "$SNAPSHOT_HOLDER_PID" >/dev/null 2>&1 || true
    wait "$SNAPSHOT_HOLDER_PID" >/dev/null 2>&1 || true
    SNAPSHOT_HOLDER_PID=""
  fi
  [[ -z "$SNAPSHOT_FILE" ]] || rm -f "$SNAPSHOT_FILE"
  SNAPSHOT_FILE=""
}

on_error() {
  local status=$?
  trap - ERR
  release_snapshot
  if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" && -n "$BASE_PATH" ]]; then
    rm -f "$BASE_PATH.dump" "$BASE_PATH.dump.enc" \
      "$BASE_PATH.documents.tar.gz" "$BASE_PATH.documents.tar.gz.enc" \
      "$BASE_PATH.manifest.json" "$BASE_PATH.manifest.json.enc"
  fi
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.partial' -delete 2>/dev/null || true
  vaka_emit_event "backup.failed" "error" "$CURRENT_STEP" "" "" "$ENCRYPTED" "$UPLOADED"
  exit "$status"
}
trap on_error ERR

[[ -n "$DATABASE_URL" ]] || vaka_die "DATABASE_URL is required"
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] \
  || vaka_die "BACKUP_RETENTION_DAYS must be a non-negative integer"
[[ -z "$BACKUP_S3_URI" || "$BACKUP_S3_URI" == s3://* ]] \
  || vaka_die "BACKUP_S3_URI must start with s3://"

vaka_require_command node
vaka_require_command pg_dump
vaka_require_command psql
vaka_require_command find
vaka_require_command tar
if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  vaka_require_command openssl
  ENCRYPTED=true
fi
if [[ -n "$BACKUP_S3_URI" ]]; then
  vaka_require_command aws
fi

CURRENT_STEP="preparing destination"
if [[ -L "$BACKUP_DIR" ]]; then
  vaka_die "BACKUP_DIR must not be a symbolic link"
fi
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

CURRENT_STEP="checking schema"
vaka_assert_expected_migration "$DATABASE_URL"

TIMESTAMP=$(date -u '+%Y%m%dT%H%M%SZ')
GIT_SHA="${APP_GIT_SHA:-${VERCEL_GIT_COMMIT_SHA:-}}"
if [[ -z "$GIT_SHA" ]]; then
  GIT_SHA=$(git -C "$REPO_DIR" rev-parse --short=12 HEAD 2>/dev/null || printf 'unknown')
fi
[[ "$GIT_SHA" =~ ^[A-Za-z0-9._-]+$ ]] || vaka_die "Application git SHA contains unsafe characters"

BASE_PATH="$BACKUP_DIR/vaka-$TIMESTAMP-$GIT_SHA"
DUMP_PATH="$BASE_PATH.dump"
DOCUMENTS_PATH="$BASE_PATH.documents.tar.gz"
MANIFEST_PATH="$BASE_PATH.manifest.json"
for candidate in "$DUMP_PATH" "$DUMP_PATH.enc" "$DOCUMENTS_PATH" "$DOCUMENTS_PATH.enc" \
  "$MANIFEST_PATH" "$MANIFEST_PATH.enc"; do
  [[ ! -e "$candidate" ]] || vaka_die "Backup artifact already exists: $(basename "$candidate")"
done

CURRENT_STEP="opening consistent snapshot"
SNAPSHOT_FILE=$(mktemp "${TMPDIR:-/tmp}/vaka-backup-snapshot.XXXXXX")
psql "$DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -Atq > "$SNAPSHOT_FILE" <<'SQL' &
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot();
SELECT pg_sleep(86400);
SQL
SNAPSHOT_HOLDER_PID=$!
SNAPSHOT_ID=""
for _attempt in {1..100}; do
  if [[ -s "$SNAPSHOT_FILE" ]]; then
    SNAPSHOT_ID=$(sed -n '1p' "$SNAPSHOT_FILE")
    break
  fi
  kill -0 "$SNAPSHOT_HOLDER_PID" >/dev/null 2>&1 \
    || vaka_die "Database snapshot holder exited before exporting a snapshot"
  sleep 0.1
done
[[ "$SNAPSHOT_ID" =~ ^[A-Za-z0-9-]+$ ]] \
  || vaka_die "Database did not export a valid backup snapshot"

CURRENT_STEP="dumping database"
PGAPPNAME=vaka-backup pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --lock-wait-timeout=30000 \
  --snapshot "$SNAPSHOT_ID" \
  --file "$DUMP_PATH.partial" \
  "$DATABASE_URL"
chmod 600 "$DUMP_PATH.partial"
mv "$DUMP_PATH.partial" "$DUMP_PATH"

CURRENT_STEP="recording sanity signature"
SANITY_SIGNATURE=$(vaka_sanity_signature "$DATABASE_URL" "$SNAPSHOT_ID")
release_snapshot

if [[ -n "$BACKUP_UPLOADS_DIR" ]]; then
  CURRENT_STEP="archiving local documents"
  [[ -d "$BACKUP_UPLOADS_DIR" ]] \
    || vaka_die "BACKUP_UPLOADS_DIR is configured but is not a directory"
  tar -C "$(dirname "$BACKUP_UPLOADS_DIR")" -czf "$DOCUMENTS_PATH.partial" \
    "$(basename "$BACKUP_UPLOADS_DIR")"
  chmod 600 "$DOCUMENTS_PATH.partial"
  mv "$DOCUMENTS_PATH.partial" "$DOCUMENTS_PATH"
else
  DOCUMENTS_PATH=""
fi

FINAL_DUMP_PATH="$DUMP_PATH"
FINAL_DOCUMENTS_PATH="$DOCUMENTS_PATH"
FINAL_MANIFEST_PATH="$MANIFEST_PATH"
if [[ "$ENCRYPTED" == true ]]; then
  FINAL_DUMP_PATH="$DUMP_PATH.enc"
  [[ -z "$DOCUMENTS_PATH" ]] || FINAL_DOCUMENTS_PATH="$DOCUMENTS_PATH.enc"
  FINAL_MANIFEST_PATH="$MANIFEST_PATH.enc"
fi

DOCUMENTS_JSON=null
if [[ -n "$FINAL_DOCUMENTS_PATH" ]]; then
  DOCUMENTS_JSON="\"$(vaka_json_escape "$(basename "$FINAL_DOCUMENTS_PATH")")\""
fi
cat > "$MANIFEST_PATH.partial" <<EOF
{"formatVersion":1,"createdAt":"$(vaka_utc_now)","gitSha":"$(vaka_json_escape "$GIT_SHA")","expectedMigration":"$VAKA_EXPECTED_MIGRATION","databaseArtifact":"$(vaka_json_escape "$(basename "$FINAL_DUMP_PATH")")","documentsArtifact":$DOCUMENTS_JSON,"encrypted":$ENCRYPTED,"sanity":$SANITY_SIGNATURE}
EOF
chmod 600 "$MANIFEST_PATH.partial"
mv "$MANIFEST_PATH.partial" "$MANIFEST_PATH"

encrypt_artifact() {
  local source_path="$1"
  local encrypted_path="$2"
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 \
    -pass env:BACKUP_ENCRYPTION_KEY \
    -in "$source_path" \
    -out "$encrypted_path.partial"
  chmod 600 "$encrypted_path.partial"
  mv "$encrypted_path.partial" "$encrypted_path"
  rm -f "$source_path"
}

if [[ "$ENCRYPTED" == true ]]; then
  CURRENT_STEP="encrypting artifacts"
  encrypt_artifact "$DUMP_PATH" "$FINAL_DUMP_PATH"
  if [[ -n "$DOCUMENTS_PATH" ]]; then
    encrypt_artifact "$DOCUMENTS_PATH" "$FINAL_DOCUMENTS_PATH"
  fi
  encrypt_artifact "$MANIFEST_PATH" "$FINAL_MANIFEST_PATH"
fi

ARTIFACTS=("$FINAL_DUMP_PATH" "$FINAL_MANIFEST_PATH")
if [[ -n "$FINAL_DOCUMENTS_PATH" ]]; then
  ARTIFACTS+=("$FINAL_DOCUMENTS_PATH")
fi

if [[ -n "$BACKUP_S3_URI" ]]; then
  CURRENT_STEP="uploading artifacts"
  for artifact in "${ARTIFACTS[@]}"; do
    AWS_ARGS=(s3 cp "$artifact" "${BACKUP_S3_URI%/}/$(basename "$artifact")" --only-show-errors)
    if [[ -n "$BACKUP_S3_ENDPOINT_URL" ]]; then
      AWS_ARGS+=(--endpoint-url "$BACKUP_S3_ENDPOINT_URL")
    fi
    aws "${AWS_ARGS[@]}"
  done
  UPLOADED=true
fi

CURRENT_STEP="pruning local retention"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'vaka-*' \
  -mtime "+$BACKUP_RETENTION_DAYS" -delete

trap - ERR
vaka_emit_event "backup.succeeded" "info" "complete" "$FINAL_DUMP_PATH" "" "$ENCRYPTED" "$UPLOADED"
