"use client";

import { useState, useTransition } from "react";
import { saveEmailSettings, sendTestEmail } from "@/lib/email/actions";
import { EMAIL_SECURITY, EMAIL_SECURITY_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelectField } from "@/components/form/native-select-field";
import { TONE_TEXT } from "@/lib/tones";

type Settings = {
  enabled: boolean;
  host: string;
  port: number;
  security: string;
  username: string;
  hasPassword: boolean;
  fromAddress: string;
  fromName: string;
  appUrl: string;
};

type Feedback = { kind: "error" | "success"; message: string } | null;

function toFeedback(result: { error: string } | { success: string } | undefined): Feedback {
  if (!result) return null;
  return "error" in result
    ? { kind: "error", message: result.error }
    : { kind: "success", message: result.success };
}

function FeedbackText({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p className={`text-sm ${feedback.kind === "error" ? "text-destructive" : TONE_TEXT.success}`}>
      {feedback.message}
    </p>
  );
}

export function EmailSettingsForm({
  settings,
  encryptionReady,
}: {
  settings: Settings;
  // Senza SETTINGS_ENCRYPTION_KEY sul server la password non si può salvare.
  encryptionReady: boolean;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [clearPassword, setClearPassword] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<Feedback>(null);
  const [testFeedback, setTestFeedback] = useState<Feedback>(null);
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();

  function handleSave(formData: FormData) {
    setSaveFeedback(null);
    startSaving(async () => {
      try {
        setSaveFeedback(toFeedback(await saveEmailSettings(formData)));
        setClearPassword(false);
      } catch {
        setSaveFeedback({ kind: "error", message: "Errore imprevisto" });
      }
    });
  }

  function handleTest() {
    setTestFeedback(null);
    startTesting(async () => {
      try {
        setTestFeedback(toFeedback(await sendTestEmail()));
      } catch {
        setTestFeedback({ kind: "error", message: "Errore imprevisto" });
      }
    });
  }

  return (
    <div className="space-y-6">
      <form action={handleSave} className="space-y-4">
        <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
        <input type="hidden" name="clearPassword" value={clearPassword ? "true" : "false"} />

        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox checked={enabled} onCheckedChange={(next) => setEnabled(Boolean(next))} />
          Invia le notifiche email
        </Label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="smtp-host">Server SMTP</Label>
            <Input id="smtp-host" name="host" defaultValue={settings.host} placeholder="smtp.esempio.it" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smtp-port">Porta</Label>
            <Input id="smtp-port" name="port" type="number" min={1} max={65535} defaultValue={settings.port} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Cifratura</Label>
          <NativeSelectField
            fullWidth
            name="security"
            defaultValue={settings.security}
            items={EMAIL_SECURITY.map((value) => ({ value, label: EMAIL_SECURITY_LABELS[value] }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smtp-username">Utente</Label>
            <Input
              id="smtp-username"
              name="username"
              defaultValue={settings.username}
              autoComplete="off"
              placeholder="Vuoto se il server non richiede login"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smtp-password">Password</Label>
            <Input
              id="smtp-password"
              name="password"
              type="password"
              autoComplete="new-password"
              disabled={!encryptionReady || clearPassword}
              placeholder={settings.hasPassword ? "Salvata: lascia vuoto per non cambiarla" : ""}
            />
            {settings.hasPassword && (
              <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                <Checkbox
                  checked={clearPassword}
                  onCheckedChange={(next) => setClearPassword(Boolean(next))}
                />
                Rimuovi la password salvata
              </Label>
            )}
            {!encryptionReady && (
              <p className="text-xs text-destructive">
                Sul server manca SETTINGS_ENCRYPTION_KEY: la password non può essere salvata.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smtp-from-address">Indirizzo mittente</Label>
            <Input
              id="smtp-from-address"
              name="fromAddress"
              type="email"
              defaultValue={settings.fromAddress}
              placeholder="softuerino@esempio.it"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smtp-from-name">Nome mittente</Label>
            <Input id="smtp-from-name" name="fromName" defaultValue={settings.fromName} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="smtp-app-url">Indirizzo dell&apos;app</Label>
          <Input
            id="smtp-app-url"
            name="appUrl"
            type="url"
            defaultValue={settings.appUrl}
            placeholder="https://softuerino.esempio.it"
          />
          <p className="text-xs text-muted-foreground">
            Usato per i link nelle email. Vuoto: le email non contengono link.
          </p>
        </div>

        <FeedbackText feedback={saveFeedback} />
        <Button type="submit" disabled={saving}>
          {saving ? "Salvataggio..." : "Salva impostazioni"}
        </Button>
      </form>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          Invia un&apos;email di prova al tuo indirizzo usando le impostazioni salvate.
        </p>
        <FeedbackText feedback={testFeedback} />
        <Button type="button" variant="outline" disabled={testing} onClick={handleTest}>
          {testing ? "Invio..." : "Invia email di prova"}
        </Button>
      </div>
    </div>
  );
}
