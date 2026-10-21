import { useState } from "react";
import { TemplatePreview } from "./TemplatePreview";
import type { Template, Project } from "../api/client";
import { Action } from "../components/Action";
import { Search, EmptyState } from "../components/UI";
import { t } from "../../shared/i18n";
export function Gallery({
  title,
  items,
  search,
  onSearch,
  templates,
  onOpen,
  onDuplicate,
}: {
  title: string;
  items: (Template | Project)[];
  search: string;
  onSearch: (value: string) => void;
  templates: boolean;
  onOpen: (item: Template | Project) => void;
  onDuplicate: (item: Template | Project) => void;
}) {
  const [category, setCategory] = useState("");
  const categories = [
    ...new Set(items.map((i) => (i as Template).category).filter(Boolean)),
  ];
  const filtered = items.filter(
    (i) =>
      (!category || (i as Template).category === category) &&
      JSON.stringify(i).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="gallery">
      <div className="section-heading">
        <h2>{t(title)}</h2>
        <span className="badge">{filtered.length}</span>
      </div>
      <div className="gallery-filters">
        <Search value={search} onChange={onSearch} />
        {templates && (
          <select
            aria-label={t("All categories")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t("All categories")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        )}
      </div>
      {!filtered.length && (
        <EmptyState title="No matching widgets">
          <p>{t("Try another search or import a template.")}</p>
        </EmptyState>
      )}
      <div className="cards">
        {filtered.map((item) => {
          const template = item as Template;
          const project = item as Project;
          return (
            <article key={item.id + ("version" in item ? item.version : "")}>
              {templates && template.thumbnail ? (
                <TemplatePreview
                  src={
                    "/template/" +
                    item.id +
                    "/" +
                    template.version +
                    "/" +
                    template.thumbnail
                  }
                  name={t(template.name)}
                />
              ) : (
                <div className="thumbnail">
                  {template.thumbnail ? (
                    <img
                      src={
                        "/template/" +
                        item.id +
                        "/" +
                        template.version +
                        "/" +
                        template.thumbnail
                      }
                      alt={t(template.name)}
                    />
                  ) : (
                    <span aria-hidden="true">✦</span>
                  )}
                </div>
              )}
              <h3>
                {"name" in item ? t(item.name) : String(project.settings.name)}
              </h3>
              <p>
                {"description" in item
                  ? t(item.description)
                  : project.template?.id || ""}
              </p>
              <span className="badge">HTML / CSS / JS</span>
              <span className="badge">{t(template.category || "Widgets")}</span>
              <small>{t("No build dependencies")}</small>
              <div className="card-actions">
                <button onClick={() => onOpen(item)}>
                  {t(templates ? "Use template" : "Open widget")}
                </button>
                {!templates && (
                  <Action id="duplicate" onClick={() => onDuplicate(item)} />
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
