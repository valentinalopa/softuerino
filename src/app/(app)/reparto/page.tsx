import { redirect } from "next/navigation";

// Vecchio indirizzo di "Il mio reparto", ora l'elenco di Persone.
export default function RepartoRedirect() {
  redirect("/team");
}
