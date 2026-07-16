export const THEME_STORAGE_KEY = "softuerino:theme";

export const THEMES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEMES)[number];

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Chiaro",
  dark: "Scuro",
  system: "Sistema",
};

export const THEME_BOOTSTRAP_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var isDark = stored === "dark" || (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();`;
