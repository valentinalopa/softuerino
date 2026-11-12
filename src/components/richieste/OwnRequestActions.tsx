"use client";

import { Pencil } from "lucide-react";
import { withdrawOwnLeaveRequest } from "@/lib/actions";
import type { EmploymentType } from "@/lib/constants";
import type { LeaveCharges } from "@/lib/leave-accrual";
import type { OpenRecoveryCredit } from "@/lib/recovery-credits";
import { formatPeriod, type LeaveRequestRow } from "@/lib/leave-format";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { NewLeaveRequestDialog } from "@/components/NewLeaveRequestDialog";
import { Button } from "@/components/ui/button";

// Quello che serve per modificare le proprie richieste (come per una nuova).
export type OwnRequestContext = {
  employmentType: EmploymentType;
  charges: LeaveCharges;
  recoveryCredits: OpenRecoveryCredit[];
};

// Le proprie richieste in attesa: si possono modificare o ritirare finché
// nessuno le ha decise (chi deve approvarle riceve un avviso).
export function OwnRequestActions({
  request,
  context,
  withText = false,
}: {
  request: LeaveRequestRow;
  context: OwnRequestContext;
  withText?: boolean;
}) {
  if (request.status !== "pending") return null;
  return (
    <div className="flex items-start gap-1">
      <NewLeaveRequestDialog
        employmentType={context.employmentType}
        charges={context.charges}
        recoveryCredits={context.recoveryCredits}
        editing={request}
        trigger={
          <Button
            type="button"
            size={withText ? "sm" : "icon-sm"}
            variant="outline"
            aria-label={withText ? undefined : "Modifica richiesta"}
            title={withText ? undefined : "Modifica richiesta"}
          >
            <Pencil />
            {withText && "Modifica"}
          </Button>
        }
      />
      <ConfirmDeleteButton
        withText={withText}
        actionText="Ritira"
        successMessage="Richiesta ritirata"
        label={`Ritira richiesta, ${formatPeriod(request)}`}
        title="Ritirare la richiesta?"
        description={`${formatPeriod(request)}. La richiesta sparisce e chi doveva approvarla riceve un avviso.`}
        onConfirm={() => withdrawOwnLeaveRequest(request.id)}
      />
    </div>
  );
}
