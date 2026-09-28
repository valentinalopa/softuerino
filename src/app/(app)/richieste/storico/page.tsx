import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { startOfDay } from "@/lib/calendar-utils";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function StoricoRichiestePage() {
  await requireSuperAdmin();

  // Vista d'insieme di tutto il team: il dettaglio per singolo membro vive
  // nella sua scheda (/team/[id], tab Richieste).
  const pastRequests = await prisma.leaveRequest.findMany({
    where: {
      // endDate è a mezzanotte dell'ultimo giorno incluso: "passata" solo da
      // domani in poi, non dalle 00:01 dell'ultimo giorno.
      endDate: { lt: startOfDay(new Date()) },
      status: { not: "pending" },
    },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ user: { name: "asc" } }, { startDate: "desc" }],
  });

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {/* Il link "torna a" sta sempre in alto a sinistra, sopra il titolo. */}
        <Link href="/richieste" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft />
          Torna a Giorni off
        </Link>
        <div>
          <h1>Storico richieste del team</h1>
          <p className="text-sm text-muted-foreground">
            Tutte le richieste passate di ogni membro del team.
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <LeaveRequestsTable
            requests={pastRequests}
            showMember
            showActions
            emptyMessage="Nessuna richiesta passata."
          />
        </CardContent>
      </Card>
    </div>
  );
}
