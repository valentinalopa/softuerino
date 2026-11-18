import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import {
  canAccessLicense,
  licenseScopeFor,
  licenseWhere,
  maskedAccount,
  maskedKey,
} from "@/lib/licenses/access";
import { licenseExpiry } from "@/lib/licenses/expiry";
import { ForbiddenError } from "@/lib/task-archive";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/services/errors";
import { assertRevealQuota, confirmRevealQuota } from "@/lib/licenses/reveal-limit";

// Licenze per l'app: elenco e dettaglio sempre mascherati (mai campi *Encrypted),
// reveal di chiave/password/account con registro LicenseKeyAccess, nuova attivazione
// contestuale al reveal. Modifica, creazione ed eliminazione restano solo nel web.
// Le chiavi non vanno mai nei log né nei messaggi d'errore.

export type LicenseActor = { id: string; role: string; impersonating?: boolean };

export type LicenseDTO = {
  id: string;
  name: string;
  kind: string;
  vendor: string | null;
  department: { id: string; name: string } | null;
  keyMasked: string | null;
  accountMasked: string | null;
  hasPassword: boolean;
  expiresAt: string | null;
  expiry: { status: string; label: string };
  activationLimit: number | null;
  activationsUsed: number;
};

export type LicenseDetailDTO = LicenseDTO & {
  notes: string | null;
  activations: { id: string; label: string; note: string | null; createdAt: string }[];
};

const LICENSE_INCLUDE = {
  department: { select: { id: true, name: true } },
  sharedDepartments: { select: { departmentId: true } },
  _count: { select: { activations: true } },
  activations: { orderBy: { createdAt: "asc" as const }, select: { id: true, label: true, note: true, createdAt: true } },
} as const;

type LicenseRow = NonNullable<Awaited<ReturnType<typeof loadLicense>>>;

function loadLicense(id: string) {
  return prisma.license.findUnique({ where: { id }, include: LICENSE_INCLUDE });
}

function toDto(l: LicenseRow): LicenseDTO {
  return {
    id: l.id,
    name: l.name,
    kind: l.kind,
    vendor: l.vendor,
    department: l.department,
    keyMasked: maskedKey(l.keyHint),
    accountMasked: maskedAccount(l.accountHint),
    hasPassword: Boolean(l.passwordEncrypted),
    expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
    expiry: licenseExpiry(l),
    activationLimit: l.activationLimit,
    activationsUsed: l._count.activations,
  };
}

export async function listLicenses(actor: LicenseActor): Promise<LicenseDTO[]> {
  const scope = await licenseScopeFor(actor, "vedere");
  const hasShared = scope ? true : (await prisma.license.count({ where: { visibleToAll: true } })) > 0;
  if (!scope && !hasShared) throw new ForbiddenError("Non hai accesso alle licenze");
  const rows = await prisma.license.findMany({
    where: licenseWhere(scope),
    orderBy: { name: "asc" },
    include: LICENSE_INCLUDE,
  });
  return rows.map(toDto);
}

export async function getLicense(actor: LicenseActor, id: string): Promise<LicenseDetailDTO> {
  const scope = await licenseScopeFor(actor, "vedere");
  const l = await loadLicense(id);
  // Stessa risposta se non esiste o non è visibile: non si rivela l'esistenza.
  if (!l || !canAccessLicense(scope, l, "vedere")) throw new NotFoundError("Licenza non trovata");
  return {
    ...toDto(l),
    notes: l.notes,
    activations: l.activations.map((a) => ({
      id: a.id,
      label: a.label,
      note: a.note,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export type RevealField = "key" | "password" | "account";

// Chiave, password o account in chiaro, solo su richiesta esplicita e dicendo
// dove vengono usati (attivazione esistente o "new" + label). Ogni accesso
// finisce nel registro nella stessa transazione dell'eventuale nuova attivazione.
export async function revealLicenseSecret(
  actor: LicenseActor,
  id: string,
  input: unknown
): Promise<{ value: string; field: RevealField; activationId: string }> {
  if (actor.impersonating) {
    throw new ForbiddenError("Stai vedendo l'app come un altro utente: in questa modalità non puoi farlo");
  }
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const action = raw.action;
  if (action !== "show" && action !== "copy") throw new ValidationError("Azione non valida");
  const requested = raw.field === undefined ? "key" : raw.field;
  if (requested !== "key" && requested !== "password" && requested !== "account") {
    throw new ValidationError("Campo non valido");
  }
  const field: RevealField = requested;
  const activationRef = raw.activationId === undefined ? "new" : raw.activationId;
  if (typeof activationRef !== "string" || !activationRef) throw new ValidationError("Attivazione non valida");
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim() : null;

  const scope = await licenseScopeFor(actor, "vedere");
  const license = await loadLicense(id);
  // Nessun dettaglio: inesistente e non accessibile danno la stessa risposta.
  if (!license || !canAccessLicense(scope, license, "vedere")) {
    throw new ForbiddenError("Non hai accesso a questa licenza");
  }
  const sealed = {
    key: license.keyEncrypted,
    password: license.passwordEncrypted,
    account: license.accountEncrypted,
  }[field];
  if (!sealed) throw new NotFoundError("Nessun dato salvato");

  if (activationRef === "new") {
    if (!label) throw new ValidationError("Indica dove la usi (sito, PC, account...)");
    if (label.length > 120) throw new ValidationError("Testo troppo lungo (massimo 120 caratteri)");
    if (note && note.length > 500) throw new ValidationError("Nota troppo lunga (massimo 500 caratteri)");
  } else {
    const found = await prisma.licenseActivation.findFirst({
      where: { id: activationRef, licenseId: id },
      select: { id: true },
    });
    if (!found) throw new NotFoundError("Attivazione non trovata");
  }

  // Chiave, password e account: stesse regole della revealLicenseKey del web (accesso alla licenza
  // + dove la usi + limite giornaliero), nessuna distinzione per l'account.
  let value: string;
  try {
    value = decryptSecret(sealed);
  } catch {
    throw new ConflictError("Dato non leggibile");
  }

  const activationId = await prisma.$transaction(async (tx) => {
    // Limite giornaliero (10, ora di Roma, super admin escluso): prima di creare qualsiasi cosa.
    await assertRevealQuota(tx, actor);
    let activation: { id: string; label: string };
    if (activationRef === "new") {
      if (license.activationLimit !== null) {
        const used = await tx.licenseActivation.count({ where: { licenseId: id } });
        if (used >= license.activationLimit) {
          throw new ConflictError(
            `Limite raggiunto (${used} su ${license.activationLimit}): scegli un'attivazione già registrata`
          );
        }
      }
      activation = await tx.licenseActivation.create({
        data: { licenseId: id, label, note, createdById: actor.id },
        select: { id: true, label: true },
      });
      // Riconteggio dopo l'inserimento: se due richieste concorrenti hanno letto
      // lo stesso conteggio, quella in eccesso annulla la transazione (nessuna
      // attivazione né riga di registro).
      if (license.activationLimit !== null) {
        const after = await tx.licenseActivation.count({ where: { licenseId: id } });
        if (after > license.activationLimit) {
          throw new ConflictError(`Limite raggiunto (${license.activationLimit}): scegli un'attivazione già registrata`);
        }
      }
    } else {
      const existing = await tx.licenseActivation.findFirst({
        where: { id: activationRef, licenseId: id },
        select: { id: true, label: true },
      });
      if (!existing) throw new NotFoundError("Attivazione non trovata");
      activation = existing;
    }
    await tx.licenseKeyAccess.create({
      data: {
        licenseId: id,
        userId: actor.id,
        action,
        field,
        activationId: activation.id,
        usedFor: activation.label,
      },
    });
    // Ricontrollo dopo l'inserimento (richieste concorrenti): se oltre il limite annulla tutto.
    await confirmRevealQuota(tx, actor);
    return activation.id;
  });

  return { value, field, activationId };
}
