-- Client della sessione: "web" (cookie) o "ios" (token Bearer dell'app iPhone).
ALTER TABLE "Session" ADD COLUMN "client" TEXT NOT NULL DEFAULT 'web';
