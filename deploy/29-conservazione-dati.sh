#!/bin/bash
# Step 29: conservazione dati (informativa privacy). Timer giornaliero alle 04:10
# che chiama l'app su /api/cron/retention. PARTE IN DRY-RUN: nel journal compaiono
# solo i conteggi e non si cancella niente. Per far cancellare davvero:
#   sudo systemctl edit softuerino-retention.service
#   [Service]
#   Environment=RETENTION_APPLY=1
# Lanciarlo con sudo DOPO l'aggiornamento alla patch "privacy" (serve la route).
set -euo pipefail
HERE=$(dirname "$(readlink -f "$0")")
ENV_FILE=/opt/softuerino/app/.env
grep -q '^CRON_SECRET=.' "$ENV_FILE" || { echo "CRON_SECRET mancante: lancia prima lo step 23"; exit 1; }

cat > /usr/local/sbin/softuerino-retention <<'SH'
#!/bin/bash
# Chiede all'app di applicare i tempi di conservazione. Senza RETENTION_APPLY=1
# (impostato nella unit systemd, non nel .env) è un dry-run.
# Il segreto passa su stdin (curl -H @-): non compare tra gli argomenti dei processi.
set -euo pipefail
SECRET=$(grep '^CRON_SECRET=' /opt/softuerino/app/.env | cut -d= -f2- | tr -d '"')
if [ "${RETENTION_APPLY:-0}" = "1" ]; then BODY='{"apply":true}'; else BODY='{}'; fi
printf 'Authorization: Bearer %s\nContent-Type: application/json\n' "$SECRET" | \
  curl -fsS --max-time 300 -X POST -H @- -d "$BODY" http://127.0.0.1:3000/api/cron/retention
echo
SH
chmod 755 /usr/local/sbin/softuerino-retention

install -m 644 "$HERE/systemd/softuerino-retention.service" /etc/systemd/system/
install -m 644 "$HERE/systemd/softuerino-retention.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now softuerino-retention.timer
echo "---"
systemctl list-timers --no-pager softuerino-retention.timer | sed -n 2p
