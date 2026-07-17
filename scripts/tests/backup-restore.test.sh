#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
# shellcheck source=../lib/backup-common.sh
source "$REPO_DIR/scripts/lib/backup-common.sh"

[[ -n "${DATABASE_URL:-}" ]] || vaka_die "DATABASE_URL is required for the backup/restore test"
vaka_require_command pg_dump
vaka_require_command pg_restore
vaka_require_command psql
vaka_require_command openssl

TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/vaka-backup-test.XXXXXX")
cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

ADMIN_URL=$(vaka_database_url_with_name "$DATABASE_URL" postgres)

set +e
FAILURE_OUTPUT=$(BACKUP_DIR="$TEST_ROOT/failure" BACKUP_RETENTION_DAYS=invalid \
  "$REPO_DIR/scripts/backup.sh" 2>&1)
FAILURE_STATUS=$?
set -e
[[ "$FAILURE_STATUS" -ne 0 && "$FAILURE_OUTPUT" == *'"event":"backup.failed"'* ]] \
  || vaka_die "Backup failure did not return non-zero with a structured backup.failed event"
[[ "$FAILURE_OUTPUT" != *"$DATABASE_URL"* ]] \
  || vaka_die "Backup failure output exposed the database URL"

PLAIN_DIR="$TEST_ROOT/plain"
BACKUP_DIR="$PLAIN_DIR" BACKUP_RETENTION_DAYS=1 \
  "$REPO_DIR/scripts/backup.sh"
PLAIN_BACKUP=$(find "$PLAIN_DIR" -maxdepth 1 -type f -name '*.dump' -print)
[[ -n "$PLAIN_BACKUP" && "$(printf '%s\n' "$PLAIN_BACKUP" | wc -l | tr -d ' ')" == "1" ]] \
  || vaka_die "Expected exactly one plain custom-format dump"
"$REPO_DIR/scripts/verify-backup.sh" --backup "$PLAIN_BACKUP" --admin-url "$ADMIN_URL"

PROTECTED_TARGET=$(vaka_database_url_with_name "$DATABASE_URL" vaka-os-prod)
set +e
SAFETY_OUTPUT=$("$REPO_DIR/scripts/restore.sh" \
  --backup "$PLAIN_BACKUP" \
  --target-url "$PROTECTED_TARGET" \
  --yes 2>&1)
SAFETY_STATUS=$?
set -e
[[ "$SAFETY_STATUS" == "64" ]] || vaka_die "Production safety rail did not return exit status 64"
[[ "$SAFETY_OUTPUT" == *"PRODUCTION RESTORE REFUSED"* ]] \
  || vaka_die "Production safety rail did not emit the refusal message"
PROTECTED_EXISTS=$(psql "$ADMIN_URL" -X --no-psqlrc -Atq -v ON_ERROR_STOP=1 \
  -c "SELECT 1 FROM pg_database WHERE datname = 'vaka-os-prod'")
[[ -z "$PROTECTED_EXISTS" ]] || vaka_die "Production safety-rail test unexpectedly created a database"

PROTECTED_POOLER_URL="postgresql://postgres.ewljdjvqngxweacgwedu:local-only@aws-0-eu-west-2.pooler.supabase.com:6543/postgres"
set +e
POOLER_OUTPUT=$("$REPO_DIR/scripts/restore.sh" \
  --backup "$PLAIN_BACKUP" \
  --target-url "$PROTECTED_POOLER_URL" \
  --yes 2>&1)
POOLER_STATUS=$?
set -e
[[ "$POOLER_STATUS" == "64" && "$POOLER_OUTPUT" == *"PRODUCTION RESTORE REFUSED"* ]] \
  || vaka_die "Production project-reference safety rail did not refuse the pooler identity"

UPLOADS_DIR="$TEST_ROOT/uploaded-documents"
mkdir -p "$UPLOADS_DIR"
printf 'LP-006 local file fixture\n' > "$UPLOADS_DIR/document.txt"
ENCRYPTED_DIR="$TEST_ROOT/encrypted"
BACKUP_ENCRYPTION_KEY="LP006-CI-only-encryption-key-not-for-production" \
BACKUP_DIR="$ENCRYPTED_DIR" \
BACKUP_UPLOADS_DIR="$UPLOADS_DIR" \
BACKUP_RETENTION_DAYS=1 \
  "$REPO_DIR/scripts/backup.sh"
ENCRYPTED_BACKUP=$(find "$ENCRYPTED_DIR" -maxdepth 1 -type f -name '*.dump.enc' -print)
[[ -n "$ENCRYPTED_BACKUP" ]] || vaka_die "Encrypted database artifact was not created"
find "$ENCRYPTED_DIR" -maxdepth 1 -type f -name '*.dump' -print -quit | grep -q . \
  && vaka_die "Unencrypted database dump remained after encryption"
find "$ENCRYPTED_DIR" -maxdepth 1 -type f -name '*.documents.tar.gz.enc' -print -quit | grep -q . \
  || vaka_die "Encrypted local-document archive was not created"
BACKUP_ENCRYPTION_KEY="LP006-CI-only-encryption-key-not-for-production" \
  "$REPO_DIR/scripts/verify-backup.sh" --backup "$ENCRYPTED_BACKUP" --admin-url "$ADMIN_URL"

FAKE_BIN="$TEST_ROOT/bin"
FAKE_AWS_LOG="$TEST_ROOT/aws.log"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/aws" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_AWS_LOG"
EOF
chmod +x "$FAKE_BIN/aws"
UPLOAD_DIR="$TEST_ROOT/upload"
mkdir -p "$UPLOAD_DIR"
touch "$UPLOAD_DIR/vaka-expired.dump"
touch -t 202001010000 "$UPLOAD_DIR/vaka-expired.dump"
PATH="$FAKE_BIN:$PATH" \
FAKE_AWS_LOG="$FAKE_AWS_LOG" \
BACKUP_DIR="$UPLOAD_DIR" \
BACKUP_RETENTION_DAYS=1 \
BACKUP_S3_URI="s3://test-only-vaka-backups/pilot" \
BACKUP_S3_ENDPOINT_URL="https://s3.test.invalid" \
  "$REPO_DIR/scripts/backup.sh"
[[ ! -e "$UPLOAD_DIR/vaka-expired.dump" ]] || vaka_die "Expired local artifact was not pruned"
[[ "$(wc -l < "$FAKE_AWS_LOG" | tr -d ' ')" == "2" ]] \
  || vaka_die "Expected the database and manifest to be sent to the S3-compatible client"
find "$UPLOAD_DIR" -maxdepth 1 -type f -name '*.dump' -print -quit | grep -q . \
  || vaka_die "S3-compatible upload removed the required local database copy"

printf 'Backup/restore round trip, encryption, local-document archive, S3-compatible upload, retention and production safety rails passed.\n'
