import { useState } from "react";
import {
  PanelsTopLeft,
  LayoutGrid,
  FolderOpen,
  Play,
  Image,
  SlidersHorizontal,
  Menu,
} from "lucide-react";
import { Preferences, usePreferences } from "./Preferences";
import { t } from "../../shared/i18n";
const items = [
  ["Templates", LayoutGrid],
  ["My Widgets", FolderOpen],
  ["Portable widgets", PanelsTopLeft],
  ["Live Events", Play],
  ["Assets", Image],
  ["Settings", SlidersHorizontal],
] as const;
export function Navigation({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (name: string) => void;
}) {
  usePreferences();
  const [expanded, setExpanded] = useState(false);
  return (
    <aside className="navigation" data-expanded={expanded}>
      <div className="nav-brand">
        <PanelsTopLeft aria-hidden="true" size={22} />
        <h1>{t("Widget Studio")}</h1>
        <button
          className="nav-toggle"
          aria-label={t("Navigation")}
          aria-expanded={expanded}
          aria-controls="studio-navigation"
          onClick={() => setExpanded(!expanded)}
        >
          <Menu size={20} />
        </button>
      </div>
      <nav
        id="studio-navigation"
        aria-label={t("Navigation")}
        data-expanded={expanded}
      >
        {items.map(([name, Icon]) => (
          <button
            key={name}
            className={selected === name ? "selected" : ""}
            aria-current={selected === name ? "page" : undefined}
            onClick={() => {
              onSelect(name);
              setExpanded(false);
            }}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{t(name)}</span>
          </button>
        ))}
      </nav>
      <Preferences />
      <small>{t("LOCAL AUTHORING · v4")}</small>
      <p>{t("One project. Stable OBS source. Isolated previews.")}</p>
    </aside>
  );
}
