"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// Contenitore scorrevole della strip: all'apertura (e a ogni cambio di
// giorno) porta in vista il giorno selezionato. Su telefono la finestra di
// 10 giorni non ci sta, e oggi è l'ultimo: senza questo restava fuori schermo.
export function DayStripScroller({ selectedKey, children }: { selectedKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    const selected = container?.querySelector<HTMLElement>("[aria-current]");
    if (!container || !selected) return;
    container.scrollLeft = selected.offsetLeft - (container.clientWidth - selected.offsetWidth) / 2;
  }, [selectedKey]);

  return (
    <div ref={ref} className="relative flex flex-1 gap-2 overflow-x-auto">
      {children}
    </div>
  );
}
