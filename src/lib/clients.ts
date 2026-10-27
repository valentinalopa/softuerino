// Clienti e voci interne: una voce (es. "Organizzazione IT") ha un cliente
// padre (Colibri Vision) e le sue ore contano nel totale del padre. Un
// cliente con persone indicate in "Chi può loggare" è riservato a loro.

export const CLIENT_LABEL_SEPARATOR = " › ";

export function clientLabel(client: { name: string; parent?: { name: string } | null }) {
  return client.parent ? `${client.parent.name}${CLIENT_LABEL_SEPARATOR}${client.name}` : client.name;
}

// Clienti attivi su cui questa persona può loggare: quelli aperti a tutti e
// quelli riservati in cui è indicata.
export function loggableClientsWhere(userId: string) {
  return {
    active: true,
    OR: [{ loggers: { none: {} } }, { loggers: { some: { userId } } }],
  };
}

// Elenco con le voci subito sotto il loro cliente: ordine per padre, poi il
// padre prima delle sue voci, poi per nome.
export function sortClientsByParent<T extends { name: string; parent?: { name: string } | null }>(clients: T[]) {
  const compare = (a: string, b: string) => a.localeCompare(b, "it", { sensitivity: "base", numeric: true });
  return [...clients].sort(
    (a, b) =>
      compare(a.parent?.name ?? a.name, b.parent?.name ?? b.name) ||
      Number(Boolean(a.parent)) - Number(Boolean(b.parent)) ||
      compare(a.name, b.name)
  );
}
