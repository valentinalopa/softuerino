# Softuerino

Gestionale del team: presenze, ferie e permessi, calendario, task, ore e clienti.
Next.js (App Router) + Prisma su SQLite.

## Sviluppo locale

```bash
cp .env.example .env   # poi compila le variabili che servono
npm install
npx prisma migrate dev # crea dev.db e applica le migrazioni
npm run db:seed        # utenti e dati demo (solo sviluppo)
npm run dev
```

L'app gira su [http://localhost:3000](http://localhost:3000).

Prima di scrivere codice leggi `AGENTS.md`: questa versione di Next.js ha API
diverse da quelle che ci si aspetterebbe.

## Produzione

Softuerino gira su un server nostro, con il database SQLite su file.
Si aggiorna da **Sistema → Aggiornamenti** (solo super admin): un servizio del
server (`softuerino-aggiorna`) fa il backup del database, scarica il codice da
GitHub, installa le dipendenze, applica le migrazioni Prisma, compila e
riavvia l'app. Se un passo fallisce torna alla versione precedente.

Le modifiche allo schema vanno quindi sempre accompagnate da una migrazione in
`prisma/migrations` (`npx prisma migrate dev --name ...`): sul server si
applicano da sole al prossimo aggiornamento.
