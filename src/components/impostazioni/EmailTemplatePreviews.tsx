"use client";

import { useState, useTransition } from "react";
import { sendSampleNotification, sendTestEmail } from "@/lib/email/actions";
import { Button } from "@/components/ui/button";
import { TONE_TEXT } from "@/lib/tones";

type Preview = { kind: string; label: string; subject: string; html: string };
type Feedback = { kind: "error" | "success"; message: string } | null;

function PreviewItem({ preview }: { preview: Preview }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function handleSend() {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result =
          preview.kind === "smtp" ? await sendTestEmail() : await sendSampleNotification(preview.kind);
        if (result && "error" in result) setFeedback({ kind: "error", message: result.error });
        else if (result) setFeedback({ kind: "success", message: result.success });
      } catch {
        setFeedback({ kind: "error", message: "Errore imprevisto" });
      }
    });
  }

  return (
    <details className="rounded-xl border border-border">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="font-medium">{preview.label}</span>
        <span className="text-sm text-muted-foreground">Oggetto: {preview.subject}</span>
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        {/* sandbox senza permessi: l'HTML dell'email non può eseguire script né navigare. */}
        <iframe
          title={`Anteprima: ${preview.label}`}
          srcDoc={preview.html}
          sandbox=""
          className="h-[520px] w-full rounded-lg border border-border bg-white"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={pending} onClick={handleSend}>
            {pending ? "Invio..." : "Invia una prova al mio indirizzo"}
          </Button>
          {feedback && (
            <p
              className={`text-sm ${feedback.kind === "error" ? "text-destructive" : TONE_TEXT.success}`}
            >
              {feedback.message}
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

export function EmailTemplatePreviews({ previews }: { previews: Preview[] }) {
  return (
    <div className="space-y-3">
      {previews.map((preview) => (
        <PreviewItem key={preview.kind} preview={preview} />
      ))}
    </div>
  );
}
