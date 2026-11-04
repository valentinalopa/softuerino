import { PROJECT_MANAGER_ROLE, SOFTUERINO_ROLES_CLAIM } from "@/lib/constants";

// I nomi dei gruppi Keycloak arrivano con o senza "/" iniziale ("/IT").
export function normalizeGroupName(group: string) {
  return group.replace(/^\/+/, "").trim();
}

// Project manager = ruolo del client softuerino in Keycloak. Arriva nel claim
// multivalore "softuerino_roles" (mapper User Client Role limitato al client
// softuerino). I gruppi (claim "groups") non c'entrano.
export function hasProjectManagerRole(claims: Record<string, unknown>) {
  const roles = claims[SOFTUERINO_ROLES_CLAIM];
  return Array.isArray(roles) && roles.some((r) => r === PROJECT_MANAGER_ROLE);
}
