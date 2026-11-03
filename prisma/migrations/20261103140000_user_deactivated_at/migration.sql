-- Data di cessazione del rapporto (conservazione dei dati, informativa privacy).
ALTER TABLE "User" ADD COLUMN "deactivatedAt" DATETIME;
-- Gli utenti già disattivati partono da oggi: non risultano scaduti subito.
-- Stesso formato delle altre date salvate da Prisma (ISO 8601 in UTC).
UPDATE "User" SET "deactivatedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now') WHERE "active" = 0;
