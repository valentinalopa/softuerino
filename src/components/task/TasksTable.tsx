"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { formatDate } from "@/lib/leave-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Tone } from "@/lib/tones";
import { TaskStatusSelect } from "@/components/task/TaskStatusSelect";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { deleteTask } from "@/lib/actions";
import { EditTaskSheet } from "@/components/task/EditTaskSheet";
import { cn } from "@/lib/utils";
import { MobileList, MobileListItem } from "@/components/MobileList";
import {
  DEFAULT_SORT_DIR,
  parseTaskSort,
  sortTasks,
  type TaskSort,
  type TaskSortKey,
} from "@/lib/task-sort";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: Date | null;
  client: { id: string; name: string } | null;
  assignees: { user: { id: string; name: string } }[];
};

const PRIORITY_TONES: Record<TaskPriority, Tone> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge variant={PRIORITY_TONES[priority]}>{TASK_PRIORITY_LABELS[priority]}</Badge>;
}

// Intestazione cliccabile: primo clic nel verso proposto, poi alterna.
function SortableHead({
  sortKey,
  sort,
  onSort,
  children,
}: {
  sortKey: TaskSortKey;
  sort: TaskSort;
  onSort: (key: TaskSortKey) => void;
  children: ReactNode;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDownIcon : sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      {/* Pattern "data table" di shadcn: Button ghost nell'intestazione. */}
      <Button
        variant="ghost"
        size="xs"
        onClick={() => onSort(sortKey)}
        className={cn("-ml-2.5 font-semibold tracking-label uppercase", !active && "text-muted-foreground")}
      >
        {children}
        <Icon className={cn(!active && "opacity-50")} aria-hidden />
      </Button>
    </TableHead>
  );
}

export function TasksTable({
  tasks,
  users,
  clients,
  emptyMessage = "Nessun task ancora.",
}: {
  tasks: TaskRow[];
  // Opzioni del pannello di modifica (stesse di "Nuovo task").
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  emptyMessage?: string;
}) {
  // Si tiene l'id, non il task: dopo un salvataggio la tabella si aggiorna.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = parseTaskSort(searchParams.get("sort"), searchParams.get("dir"));
  const sortedTasks = sortTasks(tasks, sort);

  function handleSort(key: TaskSortKey) {
    const params = new URLSearchParams(searchParams.toString());
    const dir = sort?.key === key ? (sort.dir === "asc" ? "desc" : "asc") : DEFAULT_SORT_DIR[key];
    params.set("sort", key);
    params.set("dir", dir);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <>
      {/* Sette colonne non stanno su tablet: schede fino a lg. */}
      <MobileList className="md:block lg:hidden">
        {sortedTasks.map((task) => (
          <MobileListItem key={task.id} onOpen={() => setSelectedId(task.id)} label={`Modifica ${task.title}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 pt-1.5 font-medium break-words text-foreground">{task.title}</p>
              <ConfirmDeleteButton
                label={`Elimina ${task.title}`}
                title={`Eliminare "${task.title}"?`}
                description="Il task viene eliminato per tutti. L'operazione non è reversibile."
                onConfirm={() => deleteTask(task.id)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {task.client && <Badge variant="outline">{task.client.name}</Badge>}
              {task.priority && <PriorityBadge priority={task.priority as TaskPriority} />}
              {task.dueDate && <span>Scadenza {formatDate(task.dueDate)}</span>}
            </div>
            {task.assignees.length > 0 && (
              <p className="text-xs text-muted-foreground">{task.assignees.map((a) => a.user.name).join(", ")}</p>
            )}
            <TaskStatusSelect taskId={task.id} status={task.status} />
          </MobileListItem>
        ))}
        {tasks.length === 0 && (
          <MobileListItem className="text-center text-muted-foreground">{emptyMessage}</MobileListItem>
        )}
      </MobileList>
      <Table containerClassName="hidden lg:block">
        <TableHeader>
          <TableRow>
            <SortableHead sortKey="title" sort={sort} onSort={handleSort}>Task</SortableHead>
            <SortableHead sortKey="client" sort={sort} onSort={handleSort}>Cliente</SortableHead>
            <SortableHead sortKey="assignees" sort={sort} onSort={handleSort}>Assegnatari</SortableHead>
            <SortableHead sortKey="status" sort={sort} onSort={handleSort}>Stato</SortableHead>
            <SortableHead sortKey="priority" sort={sort} onSort={handleSort}>Priorità</SortableHead>
            <SortableHead sortKey="dueDate" sort={sort} onSort={handleSort}>Scadenza</SortableHead>
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTasks.map((task) => (
            <TableRow
              key={task.id}
              tabIndex={0}
              aria-label={`Modifica ${task.title}`}
              className="cursor-pointer focus-visible:bg-subtle focus-visible:outline-none"
              onClick={(event) => {
                // Stato e cestino hanno la loro azione: il clic lì non apre il pannello.
                if ((event.target as HTMLElement).closest("button, select, a, input")) return;
                setSelectedId(task.id);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(task.id);
                }
              }}
            >
              {/* Titolo e assegnatari vanno a capo: la tabella resta nella card
                  invece di scorrere in orizzontale nascondendo il titolo. */}
              <TableCell className="min-w-48 font-medium whitespace-normal break-words">{task.title}</TableCell>
              <TableCell className="text-muted-foreground">
                {task.client ? (
                  // Neutro: i colori della riga restano a stato e priorità.
                  <Badge variant="outline">{task.client.name}</Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="min-w-40 whitespace-normal text-muted-foreground">
                {task.assignees.length > 0
                  ? task.assignees.map((a) => a.user.name).join(", ")
                  : "—"}
              </TableCell>
              <TableCell>
                <TaskStatusSelect taskId={task.id} status={task.status} />
              </TableCell>
              <TableCell>
                {task.priority && <PriorityBadge priority={task.priority as TaskPriority} />}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {task.dueDate ? formatDate(task.dueDate) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <ConfirmDeleteButton
                  label={`Elimina ${task.title}`}
                  title={`Eliminare "${task.title}"?`}
                  description="Il task viene eliminato per tutti. L'operazione non è reversibile."
                  onConfirm={() => deleteTask(task.id)}
                />
              </TableCell>
            </TableRow>
          ))}
          {tasks.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <EditTaskSheet
        task={
          selected && {
            id: selected.id,
            title: selected.title,
            clientId: selected.client?.id ?? null,
            client: selected.client,
            status: selected.status,
            priority: selected.priority,
            dueDate: selected.dueDate,
            assigneeIds: selected.assignees.map((a) => a.user.id),
          }
        }
        users={users}
        clients={clients}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
