"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

const DEBOUNCE_MS = 300;

// Ricerca che vive nell'URL (?q=…), come i filtri a tendina: la pagina server
// filtra, il link resta condivisibile. Aggiorna mentre si scrive, con una
// breve attesa per non ricaricare a ogni lettera.
export function UrlSearchInput({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function update(next: string, immediate = false) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    const apply = () => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) params.set(param, next.trim());
      else params.delete(param);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
    if (immediate) apply();
    else timer.current = setTimeout(apply, DEBOUNCE_MS);
  }

  return (
    <InputGroup className="h-10 w-full sm:max-w-xs">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        role="searchbox"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") update("", true);
        }}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Cancella ricerca" onClick={() => update("", true)}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
