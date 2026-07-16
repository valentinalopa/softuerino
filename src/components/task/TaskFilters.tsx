"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

const ALL = "all";

export function TaskFilters({
  users,
  clients,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}) {
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
      <NativeSelect
        value={searchParams.get("user") ?? ALL}
        onChange={(event) => updateParam("user", event.target.value)}
      >
        <option value={ALL}>Tutte le persone</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        value={searchParams.get("client") ?? ALL}
        onChange={(event) => updateParam("client", event.target.value)}
      >
        <option value={ALL}>Tutti i clienti</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
