"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

const ALL = "all";

export type UrlSelectFilter = {
  // Parametro dell'URL (es. "user"): assente = nessun filtro.
  param: string;
  allLabel: string;
  options: { value: string; label: string }[];
};

// Filtri a tendina che vivono nell'URL (Task, storico delle richieste): la
// pagina server li legge da searchParams, il link resta condivisibile.
export function UrlSelectFilters({ filters }: { filters: UrlSelectFilter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {filters.map((filter) => (
        <NativeSelect
          key={filter.param}
          aria-label={filter.allLabel}
          value={searchParams.get(filter.param) ?? ALL}
          onChange={(event) => updateParam(filter.param, event.target.value)}
        >
          <option value={ALL}>{filter.allLabel}</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      ))}
    </div>
  );
}
