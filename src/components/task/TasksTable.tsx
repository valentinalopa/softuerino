import { TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { formatDate } from "@/lib/leave-format";
import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/tones";
import { TaskStatusSelect } from "@/components/task/TaskStatusSelect";
import { DeleteTaskButton } from "@/components/task/DeleteTaskButton";
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
  emptyMessage = "Nessun task ancora.",
}: {
  tasks: TaskRow[];
  emptyMessage?: string;
}) {
  return (
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
          <TableRow key={task.id}>
            <TableCell className="font-medium">{task.title}</TableCell>
            <TableCell className="text-muted-foreground">
              {task.client?.name ?? "—"}
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
              <DeleteTaskButton taskId={task.id} />
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
  );
}
