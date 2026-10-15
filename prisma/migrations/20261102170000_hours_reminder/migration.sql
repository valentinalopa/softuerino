-- Promemoria serale per chi non ha registrato le ore della giornata.
ALTER TABLE "User" ADD COLUMN "hoursReminder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "hoursReminderSentFor" DATETIME;
