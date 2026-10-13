#!/usr/bin/env bash
set -euo pipefail
umask 077
export PGPASSWORD="$(cat /run/secrets/postgres_password)"
export RESTIC_PASSWORD_FILE=/run/secrets/restic_password
export AWS_ACCESS_KEY_ID="$(cat /run/secrets/s3_access_key)"
export AWS_SECRET_ACCESS_KEY="$(cat /run/secrets/s3_secret_key)"
if [[ -z "${RESTIC_REPOSITORY:-}" || ! -s "$RESTIC_PASSWORD_FILE" ]]; then
  echo '{"event":"backup_configuration_missing"}' >&2
  exit 1
fi
safe_run() {
  if "$@" > /tmp/backup-command.log 2>&1; then return 0; fi
  echo '{"event":"backup_command_failed"}' >&2
  return 1
}
case "${1:-schedule}" in
  init) safe_run restic init; exit ;;
  check) safe_run restic check --read-data; exit ;;
  restore) safe_run restic restore latest --target /tmp/recovery; echo '{"event":"backup_restored","target":"/tmp/recovery"}'; exit ;;
  once|schedule) ;;
  *) echo '{"event":"backup_command_invalid"}' >&2; exit 1 ;;
esac
backup_once() {
  local dump=/tmp/pulso.dump
  rm -f /tmp/backup-ok
  safe_run pg_dump --format=custom --encoding=UTF8 --file="$dump" || return 1
  safe_run pg_restore --list "$dump" || return 1
  (cd /tmp && sha256sum pulso.dump) > /tmp/pulso.dump.sha256 || return 1
  safe_run restic backup --host pulso-postgres --tag pulso-database "$dump" /tmp/pulso.dump.sha256 || return 1
  safe_run restic check || return 1
  safe_run restic forget --tag pulso-database --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune || return 1
  rm -f "$dump" /tmp/pulso.dump.sha256 /tmp/backup-command.log
  date +%s > /tmp/backup-ok
  echo '{"event":"backup_completed","encrypted":true}'
}
while true; do
  if ! backup_once; then
    echo '{"event":"backup_failed"}' >&2
    exit 1
  fi
  [[ "${1:-schedule}" == once ]] && exit 0
  sleep "${BACKUP_INTERVAL_SECONDS:-86400}" & wait $!
done
