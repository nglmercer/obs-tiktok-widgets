import { useSyncExternalStore } from "react";
import {
  subscribe,
  getLocale,
  getTheme,
  setLocale,
  setTheme,
  t,
  type Locale,
  type Theme,
} from "../../shared/i18n";
export function usePreferences() {
  useSyncExternalStore(subscribe, () => getLocale() + ":" + getTheme());
}
export function Preferences() {
  usePreferences();
  return (
    <div className="preferences">
      <label>
        {t("Language")}
        <select
          aria-label={t("Language")}
          value={getLocale()}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </label>
      <label>
        {t("Theme")}
        <select
          aria-label={t("Theme")}
          value={getTheme()}
          onChange={(e) => setTheme(e.target.value as Theme)}
        >
          {["system", "dark", "light"].map((v) => (
            <option key={v} value={v}>
              {t(v[0].toUpperCase() + v.slice(1))}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
