"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createUser } from "@/lib/actions";
import {
  ROLE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  type Role,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelectField } from "@/components/form/native-select-field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// `roles`: i ruoli che l'utente corrente può assegnare (un admin non crea
// super admin).
export function NewTeamMemberDialog({ roles }: { roles: readonly Role[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createUser(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
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
        if (next) setError(null);
      }}
    >
      <SheetTrigger render={<Button type="button" />}>
        <Plus className="size-4" />
        Nuovo membro
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuovo membro</SheetTitle>
        </SheetHeader>
        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-name">Nome</Label>
              <Input id="new-user-name" name="name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-email">Email</Label>
              <Input id="new-user-email" name="email" type="email" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-user-password">Password</Label>
              <Input id="new-user-password" name="password" type="password" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ruolo</Label>
              <NativeSelectField
                fullWidth
                name="role"
                defaultValue="membro"
                items={roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo rapporto</Label>
              <NativeSelectField
                fullWidth
                name="employmentType"
                defaultValue="dipendente"
                items={EMPLOYMENT_TYPES.map((type) => ({
                  value: type,
                  label: EMPLOYMENT_TYPE_LABELS[type],
                }))}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Aggiunta..." : "Aggiungi"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
