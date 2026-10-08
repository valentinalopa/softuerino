import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { isOidcConfigured } from "@/lib/auth/oidc";
import { balanceFigures, getLeaveBalancesForUsers } from "@/lib/leave-balance";
import { formatToRecover } from "@/lib/leave-format";
import { getRecoveryCreditsForUsers } from "@/lib/recovery-credits";
import {
  EMPLOYMENT_TYPE_LABELS,
  assignableRoles,
  type EmploymentType,
  type Role,
} from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveBadge } from "@/components/ActiveBadge";
import { LevelAvatar, UserLevelBadges } from "@/components/team/UserLevel";
import { managedDepartmentNames } from "@/lib/departments";
import { UserRowActions } from "@/components/team/UserRowActions";
import { LinkRow } from "@/components/LinkRow";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { NewTeamMemberDialog } from "@/components/team/NewTeamMemberDialog";
import { BalanceMeters } from "@/components/team/BalanceMeters";
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

  const year = new Date().getFullYear();
  const [balances, recoveryCredits, managedBy] = await Promise.all([
    getLeaveBalancesForUsers(
      users.map((user) => ({
        id: user.id,
        employmentType: user.employmentType as EmploymentType,
      })),
      year
    ),
    getRecoveryCreditsForUsers(users.map((user) => user.id)),
    managedDepartmentNames(users.map((user) => user.id)),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Team</h1>
          <p className="text-sm text-muted-foreground">
            Membri del team e saldi dell&apos;anno. Apri un membro per profilo, saldi,
            richieste, presenze e ore.
          </p>
        </div>
        <NewTeamMemberDialog roles={roles} ssoEnabled={isOidcConfigured()} />
      </div>

      <Card>
        <CardContent>
          <MobileList>
            {users.map((user) => (
              <MobileListItem key={user.id} href={`/team/${user.id}`} label={user.name}>
                <div className="flex items-start gap-3">
                  <LevelAvatar name={user.name} role={user.role} departments={managedBy.get(user.id) ?? []} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <UserRowActions
                    user={user}
                    canDelete={user.id !== currentUser.id && roles.includes(user.role as Role)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <UserLevelBadges role={user.role} departments={managedBy.get(user.id) ?? []} />
                  <ActiveBadge active={user.active} />
                  <span className="text-xs text-muted-foreground">
                    {EMPLOYMENT_TYPE_LABELS[user.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS] ??
                      user.employmentType}
                  </span>
                </div>
                {balances.get(user.id) && (
                  <BalanceMeters
                    balances={balanceFigures(balances.get(user.id)!)}
                    toRecover={formatToRecover(recoveryCredits.get(user.id) ?? [])}
                  />
                )}
              </MobileListItem>
            ))}
            {users.length === 0 && (
              <MobileListItem className="text-center text-muted-foreground">
                Nessun membro del team ancora.
              </MobileListItem>
            )}
          </MobileList>
          <Table containerClassName="hidden md:block">
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead>Ruolo e contratto</TableHead>
                <TableHead>Saldo {year}</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>
                  <span className="sr-only">Azioni</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <LinkRow key={user.id} href={`/team/${user.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <LevelAvatar name={user.name} role={user.role} departments={managedBy.get(user.id) ?? []} />
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {user.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex flex-wrap gap-1">
                        <UserLevelBadges role={user.role} departments={managedBy.get(user.id) ?? []} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {EMPLOYMENT_TYPE_LABELS[
                          user.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS
                        ] ?? user.employmentType}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {balances.get(user.id) && (
                      <BalanceMeters
                        balances={balanceFigures(balances.get(user.id)!)}
                        toRecover={formatToRecover(recoveryCredits.get(user.id) ?? [])}
                      />
                    )}
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
                </LinkRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
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
