import { Badge } from "@/components/ui/badge";
import {
  CLIENT_CATEGORY_LABELS,
  parseClientCategories,
  type ClientCategory,
} from "@/lib/constants";

const CATEGORY_STYLES: Record<ClientCategory, string> = {
  comunicazione:
    "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/25",
  it_design: "bg-blue-500/12 text-blue-800 dark:text-blue-300 border-blue-500/25",
  produzione:
    "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25",
};

export function ClientCategoryBadges({ categories }: { categories: string }) {
  const parsed = parseClientCategories(categories);
  if (parsed.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {parsed.map((category) => (
        <Badge
          key={category}
          variant="outline"
          className={CATEGORY_STYLES[category]}
        >
          {CLIENT_CATEGORY_LABELS[category]}
        </Badge>
      ))}
    </div>
  );
}
