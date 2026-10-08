"use client";

import { UrlSelectFilters } from "@/components/UrlSelectFilters";

export function TaskFilters({
  users,
  clients,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}) {
  return (
    <UrlSelectFilters
      filters={[
        {
          param: "user",
          allLabel: "Tutte le persone",
          options: users.map((user) => ({ value: user.id, label: user.name })),
        },
        {
          param: "client",
          allLabel: "Tutti i clienti",
          options: clients.map((client) => ({ value: client.id, label: client.name })),
        },
      ]}
    />
  );
}
