import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { getLeaveBalancesForUsers, type LeaveBalance } from "@/lib/leave-balance";
import { formatAmount } from "@/lib/leave-format";
import {
  EMPLOYMENT_TYPE_LABELS,
  assignableRoles,
  type EmploymentType,
  type Role,
} from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveBadge } from "@/components/ActiveBadge";
import { RoleBadge } from "@/components/team/RoleBadge";
import { UserRowActions } from "@/components/team/UserRowActions";
import { TeamMemberRow } from "@/components/team/TeamMemberRow";
import { NewTeamMemberDialog } from "@/components/team/NewTeamMemberDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function TeamPage() {
  const currentUser = await requireAdmin();
  const roles = assignableRoles(currentUser.role);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });

  const balances = await getLeaveBalancesForUsers(
    users.map((user) => ({
      id: user.id,
      employmentType: user.employmentType as EmploymentType,
    }))
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Team</h1>
          <p className="text-sm text-muted-foreground">
            Membri del team, ruolo e saldo ferie/permessi.
          </p>
        </div>
        <NewTeamMemberDialog roles={roles} />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ferie/Assenze rim.</TableHead>
                <TableHead>Permesso rim. (h)</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TeamMemberRow key={user.id} href={`/team/${user.id}`}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={user.role} />
                  </TableCell>
                  <TableCell>
                    {EMPLOYMENT_TYPE_LABELS[
                      user.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS
                    ] ?? user.employmentType}
                  </TableCell>
                  <TableCell>
                    <BalanceDaysCell balance={balances.get(user.id)} />
                  </TableCell>
                  <TableCell>
                    <BalanceHoursCell balance={balances.get(user.id)} />
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={user.active} />
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions
                      user={user}
                      canDelete={
                        user.id !== currentUser.id && roles.includes(user.role as Role)
                      }
                    />
                  </TableCell>
                </TeamMemberRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nessun membro del team ancora.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Colonna giorni: ferie per i dipendenti, monte assenze per le partite IVA.
function BalanceDaysCell({ balance }: { balance?: LeaveBalance }) {
  if (!balance) return <>—</>;
  if (balance.kind === "assenze") {
    return (
      <>
        <Remaining value={balance.assenzeRemaining} /> / {formatAmount(balance.assenzeAllowance)}
      </>
    );
  }
  return (
    <>
      <Remaining value={balance.ferieRemaining} /> / {formatAmount(balance.ferieAllowance)}
    </>
  );
}

// Le partite IVA non hanno un monte ore di permesso.
function BalanceHoursCell({ balance }: { balance?: LeaveBalance }) {
  if (!balance || balance.kind === "assenze") return <>—</>;
  return (
    <>
      <Remaining value={balance.permessoRemaining} /> / {formatAmount(balance.permessoAllowance)}
    </>
  );
}

// Residuo in rosso quando è in negativo (richieste oltre il monte).
function Remaining({ value }: { value: number }) {
  if (value >= 0) return <>{formatAmount(value)}</>;
  return (
    <span className="font-medium text-destructive" title="In negativo">
      {formatAmount(value)}
    </span>
  );
}
