import { withMobileAuth } from "@/lib/mobile/http";
import { loadOrgTree } from "@/lib/org";

// Organigramma in sola lettura (dati sincronizzati da Keycloak): basta il login,
// come la vista Organigramma di Persone. Nessun id utente né email nell'albero.
export const GET = withMobileAuth(async () => {
  return { tree: await loadOrgTree() };
});
