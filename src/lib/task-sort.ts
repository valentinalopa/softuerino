import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";

// Ordinamento della tabella Task: vive nell'URL (?sort=…&dir=…) come i
// filtri, così intestazioni (desktop) e tendina (mobile) restano allineate.
export const TASK_SORT_KEYS = ["title", "client", "assignees", "status", "priority", "dueDate"] as const;
export type TaskSortKey = (typeof TASK_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
export type TaskSort = { key: TaskSortKey; dir: SortDir } | null;

// Verso proposto al primo clic: la priorità parte dalle alte.
export const DEFAULT_SORT_DIR: Record<TaskSortKey, SortDir> = {
  title: "asc",
  client: "asc",
  assignees: "asc",
  status: "asc",
  priority: "desc",
  dueDate: "asc",
};

export function parseTaskSort(sort: string | null, dir: string | null): TaskSort {
  if (!sort || !(TASK_SORT_KEYS as readonly string[]).includes(sort)) return null;
  const key = sort as TaskSortKey;
  return { key, dir: dir === "asc" || dir === "desc" ? dir : DEFAULT_SORT_DIR[key] };
}

type SortableTask = {
  title: string;
  status: string;
  priority: string | null;
  dueDate: Date | null;
  client: { name: string } | null;
  assignees: { user: { name: string } }[];
};

// null = valore assente: finisce sempre in fondo, in entrambi i versi.
function sortValue(task: SortableTask, key: TaskSortKey): string | number | null {
  switch (key) {
    case "title":
      return task.title;
    case "client":
      return task.client?.name ?? null;
    case "assignees":
      return task.assignees.length > 0 ? task.assignees.map((a) => a.user.name).join(", ") : null;
    case "status":
      return (TASK_STATUSES as readonly string[]).indexOf(task.status);
    case "priority":
      return task.priority ? (TASK_PRIORITIES as readonly string[]).indexOf(task.priority) : null;
    case "dueDate":
      return task.dueDate ? new Date(task.dueDate).getTime() : null;
  }
}

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

// Ordinamento stabile: a parità di valore resta l'ordine di partenza (più recenti prima).
export function sortTasks<T extends SortableTask>(tasks: T[], sort: TaskSort): T[] {
  if (!sort) return tasks;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...tasks].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : collator.compare(String(va), String(vb));
    return cmp * sign;
  });
}
