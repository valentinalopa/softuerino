"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { THEME_STORAGE_KEY, THEMES, THEME_LABELS, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

function isThemePreference(value: string | null): value is ThemePreference {
  return !!value && (THEMES as readonly string[]).includes(value);
}

// Piccolo store esterno sul localStorage: useSyncExternalStore evita la lettura
// di localStorage dentro un effect (che causerebbe un setState sincrono nell'effect).
const listeners = new Set<() => void>();

function subscribeToTheme(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getThemeSnapshot(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

function getServerThemeSnapshot(): ThemePreference {
  return "system";
}

export function ThemeToggle() {
  const value = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const isDark = value === "dark" || (value === "system" && media.matches);
      document.documentElement.classList.toggle("dark", isDark);
    }

    apply();
    if (value === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [value]);

  function select(next: ThemePreference) {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    listeners.forEach((listener) => listener());
  }

  return (
    <div className="flex gap-2">
      {THEMES.map((theme) => {
        const Icon = ICONS[theme];
        const active = value === theme;
        return (
          <button
            key={theme}
            type="button"
            onClick={() => select(theme)}
            className={cn(
              "flex flex-1 flex-col items-center gap-2 rounded-md border px-3 py-3 text-sm transition-colors",
              active
                ? "border-primary bg-primary/5 text-foreground"
                : "border-surface-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-4" />
            {THEME_LABELS[theme]}
          </button>
        );
      })}
    </div>
  );
}
