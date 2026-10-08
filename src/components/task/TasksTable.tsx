"use client";

import { useState } from "react";
import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { formatDate } from "@/lib/leave-format";
import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/tones";
import { TaskStatusSelect } from "@/components/task/TaskStatusSelect";
import { DeleteTaskButton } from "@/components/task/DeleteTaskButton";
import { EditTaskSheet } from "@/components/task/EditTaskSheet";
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

export function TasksTable({
  tasks,
  currentUserId,
  isAdmin,
  users,
  clients,
  emptyMessage = "Nessun task ancora.",
}: {
  tasks: TaskRow[];
  // Tutti modificano qualunque task; eliminarlo solo admin e assegnatari.
  currentUserId: string;
  isAdmin: boolean;
  // Opzioni del pannello di modifica (stesse di "Nuovo task").
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  emptyMessage?: string;
}) {
  // Si tiene l'id, non il task: dopo un salvataggio la tabella si aggiorna.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Task</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Assegnatari</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Priorità</TableHead>
            <TableHead>Scadenza</TableHead>
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
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
              <TableCell className="font-medium">{task.title}</TableCell>
              <TableCell className="text-muted-foreground">
                {task.client ? (
                  // Neutro: i colori della riga restano a stato e priorità.
                  <Badge variant="outline">{task.client.name}</Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
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
                {(isAdmin || task.assignees.some((a) => a.user.id === currentUserId)) && (
                  <DeleteTaskButton taskId={task.id} />
                )}
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
