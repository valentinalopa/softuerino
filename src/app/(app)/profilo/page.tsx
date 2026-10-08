import { requireUser } from "@/lib/auth/session";
import { managedDepartmentNames } from "@/lib/departments";
import { UserLevelBadges } from "@/components/team/UserLevel";
import { ROLE_LABELS, EMPLOYMENT_TYPE_LABELS, type Role, type EmploymentType } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/profilo/ProfileForm";
import { PasswordForm } from "@/components/profilo/PasswordForm";
import { isOidcConfigured, isSsoManaged } from "@/lib/auth/oidc";

export default async function ProfiloPage() {
  const user = await requireUser();
  const managed = (await managedDepartmentNames([user.id])).get(user.id) ?? [];
  // Con Keycloak la password locale ce l'hanno solo i super admin (emergenza).
  const localPassword = !isOidcConfigured() || user.role === "super_admin";

  return (
    <div className="space-y-8">
      <div>
        <h1>Profilo</h1>
        <p className="text-sm text-muted-foreground">
          Gestisci le tue informazioni personali e la sicurezza dell&apos;account.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <UserLevelBadges role={user.role} departments={managed} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informazioni personali</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm user={{ name: user.name, email: user.email }} ssoManaged={isSsoManaged(user)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent>
            {localPassword ? (
              <PasswordForm />
            ) : (
              <p className="text-sm text-muted-foreground">
                Accedi con l&apos;account aziendale: la password si cambia su Keycloak.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dettagli account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-border pb-2">
            <span className="text-muted-foreground">Ruolo</span>
            <span>{ROLE_LABELS[user.role as Role]}</span>
          </div>
          {managed.length > 0 && (
            <div className="flex justify-between gap-3 border-b border-border pb-2">
              <span className="text-muted-foreground">Responsabile di</span>
              <span className="text-right">{managed.join(", ")}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tipo di rapporto</span>
            <span>{EMPLOYMENT_TYPE_LABELS[user.employmentType as EmploymentType]}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
