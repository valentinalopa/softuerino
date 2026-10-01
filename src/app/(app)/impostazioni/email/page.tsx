import { requireSuperAdmin } from "@/lib/auth/session";
import { getEmailSettings } from "@/lib/email/mailer";
import { isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailSettingsForm } from "@/components/impostazioni/EmailSettingsForm";
import { EmailTemplatePreviews } from "@/components/impostazioni/EmailTemplatePreviews";
import { buildSample, SAMPLE_KINDS, SAMPLE_LABELS } from "@/lib/email/samples";

// Configurazione SMTP e notifiche: operazione di sistema, solo super admin.
export default async function EmailSettingsPage() {
  const user = await requireSuperAdmin();
  const settings = await getEmailSettings();
  // Anteprime con i dati di esempio, intestate a chi guarda la pagina.
  const previews = SAMPLE_KINDS.map((kind) => {
    const mail = buildSample(kind, { name: user.name, email: user.email }, settings?.appUrl ?? "");
    return { kind, label: SAMPLE_LABELS[kind], subject: mail.subject, html: mail.html };
  });

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

      <Card>
        <CardHeader>
          <CardTitle>Template email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Anteprima delle email con dati di esempio. &quot;Invia una prova&quot; usa le impostazioni
            salvate e manda l&apos;email al tuo indirizzo, anche se le notifiche sono spente.
          </p>
          <EmailTemplatePreviews previews={previews} />
        </CardContent>
      </Card>
    </div>
  );
}
