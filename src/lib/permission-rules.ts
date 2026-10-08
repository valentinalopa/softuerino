// Permessi configurabili (Amministrazione → Ruoli e permessi): per ogni
// permesso e ogni ruolo, fin dove arriva: niente, il proprio reparto, tutti.
// Le impostazioni generali valgono per tutti i reparti; un reparto può
// personalizzarle per i suoi membri e i suoi responsabili. Il super admin può
// sempre tutto. Qui solo definizioni e validazione (usate anche nel browser).

export const PERMISSION_ROLES = ["membro", "responsabile", "admin"] as const;
export type PermissionRole = (typeof PERMISSION_ROLES)[number];
// I reparti personalizzano solo membri e responsabili: gli admin non sono
// legati a un reparto.
export const DEPARTMENT_ROLES = ["membro", "responsabile"] as const;

export const PERMISSION_ROLE_LABELS: Record<PermissionRole, string> = {
  membro: "Membro",
  responsabile: "Responsabile",
  admin: "Admin",
};

export const SCOPES = ["no", "reparto", "tutti"] as const;
export type Scope = (typeof SCOPES)[number];

export const CAPABILITY_KEYS = [
  "licenze_vedere",
  "licenze_gestire",
  "presenze_ore",
  "richieste",
  "approvare",
  "utenti",
  "clienti",
] as const;
export type Capability = (typeof CAPABILITY_KEYS)[number];

type CapabilityDef = {
  label: string;
  hint: string;
  // Valori ammessi per ruolo: uno solo = fisso (mostrato ma non modificabile).
  options: Record<PermissionRole, readonly Scope[]>;
  defaults: Record<PermissionRole, Scope>;
};

const ANY: readonly Scope[] = ["no", "reparto", "tutti"];
const YES_NO: readonly Scope[] = ["no", "tutti"];

export const CAPABILITIES: Record<Capability, CapabilityDef> = {
  licenze_vedere: {
    label: "Vedere le licenze",
    hint: "Elenco e scadenze; la chiave si vede registrando dove la si usa.",
    options: { membro: ANY, responsabile: ANY, admin: ANY },
    defaults: { membro: "no", responsabile: "reparto", admin: "tutti" },
  },
  licenze_gestire: {
    label: "Gestire le licenze",
    hint: "Aggiungere, modificare ed eliminare licenze e attivazioni.",
    options: { membro: ANY, responsabile: ANY, admin: ANY },
    defaults: { membro: "no", responsabile: "reparto", admin: "tutti" },
  },
  presenze_ore: {
    label: "Presenze e ore",
    hint: "Vedere presenze in ufficio e log ore delle altre persone.",
    options: { membro: ANY, responsabile: ANY, admin: ["tutti"] },
    defaults: { membro: "no", responsabile: "reparto", admin: "tutti" },
  },
  richieste: {
    label: "Richieste e saldi",
    hint: "Vedere richieste, assenze e saldi delle altre persone (la malattia solo agli admin).",
    options: { membro: ANY, responsabile: ANY, admin: ["tutti"] },
    defaults: { membro: "no", responsabile: "no", admin: "tutti" },
  },
  approvare: {
    label: "Approvare le richieste",
    hint: "Approvare o rifiutare ferie, permessi e assenze (mai le proprie).",
    options: { membro: ["no"], responsabile: ANY, admin: ["tutti"] },
    defaults: { membro: "no", responsabile: "no", admin: "tutti" },
  },
  utenti: {
    label: "Richiedere nuovi utenti",
    hint: "Chiedere la creazione di un account (nome, cognome, email): arriva una notifica a chi gestisce gli account.",
    options: { membro: YES_NO, responsabile: YES_NO, admin: ["tutti"] },
    defaults: { membro: "no", responsabile: "no", admin: "tutti" },
  },
  clienti: {
    label: "Aggiungere clienti",
    hint: "Creare nuovi clienti o progetti su cui registrare le ore.",
    options: { membro: YES_NO, responsabile: YES_NO, admin: ["tutti"] },
    defaults: { membro: "no", responsabile: "no", admin: "tutti" },
  },
};

export function scopeLabel(cap: Capability, scope: Scope) {
  const yesNo = !CAPABILITIES[cap].options.membro.includes("reparto") && !CAPABILITIES[cap].options.responsabile.includes("reparto");
  if (scope === "no") return "No";
  if (scope === "reparto") return "Il suo reparto";
  return yesNo ? "Sì" : "Tutti";
}

export type Rules = Record<Capability, Record<PermissionRole, Scope>>;

export function defaultRules(): Rules {
  return Object.fromEntries(
    CAPABILITY_KEYS.map((cap) => [cap, { ...CAPABILITIES[cap].defaults }])
  ) as Rules;
}

// Regole lette da JSON (database o form): valori non ammessi ignorati, il
// resto preso da `base`. I valori fissi restano sempre quelli.
export function normalizeRules(raw: unknown, base: Rules, roles: readonly PermissionRole[] = PERMISSION_ROLES): Rules {
  const source = raw && typeof raw === "object" ? (raw as Record<string, Record<string, unknown>>) : {};
  const result = defaultRules();
  for (const cap of CAPABILITY_KEYS) {
    for (const role of PERMISSION_ROLES) {
      const options = CAPABILITIES[cap].options[role];
      const wanted = roles.includes(role) ? source[cap]?.[role] : undefined;
      const fallback = base[cap][role];
      result[cap][role] =
        options.length === 1
          ? options[0]
          : typeof wanted === "string" && (options as readonly string[]).includes(wanted)
            ? (wanted as Scope)
            : fallback;
    }
  }
  return result;
}
