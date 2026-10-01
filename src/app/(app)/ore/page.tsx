import { requireUser } from "@/lib/auth/session";
import { OreLogSection, type OreLogParams } from "@/components/ore/OreLogSection";

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
        <h1>Log ore</h1>
        <p className="text-sm text-muted-foreground">
          Log ore su cliente/progetto, giorno per giorno.
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
