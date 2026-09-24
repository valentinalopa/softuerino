import { requireUser } from "@/lib/auth/session";
import { ROLE_LABELS, EMPLOYMENT_TYPE_LABELS, type Role, type EmploymentType } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/profilo/ProfileForm";
import { PasswordForm } from "@/components/profilo/PasswordForm";

export default async function ProfiloPage() {
  const user = await requireUser();

  return (
    <div className="space-y-8">
      <div>
        <h1>Profilo</h1>
        <p className="text-sm text-muted-foreground">
          Gestisci le tue informazioni personali e la sicurezza dell&apos;account.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informazioni personali</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm user={{ name: user.name, email: user.email }} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm />
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
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tipo di rapporto</span>
            <span>{EMPLOYMENT_TYPE_LABELS[user.employmentType as EmploymentType]}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
