import { redirect } from "next/navigation";

// Vecchio indirizzo di "Richieste del team", ora schede di /richieste:
// i link salvati e quelli nelle email già inviate continuano a funzionare.
export default async function RichiesteTeamRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = typeof params.view === "string" ? params.view : undefined;
  if (!view || view === "da_approvare") redirect("/richieste?vista=da-approvare");

  const query = new URLSearchParams({ vista: "team" });
  for (const key of ["view", "user", "type", "year", "month"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }
  redirect(`/richieste?${query.toString()}`);
}
