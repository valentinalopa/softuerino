import { redirect } from "next/navigation";

// Vecchio indirizzo dell'organigramma, ora una vista di Persone.
export default function OrganigrammaRedirect() {
  redirect("/team?vista=organigramma");
}
