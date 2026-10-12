import en from "./en.json" with { type: "json" };
import es from "./es.json" with { type: "json" };
export type Locale = "en" | "es";
export type Theme = "dark" | "light" | "system";
const storage = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
let locale: Locale =
  storage(
    "widget-ui.locale",
    typeof navigator !== "undefined" && navigator.language.startsWith("es")
      ? "es"
      : "en",
  ) === "es"
    ? "es"
    : "en";
let theme: Theme = storage("widget-ui.theme", "system") as Theme;
if (!["dark", "light", "system"].includes(theme)) theme = "system";
const listeners = new Set<() => void>();
export const missingKeys = new Set<string>();
export const catalog = { en, es } as Record<Locale, Record<string, string>>;
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getLocale = () => locale;
export const getTheme = () => theme;
export function t(
  key: string,
  values: Record<string, string | number> = {},
): string {
  const source = catalog[locale][key] || catalog.en[key];
  if (!source) {
    missingKeys.add(key);
    return key;
  }
  return source.replace(/\{(\w+)\}/g, (match, k) => String(values[k] ?? match));
}
export function applyPreferences() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dataset.theme = theme;
}
function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
export function setLocale(value: Locale) {
  locale = value === "es" ? "es" : "en";
  persist("widget-ui.locale", locale);
  applyPreferences();
  listeners.forEach((l) => l());
}
export function setTheme(value: Theme) {
  theme = ["dark", "light", "system"].includes(value) ? value : "system";
  persist("widget-ui.theme", theme);
  applyPreferences();
  listeners.forEach((l) => l());
}
export const formatNumber = (value: number) =>
  new Intl.NumberFormat(locale).format(value);
export const formatDate = (value: string | number) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export const eventCount = (count: number) =>
  t(
    new Intl.PluralRules(locale).select(count) === "one"
      ? "{count} event"
      : "{count} events",
    { count: formatNumber(count) },
  );
if (typeof location !== "undefined") {
  const query = new URL(location.href).searchParams;
  const requested = query.get("lang"),
    requestedTheme = query.get("theme");
  if (requested === "en" || requested === "es") locale = requested;
  if (requestedTheme && ["light", "dark", "system"].includes(requestedTheme))
    theme = requestedTheme as Theme;
}
applyPreferences();
// data-i18n is used by standalone HTML and native DOM dialogs. Machine values are untouched.
export function localizeDocument(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  root
    .querySelectorAll<HTMLElement>("[data-i18n-aria]")
    .forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria!)));
  root
    .querySelectorAll<HTMLElement>("[data-i18n-title]")
    .forEach((el) => el.setAttribute("title", t(el.dataset.i18nTitle!)));
}

export function translateMessage(message: string): string {
  const text = message.replace(/^(?:Error|ApiError):\s*/, "");
  if (catalog.en[text]) return t(text);
  const completed = text.match(/^(.*) completed$/);
  if (completed) {
    const label = completed[1];
    return t("{label} completed", {
      label: t(label[0].toUpperCase() + label.slice(1)),
    });
  }
  const error = text.match(/^([A-Z_]+): (.*)$/);
  if (error) {
    const code = error[1];
    const labels: Record<string, string> = {
      REVISION_CONFLICT: "Source changed; reload and merge before retrying.",
      NOT_PUBLISHED:
        "Publish a validated build before opening the production-equivalent preview",
      OBS_OFFLINE: "OBS local IPC is unavailable or disabled",
      SESSION_EXPIRED: "Session expired; reopen Studio from OBS.",
      FILE_READ: "The selected file is unavailable.",
      COMPILE_ERROR: "The project could not be built. Review the diagnostics.",
    };
    return code + ": " + t(labels[code] || error[2]);
  }
  return t(text);
}
