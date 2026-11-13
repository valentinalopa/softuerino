import "server-only";
import { prisma } from "@/lib/prisma";
import { CLIENT_CATEGORIES, isAdminRole } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { sortClientsByParent } from "@/lib/clients";
import { ForbiddenError } from "@/lib/task-archive";
import { ConflictError, ValidationError } from "@/lib/services/errors";

// Clienti: elenco e creazione, regole del web in un posto solo. Vedere l'elenco e
// crearne: admin, super admin o chi ha il permesso "Aggiungere clienti". Chi non è
// admin crea solo clienti semplici, aperti a tutti (niente "fa parte di", niente
// persone riservate). Modifica ed eliminazione restano solo nel web (admin).

export type ClientActor = { id: string; role: string; impersonating?: boolean };

export type ClientDTO = {
  id: string;
  name: string;
  active: boolean;
  categories: string[];
  parent: { id: string; name: string } | null;
  loggers: { id: string; name: string }[];
  childrenCount: number;
};

const CLIENT_INCLUDE = {
  parent: { select: { id: true, name: true } },
  loggers: { select: { user: { select: { id: true, name: true } } } },
  _count: { select: { children: true } },
} as const;

type ClientRow = {
  id: string;
  name: string;
  active: boolean;
  categories: string;
  parent: { id: string; name: string } | null;
  loggers: { user: { id: string; name: string } }[];
  _count: { children: number };
};

function toClientDto(c: ClientRow): ClientDTO {
  return {
    id: c.id,
    name: c.name,
    active: c.active,
    categories: c.categories.split(",").filter(Boolean),
    parent: c.parent,
    loggers: c.loggers.map((l) => l.user).sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" })),
    childrenCount: c._count.children,
  };
}

export async function canCreateClient(actor: ClientActor): Promise<boolean> {
  return isAdminRole(actor.role) || (await can(actor, "clienti"));
}

// Elenco completo (con inattivi), voci sotto il loro cliente padre.
export async function listClients(actor: ClientActor): Promise<ClientDTO[]> {
  if (!(await canCreateClient(actor))) throw new ForbiddenError("Non hai i permessi per vedere i clienti");
  const rows = await prisma.client.findMany({ include: CLIENT_INCLUDE });
  return sortClientsByParent(rows).map(toClientDto);
}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

export async function createClient(actor: ClientActor, input: unknown): Promise<ClientDTO> {
  if (actor.impersonating) {
    throw new ForbiddenError("Stai vedendo l'app come un altro membro: in questa modalità non puoi modificare nulla");
  }
  const isAdmin = isAdminRole(actor.role);
  if (!isAdmin && !(await can(actor, "clienti"))) throw new ForbiddenError("Non autorizzato");

  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const categories = Array.isArray(raw.categories) ? raw.categories.map(String) : [];
  const parentId = typeof raw.parentId === "string" && raw.parentId.trim() ? raw.parentId.trim() : null;
  const loggerIds = Array.isArray(raw.loggerIds)
    ? [...new Set(raw.loggerIds.filter((v): v is string => typeof v === "string" && v !== ""))]
    : [];

  if (!name) throw new ValidationError("Il nome del cliente è obbligatorio");
  if (categories.some((c) => !CLIENT_CATEGORIES.includes(c as (typeof CLIENT_CATEGORIES)[number]))) {
    throw new ValidationError("Categoria non valida");
  }
  if (!isAdmin && (parentId || loggerIds.length > 0)) {
    throw new ForbiddenError("Puoi aggiungere solo clienti semplici, aperti a tutti");
  }
  if (parentId) {
    // Un solo livello: il padre non può essere a sua volta una voce.
    const parent = await prisma.client.findUnique({ where: { id: parentId }, select: { parentId: true } });
    if (!parent) throw new ValidationError("Cliente padre non trovato");
    if (parent.parentId) throw new ValidationError("Il cliente padre è già una voce di un altro cliente");
  }
  if (loggerIds.length > 0 && (await prisma.user.count({ where: { id: { in: loggerIds } } })) !== loggerIds.length) {
    throw new ValidationError("Persona non valida");
  }

  try {
    const row = await prisma.client.create({
      data: {
        name,
        categories: categories.join(","),
        parentId,
        loggers: { create: loggerIds.map((userId) => ({ userId })) },
      },
      include: CLIENT_INCLUDE,
    });
    return toClientDto(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError("Esiste già un cliente con questo nome");
    throw err;
  }
}
