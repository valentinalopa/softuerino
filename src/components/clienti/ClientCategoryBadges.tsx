import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/tones";
import {
  CLIENT_CATEGORY_LABELS,
  parseClientCategories,
  type ClientCategory,
} from "@/lib/constants";

const CATEGORY_TONES: Record<ClientCategory, Tone> = {
  comunicazione: "accent",
  it_design: "aqua",
  produzione: "teal",
};

export function ClientCategoryBadges({ categories }: { categories: string }) {
  const parsed = parseClientCategories(categories);
  if (parsed.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {parsed.map((category) => (
        <Badge key={category} variant={CATEGORY_TONES[category]}>
          {CLIENT_CATEGORY_LABELS[category]}
        </Badge>
      ))}
    </div>
  );
}
