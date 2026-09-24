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

      {/* Pagina personale: il log ore degli altri membri si consulta e
          modifica dalla loro scheda in /team/[id]. */}
      <OreLogSection
        userId={user.id}
        canEdit={user.role === "super_admin"}
        basePath="/ore"
        params={params}
      />
    </div>
  );
}
