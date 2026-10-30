import { redirect } from "next/navigation";

// Vecchio indirizzo della scheda persona per i responsabili: ora /team/[id]
// mostra a ognuno le schede che può vedere. Scheda e filtri restano.
export default async function RepartoMemberRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  const qs = query.toString();
  redirect(qs ? `/team/${id}?${qs}` : `/team/${id}`);
}
