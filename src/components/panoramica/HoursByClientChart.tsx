"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ClientRef, HoursByClientMonthRow } from "@/lib/panoramica-utils";
import { CHART_COLORS } from "./chart-colors";

export function HoursByClientChart({
  rows,
  clients,
  compact = false,
}: {
  rows: HoursByClientMonthRow[];
  clients: ClientRef[];
  compact?: boolean;
}) {
  if (clients.length === 0) {
    return (
      <p className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        Nessuna ora loggata ancora.
      </p>
    );
  }

  const config: ChartConfig = Object.fromEntries(
    clients.map((client, i) => [
      client.id,
      { label: client.name, color: CHART_COLORS[i % CHART_COLORS.length] },
    ])
  );

  return (
    <ChartContainer
      config={config}
      className={compact ? "aspect-auto h-[180px] w-full" : "aspect-auto h-[300px] w-full"}
    >
      <BarChart data={rows}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {!compact && <ChartLegend content={<ChartLegendContent />} />}
        {clients.map((client) => (
          <Bar
            key={client.id}
            dataKey={client.id}
            stackId="ore"
            fill={`var(--color-${client.id})`}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
