import { requireUser } from "@/lib/auth/session";
import { OreLogSection, type OreLogParams } from "@/components/ore/OreLogSection";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Ore" };

export default async function OrePage({
  searchParams,
}: {
  searchParams: Promise<OreLogParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <h1>Ore</h1>
        <p className="text-sm text-muted-foreground">
          Le ore lavorate su ogni cliente o progetto, giorno per giorno.
        </p>
      </div>

      {/* Pagina personale, identica per tutti (admin compresi): una
          giornata registrata non si modifica da qui. Le correzioni si fanno
          dalla scheda membro in /team/[id]. */}
      <OreLogSection
        userId={user.id}
        canEdit={false}
        basePath="/ore"
        params={params}
      />
    </div>
  );
}
