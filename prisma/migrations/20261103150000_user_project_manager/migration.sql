-- Project manager (gruppo Keycloak "project-manager"): vede l'archivio dei task di tutti.
ALTER TABLE "User" ADD COLUMN "projectManager" BOOLEAN NOT NULL DEFAULT false;
