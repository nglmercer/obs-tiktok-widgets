import { Menu } from "./Menu";

import { translateMessage, t as tr } from "../../shared/i18n";

import * as Tooltip from "@radix-ui/react-tooltip";

import { Action } from "./Action";
import { call, type Project, type Template } from "../api/client";

import { Gallery } from "../features/Gallery";
import { Navigation } from "./Navigation";
import { Preferences } from "./Preferences";
import { Status } from "./UI";
import type { StudioController } from "../features/useStudioProject";
import { ProjectWorkspace } from "../features/workspace/ProjectWorkspace";
import { UniversalPanel } from "../features/UniversalPanel";
export function StudioShell({ controller }: { controller: StudioController }) {
  const {
    mobilePanel,
    setMobilePanel,
    nav,
    setNav,
    templates,
    projects,
    search,
    setSearch,
    project,
    setProject,
    file,
    tab,
    setTab,
    viewport,
    setViewport,
    busy,
    notice,
    setNotice,
    setEditorCommand,
    upload,
    exportProject,
    fileUndo,
    reverseFile,
    dirty,
    visualDraft,
    obsReady,
    addScene,
    task,
    discover,
    open,
    operation,
    disabled,
  } = controller;
  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="studio" data-mobile-panel={mobilePanel}>
        <Navigation
          selected={nav}
          onSelect={(item) => {
            setNav(item);
            if (item === "Live Events") setTab("Events");
          }}
        />
        <main>
          <header>
            <div>
              <strong>
                {(project?.settings.name as string) ||
                  tr("Create your next widget")}
              </strong>
              <small>
                {project
                  ? project.template.id + " / " + project.id.slice(0, 8)
                  : tr("Templates / Gallery")}
              </small>
            </div>
            <div className="toolbar">
              <Action
                id="undo"
                disabledReason={
                  tab !== "Code" && !fileUndo.length
                    ? "Open Code editor or perform a file operation"
                    : ""
                }
                onClick={() =>
                  fileUndo.length && !file
                    ? task("Undo file operation", () => reverseFile(false))
                    : setEditorCommand({ id: "undo", serial: Date.now() })
                }
              />
              <Action
                id="redo"
                disabledReason={
                  tab !== "Code" && !fileUndo.length
                    ? "Open Code editor or perform a file operation"
                    : ""
                }
                onClick={() =>
                  fileUndo.length && !file
                    ? task("Redo file operation", () => reverseFile(true))
                    : setEditorCommand({ id: "redo", serial: Date.now() })
                }
              />
              {["validate", "build", "publish", "preview", "history"].map(
                (id) => (
                  <Action
                    key={id}
                    id={id}
                    primary={["build", "publish"].includes(id)}
                    disabledReason={
                      disabled ||
                      (["build", "publish", "validate"].includes(id) &&
                      (dirty || visualDraft)
                        ? "Save author drafts first; Preview is isolated"
                        : "")
                    }
                    onClick={() => task(id, () => operation(id))}
                  />
                ),
              )}
              <Action
                id="scene"
                disabledReason={
                  !obsReady ? "OBS IPC is offline or disabled" : disabled
                }
                onClick={() => task("Add to scene", addScene)}
              />
              <Menu>
                <Action
                  id="export"
                  disabledReason={disabled}
                  onClick={() => task("Export", exportProject)}
                />
                <Action
                  id="import"
                  onClick={() => upload(project ? "project" : "template")}
                />
                <Action
                  id="help"
                  onClick={() =>
                    setNotice(
                      "Author files live in projects/<uuid>/src. Build creates a candidate; Publish changes production. See docs/WIDGETCTL.md. Templates are trusted code.",
                    )
                  }
                />
              </Menu>
            </div>
          </header>
          <Status busy={!!busy}>
            {busy ? tr(busy) + "…" : translateMessage(notice || "Ready")}
            {project && (
              <span>
                {dirty
                  ? " · " + tr("Unsaved draft")
                  : " · " + tr("Source saved")}{" "}
                ·{" "}
                {project.autoPublish
                  ? tr("Auto-publish enabled")
                  : tr("Explicit publish")}
                {project.build?.mode === "vite"
                  ? " · Requires opt-in Node toolchain"
                  : ""}
              </span>
            )}
          </Status>
          {nav === "Settings" ? (
            <section className="settings-panel">
              <h2>{tr("Settings")}</h2>
              <Preferences />
              <p>{tr("UI preferences are separate from widget settings.")}</p>
            </section>
          ) : nav === "Portable widgets" ? (
            <UniversalPanel controller={controller} />
          ) : ((nav === "Templates" || nav === "My Widgets") && !project) ||
            nav === "Templates" ? (
            <Gallery
              title={nav}
              items={nav === "Templates" ? templates : projects}
              search={search}
              onSearch={setSearch}
              templates={nav === "Templates"}
              onOpen={(t) =>
                task("Open", async () => {
                  const p =
                    nav === "Templates"
                      ? await call<Project>("widgets.create", {
                          template: t.id,
                          version: (t as Template).version,
                          name: (t as Template).name,
                        })
                      : (t as Project);
                  await open(p);
                })
              }
              onDuplicate={(t) =>
                task("Duplicate", async () => {
                  await call("widgets.duplicate", {
                    id: t.id,
                    ifRevision: (t as Project).revision,
                  });
                  await discover();
                })
              }
            />
          ) : !project ? (
            <section>
              <h2>{tr(nav)}</h2>
              <p>
                {tr("Select a widget in My Widgets to inspect its")}
                {nav.toLowerCase()}.
              </p>
              <button onClick={() => setNav("My Widgets")}>
                {tr("My Widgets")}
              </button>
            </section>
          ) : (
            <>
              <nav
                className="tabs"
                role="tablist"
                aria-label={tr("Workspace views")}
              >
                {["Design", "Code", "Events", "History"].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() =>
                      t === "History"
                        ? task("History", () => operation("history"))
                        : setTab(t)
                    }
                  >
                    {tr(t)}
                  </button>
                ))}
                <select
                  aria-label={tr("Preview viewport")}
                  value={viewport}
                  onChange={(e) => setViewport(e.target.value)}
                >
                  {["600×400", "1280×720", "400×700"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setProject(undefined);
                    task("Discover", discover);
                  }}
                >
                  {tr("All widgets")}
                </button>
              </nav>
              <div
                className="panel-switch"
                role="group"
                aria-label={tr("Workspace panels")}
              >
                {["Files", "Preview", "Inspector"].map((name) => (
                  <button
                    key={name}
                    aria-pressed={mobilePanel === name}
                    onClick={() => setMobilePanel(name)}
                  >
                    {tr(name)}
                  </button>
                ))}
              </div>
              <ProjectWorkspace controller={controller} />
            </>
          )}
        </main>
      </div>
    </Tooltip.Provider>
  );
}
