-- Rinnovo automatico (mensile o annuale) e notifica di scadenza facoltativa.
ALTER TABLE "License" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "License" ADD COLUMN "renewalMonths" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "License" ADD COLUMN "notifyExpiry" BOOLEAN NOT NULL DEFAULT true;
