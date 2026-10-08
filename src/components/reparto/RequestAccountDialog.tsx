"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { requestAccount } from "@/lib/accounts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NativeSelectField } from "@/components/form/native-select-field";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { TONE_TEXT } from "@/lib/tones";

// Richiesta di un nuovo utente: nome, cognome ed email (e il reparto, per
// metterlo nel gruppo giusto in Keycloak). Arriva una notifica a chi gestisce
// gli account.
export function RequestAccountDialog({ departments }: { departments: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData, form: HTMLFormElement) {
    setError(null);
    setPending(true);
    try {
      const result = await requestAccount(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      form.reset();
      setSent(true);
    } catch {
      setError("Errore imprevisto");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setSent(false);
        }
      }}
    >
      <SheetTrigger render={<Button type="button" />}>
        <UserPlus className="size-4" />
        Richiedi nuovo utente
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Richiedi un nuovo utente</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submitKeepingValues(handleSubmit)} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              L&apos;amministrazione riceve la richiesta e crea l&apos;account aziendale: al primo accesso la persona
              compare in Softuerino.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-first">Nome</Label>
                <Input id="acc-first" name="firstName" required maxLength={80} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-last">Cognome</Label>
                <Input id="acc-last" name="lastName" required maxLength={80} autoComplete="off" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-email">Email</Label>
              <Input id="acc-email" name="email" type="email" required maxLength={200} autoComplete="off" placeholder="nome@colibrivision.it" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reparto</Label>
              <NativeSelectField
                fullWidth
                name="departmentId"
                defaultValue=""
                items={[{ value: "", label: "Da decidere" }, ...departments.map((d) => ({ value: d.id, label: d.name }))]}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-note">Note</Label>
              <Textarea id="acc-note" name="note" rows={3} maxLength={500} placeholder="Facoltative (es. da quando, a cosa deve accedere)" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {sent && <p className={`text-sm ${TONE_TEXT.success}`}>Richiesta inviata all&apos;amministrazione.</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Invio..." : "Invia richiesta"}
            </Button>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
