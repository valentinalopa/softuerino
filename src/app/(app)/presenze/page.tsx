import { redirect } from "next/navigation";

// Vecchio indirizzo di Presenze, ora viste di Calendario: "Il mio
// calendario" → Le mie presenze, "Tutto il team" → Presenze del team.
export default async function PresenzeRedirect({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const { month, view } = await searchParams;
  const query = new URLSearchParams({ vista: view === "generale" ? "team" : "presenze" });
  if (month) query.set("month", month);
  redirect(`/calendario?${query.toString()}`);
}
