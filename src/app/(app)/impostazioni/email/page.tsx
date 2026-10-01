import { requireSuperAdmin } from "@/lib/auth/session";
import { getEmailSettings } from "@/lib/email/mailer";
import { isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailSettingsForm } from "@/components/impostazioni/EmailSettingsForm";

// Configurazione SMTP e notifiche: operazione di sistema, solo super admin.
export default async function EmailSettingsPage() {
  await requireSuperAdmin();
  const settings = await getEmailSettings();

  return (
    <div className="space-y-8">
      <div>
        <h1>Email</h1>
        <p className="text-sm text-muted-foreground">
          Server SMTP e notifiche: esito delle richieste, inviti agli eventi e task assegnati.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Server SMTP</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailSettingsForm
            encryptionReady={isEncryptionConfigured()}
            settings={{
              enabled: settings?.enabled ?? false,
              host: settings?.host ?? "",
              port: settings?.port ?? 587,
              security: settings?.security ?? "starttls",
              username: settings?.username ?? "",
              // La password non lascia mai il server, nemmeno cifrata.
              hasPassword: Boolean(settings?.passwordEncrypted),
              fromAddress: settings?.fromAddress ?? "",
              fromName: settings?.fromName ?? "Softuerino",
              appUrl: settings?.appUrl ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
