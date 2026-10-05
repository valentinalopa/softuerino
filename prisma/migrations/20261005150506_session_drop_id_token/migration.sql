-- L'id_token non serve più: il logout SSO passa senza id_token_hint, così
-- Keycloak mostra sempre la conferma. Si eliminano anche quelli già salvati.
-- AlterTable
ALTER TABLE "Session" DROP COLUMN "idToken";
