import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function ImpostazioniPage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
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
    </div>
  );
}
