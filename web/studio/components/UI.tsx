import type { ReactNode } from "react";
import { t } from "../../shared/i18n";
export function Status({
  busy = false,
  children,
}: {
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="status" role="status" aria-live="polite" aria-busy={busy}>
      {busy && <span className="loading-dot" aria-hidden="true" />}
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{t(title)}</h2>
      {children}
    </div>
  );
}
export function Search({
  value,
  onChange,
  label = "Search templates",
  placeholder = "Search templates and categories",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="search"
      aria-label={t(label)}
      placeholder={t(placeholder)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
export function Disclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="disclosure">
      <summary>{t(label)}</summary>
      {children}
    </details>
  );
}
