"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { createVpnSection, updateVpnSection } from "@/lib/vpn/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";

type VpnValues = { id: string; name: string; notes: string | null; configFileName: string | null };

// Nuova VPN (senza "initial") o modifica di una esistente. Solo super admin.
export function VpnSectionDialog({ initial }: { initial?: VpnValues }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = initial ? await updateVpnSection(initial.id, formData) : await createVpnSection(formData);
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
      {initial ? (
        <SheetTrigger render={<Button type="button" variant="ghost" size="sm" />}>
          <Pencil className="size-4" />
          Modifica
        </SheetTrigger>
      ) : (
        <SheetTrigger render={<Button type="button" />}>
          <Plus className="size-4" />
          Nuova VPN
        </SheetTrigger>
      )}
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{initial ? `Modifica ${initial.name}` : "Nuova VPN"}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <form onSubmit={submitKeepingValues(handleSubmit)} className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vpn-name">Nome</Label>
              <Input id="vpn-name" name="name" required maxLength={60} defaultValue={initial?.name} placeholder="Lecce" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vpn-file">File di configurazione (.ovpn)</Label>
              <Input
                id="vpn-file"
                name="configFile"
                type="file"
                accept=".ovpn,.conf,application/x-openvpn-profile"
                required={!initial?.configFileName}
              />
              <p className="text-xs text-muted-foreground">
                {initial?.configFileName
                  ? `Caricato: ${initial.configFileName}. Lascia vuoto per tenerlo, oppure scegli un file nuovo per sostituirlo.`
                  : "Massimo 256 KB."}{" "}
                Il file viene salvato cifrato e lo scarica solo chi ha fatto login: ogni download è registrato.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vpn-notes">Note</Label>
              <Textarea
                id="vpn-notes"
                name="notes"
                rows={3}
                maxLength={500}
                defaultValue={initial?.notes ?? ""}
                placeholder="Facoltative (es. per chi è, cosa raggiunge)"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio..." : initial ? "Salva" : "Aggiungi"}
            </Button>
          </form>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
