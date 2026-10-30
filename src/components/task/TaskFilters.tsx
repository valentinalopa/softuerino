"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UrlSelectFilters } from "@/components/UrlSelectFilters";
import { NativeSelect } from "@/components/ui/native-select";
import { parseTaskSort } from "@/lib/task-sort";

const DEFAULT_SORT = "default";

// Sotto xl (schede al posto della tabella) non ci sono intestazioni cliccabili: l'ordinamento passa da qui.
const MOBILE_SORT_OPTIONS = [
  { value: DEFAULT_SORT, label: "Più recenti" },
  { value: "priority:desc", label: "Priorità: alta → bassa" },
  { value: "priority:asc", label: "Priorità: bassa → alta" },
  { value: "dueDate:asc", label: "Scadenza più vicina" },
  { value: "status:asc", label: "Stato" },
  { value: "client:asc", label: "Cliente (A–Z)" },
  { value: "title:asc", label: "Task (A–Z)" },
];

function MobileSortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = parseTaskSort(searchParams.get("sort"), searchParams.get("dir"));
  const current = sort ? `${sort.key}:${sort.dir}` : DEFAULT_SORT;
  const options = MOBILE_SORT_OPTIONS.some((o) => o.value === current)
    ? MOBILE_SORT_OPTIONS
    : // Verso scelto dalle intestazioni su desktop e non previsto qui.
      [...MOBILE_SORT_OPTIONS, { value: current, label: "Personalizzato" }];

  function updateSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_SORT) {
      params.delete("sort");
      params.delete("dir");
    } else {
      const [key, dir] = value.split(":");
      params.set("sort", key);
      params.set("dir", dir);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <NativeSelect
      aria-label="Ordina per"
      containerClassName="xl:hidden"
      value={current}
      onChange={(event) => updateSort(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function TaskFilters({
  users,
  clients,
  currentUserId,
  mineByDefault,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  // In cima alle persone: "I miei task" a un clic.
  currentUserId: string;
  // Membri: senza filtro vedono i propri task (vedi la pagina).
  mineByDefault: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <UrlSelectFilters
        filters={[
          {
            param: "user",
            allLabel: "Tutte le persone",
            defaultValue: mineByDefault ? currentUserId : undefined,
            options: [
              { value: currentUserId, label: "I miei task" },
              ...users
                .filter((user) => user.id !== currentUserId)
                .map((user) => ({ value: user.id, label: user.name })),
            ],
          },
          {
            param: "client",
            allLabel: "Tutti i clienti",
            options: clients.map((client) => ({ value: client.id, label: client.name })),
          },
        ]}
      />
      <MobileSortSelect />
    </div>
  );
}
