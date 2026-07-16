"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ClientTotal } from "@/lib/panoramica-utils";
import { CHART_COLORS } from "./chart-colors";

export function ClientDistributionChart({ totals }: { totals: ClientTotal[] }) {
  if (totals.length === 0) {
    return (
      <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        Nessuna ora loggata ancora.
      </p>
    );
  }

  const config: ChartConfig = Object.fromEntries(
    totals.map((total, i) => [
      total.id,
      { label: total.name, color: CHART_COLORS[i % CHART_COLORS.length] },
    ])
  );

  return (
    <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="id" hideLabel />} />
        <Pie
          data={totals}
          dataKey="hours"
          nameKey="id"
          innerRadius={60}
          strokeWidth={4}
          isAnimationActive={false}
        >
          {totals.map((total) => (
            <Cell key={total.id} fill={`var(--color-${total.id})`} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="id" />} />
      </PieChart>
    </ChartContainer>
  );
}
