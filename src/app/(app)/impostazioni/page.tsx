import Link from "next/link";
import { ChevronRight, Mail, RefreshCw, SlidersHorizontal } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Impostazioni" };

// Configurazione per i super admin: uscita dal menu principale, si raggiunge
// dal menu utente o da qui.
const ADMIN_SETTINGS = [
  { href: "/ruoli", label: "Ruoli e permessi", hint: "Chi vede e fa cosa, per ruolo e per reparto", icon: SlidersHorizontal },
  { href: "/impostazioni/aggiornamenti", label: "Aggiornamenti", hint: "Versione installata e nuove versioni", icon: RefreshCw },
  { href: "/impostazioni/email", label: "Email", hint: "Server SMTP e notifiche", icon: Mail },
];

export default async function ImpostazioniPage() {
  const user = await requireUser();

  return (
    <div className="space-y-8">
      <div>
        <h1>Impostazioni</h1>
        <p className="text-sm text-muted-foreground">Preferenze generali dell&apos;applicazione.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aspetto</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">Scegli il tema dell&apos;interfaccia.</p>
          <ThemeToggle />
        </CardContent>
      </Card>

      {user.role === "super_admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Amministrazione</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {ADMIN_SETTINGS.map(({ href, label, hint, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} className="group flex items-center gap-3 py-3">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground group-hover:underline">{label}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
