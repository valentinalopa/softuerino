"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createLicense } from "@/lib/licenses/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LicenseForm } from "@/components/utilita/LicenseForm";

export function NewLicenseDialog({ departments }: { departments: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" />}>
        <Plus className="size-4" />
        Nuova licenza
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuova licenza o abbonamento</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <LicenseForm
            departments={departments}
            submitLabel="Aggiungi"
            onSubmit={async (formData) => {
              const result = await createLicense(formData);
              if (result && "id" in result) {
                setOpen(false);
                router.push(`/utilita/licenze/${result.id}`);
              }
              return result;
            }}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
