FROM restic/restic:0.19.1 AS restic
FROM postgres:18.6-bookworm
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY ops/backup/backup.sh /usr/local/bin/pulso-backup
RUN chmod 755 /usr/local/bin/pulso-backup
ENTRYPOINT ["bash", "/usr/local/bin/pulso-backup"]
