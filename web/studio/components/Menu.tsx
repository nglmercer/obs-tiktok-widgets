import { useRef } from "react";
import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { t } from "../../shared/i18n";
export function Menu({
  label = "More actions…",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details
      ref={ref}
      className="context-menu"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget))
          e.currentTarget.open = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          ref.current!.open = false;
          ref.current!.querySelector("summary")?.focus();
        }
        if (["ArrowDown", "ArrowUp"].includes(e.key)) {
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          if (!items.length) return;
          e.preventDefault();
          const index = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          ref.current!.open = true;
          items[
            (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length
          ]?.focus();
        }
      }}
    >
      <summary aria-label={t(label)} title={t(label)}>
        <MoreHorizontal aria-hidden="true" size={20} />
        <span className="sr-only">{t(label)}</span>
      </summary>
      <div
        className="menu-items"
        role="group"
        aria-label={t(label)}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button"))
            ref.current!.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
