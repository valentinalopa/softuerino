"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { LeaveTotals } from "@/lib/panoramica-utils";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";

const config: ChartConfig = {
  ferie: { label: LEAVE_TYPE_LABELS.ferie, color: "var(--chart-1)" },
  permesso: { label: LEAVE_TYPE_LABELS.permesso, color: "var(--chart-2)" },
  malattia: { label: LEAVE_TYPE_LABELS.malattia, color: "var(--chart-3)" },
  assenza: { label: "Assenze (P.IVA)", color: "var(--chart-4)" },
};

export function LeaveStatsChart({ totals }: { totals: LeaveTotals }) {
  const data = [
    { key: "ferie", label: LEAVE_TYPE_LABELS.ferie, value: totals.ferieDays, unit: "giorni" },
    { key: "permesso", label: LEAVE_TYPE_LABELS.permesso, value: totals.permessoHours, unit: "ore" },
    { key: "malattia", label: LEAVE_TYPE_LABELS.malattia, value: totals.malattiaDays, unit: "giorni" },
    { key: "assenza", label: "Assenze (P.IVA)", value: totals.assenzeDays, unit: "giorni" },
  ];

  return (
    <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={80} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => (
                <span>
                  {value} {item.payload.unit}
                </span>
              )}
            />
          }
        />
        <Bar dataKey="value" radius={4} isAnimationActive={false}>
          {data.map((row) => (
            <Cell key={row.key} fill={`var(--color-${row.key})`} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
