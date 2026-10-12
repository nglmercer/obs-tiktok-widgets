import { FileExplorer } from "../FileExplorer";
import { getLocale, getTheme, t as tr } from "../../../shared/i18n";
import { Layers } from "../Layers";
import { confirmAction } from "../../components/Dialog";
import { Canvas } from "../Canvas";
import { mergeDraft } from "../drafts";

import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Action } from "../../components/Action";
import { call, type Project } from "../../api/client";
import { Inspector } from "../Inspector";
import { SourceEditor } from "../workspace/SourceEditor";

import type { StudioController } from "../useStudioProject";
export function ProjectWorkspace({
  controller,
}: {
  controller: StudioController;
}) {
  const {
    setMobilePanel,
    nav,
    project,
    setProject,
    files,
    file,
    setFile,
    text,
    setText,
    saved,
    setSaved,
    setFileRevision,
    remote,
    setRemote,
    remoteRevision,
    tab,
    setTab,
    schema,
    preview,
    viewport,
    busy,
    setNotice,
    editorLocation,
    setEditorLocation,
    compilerLocations,
    history,
    editorCommand,
    navigation,
    upload,
    dirty,
    visualDraft,
    setVisualDraft,
    visualPast,
    setVisualPast,
    visualFuture,
    setVisualFuture,
    studioSession,
    visualRevision,
    visualChange,
    selectedLayer,
    setSelectedLayer,
    task,
    read,
    save,
    operation,
    fileOp,
    disabled,
  } = controller;
  if (!project) return null;
  return (
    <PanelGroup direction="horizontal" className="workspace">
      <Panel className="files-pane" defaultSize={20} minSize={12}>
        <section className="file-panel">
          <h2>{tr("Project files")}</h2>
          <div className="toolbar">
            <Action
              id="new-file"
              onClick={() => task("New file", () => fileOp("new"))}
            />
            <Action
              id="rename-file"
              disabledReason={!file ? "Select a file" : ""}
              onClick={() => task("Rename", () => fileOp("rename"))}
            />
            <Action
              id="delete-file"
              disabledReason={!file ? "Select a file" : ""}
              onClick={() => task("Delete file", () => fileOp("delete"))}
            />
          </div>
          <FileExplorer
            files={files.filter((f) =>
              f.startsWith(nav === "Assets" ? "assets/" : "src/"),
            )}
            selected={file}
            onSelect={(f) => {
              setMobilePanel("Preview");
              task("Open", () => read(f));
            }}
          />
          <Layers
            components={schema["x-visual"]?.components || []}
            selected={selectedLayer}
            onSelect={(id) => {
              setSelectedLayer(id);
              setTab("Design");
            }}
          />
          {nav === "Assets" && (
            <button onClick={() => upload("asset")}>
              {tr("Import asset")}
            </button>
          )}
          <label>
            <input
              type="checkbox"
              checked={project.autoPublish}
              onChange={(e) =>
                task("Preference", async () => {
                  setProject(
                    await call("widgets.project.set", {
                      id: project.id,
                      settings: { autoPublish: e.target.checked },
                      ifRevision: project.revision,
                    }),
                  );
                })
              }
            />
            {tr("Auto-publish saved source")}
          </label>
        </section>
      </Panel>
      <PanelResizeHandle className="resize" />
      <Panel className="preview-pane" defaultSize={55} minSize={25}>
        <section className="center">
          {tab === "Code" ? (
            <>
              <SourceEditor
                file={file}
                dirty={dirty}
                busy={busy}
                task={task}
                save={save}
                compilerLocations={compilerLocations}
                read={read}
                setEditorLocation={setEditorLocation}
                remote={remote}
                saved={saved}
                text={text}
                confirmAction={confirmAction}
                setText={setText}
                setSaved={setSaved}
                navigation={navigation}
                setFileRevision={setFileRevision}
                remoteRevision={remoteRevision}
                setRemote={setRemote}
                setNotice={setNotice}
                mergeDraft={mergeDraft}
                project={project}
                editorCommand={editorCommand}
                editorLocation={editorLocation}
              />
            </>
          ) : tab === "History" ? (
            <>
              <h2>{tr("Revision history")}</h2>
              {history.map((h: any) => (
                <div key={h.revision}>
                  <code>{h.revision}</code>
                  <button
                    onClick={() =>
                      task("Rollback", async () => {
                        if (
                          await confirmAction(
                            "Restore this source revision? Publish separately to apply it.",
                          )
                        ) {
                          setProject(
                            await call("widgets.rollback", {
                              id: project.id,
                              revision: h.revision,
                              ifRevision: project.revision,
                            }),
                          );
                          setText("");
                          setSaved("");
                          setFile("");
                        }
                      })
                    }
                  >
                    {tr("Restore source")}
                  </button>
                </div>
              ))}
            </>
          ) : (
            <>
              {tab === "Design" &&
                schema["x-visual"]?.components?.some(
                  (component: any) => component.bindings,
                ) && (
                  <div className="canvas-tools">
                    <button
                      disabled={!visualPast.length}
                      onClick={() => {
                        const previous = visualPast[visualPast.length - 1]!;
                        setVisualFuture((f) => [
                          visualDraft || project.settings,
                          ...f,
                        ]);
                        setVisualPast((p) => p.slice(0, -1));
                        setVisualDraft(previous);
                      }}
                    >
                      {tr("Undo design")}
                    </button>
                    <button
                      disabled={!visualFuture.length}
                      onClick={() => {
                        setVisualPast((p) => [
                          ...p,
                          visualDraft || project.settings,
                        ]);
                        setVisualDraft(visualFuture[0]);
                        setVisualFuture((f) => f.slice(1));
                      }}
                    >
                      {tr("Redo design")}
                    </button>
                    <button
                      disabled={!visualDraft}
                      onClick={() =>
                        task("Save design", async () => {
                          const m = await call<Project>(
                            "widgets.settings.set",
                            {
                              id: project.id,
                              settings: Object.fromEntries(
                                Object.entries(visualDraft || {}).filter(
                                  ([key]) =>
                                    key in (schema.properties || {}) &&
                                    ![
                                      "id",
                                      "template",
                                      "editableHtml",
                                      "customHtml",
                                    ].includes(key),
                                ),
                              ),
                              ifRevision: visualRevision.current,
                            },
                          );
                          ++navigation.current;
                          setProject(m);
                          setVisualDraft(undefined);
                        })
                      }
                    >
                      {tr("Save design")}
                    </button>
                  </div>
                )}
              <p>
                {tab === "Events"
                  ? tr("Isolated fixtures · Viewer123 sends Rose ×23")
                  : tr(
                      "Published renderer preview · no DOM-to-source rewriting",
                    )}
              </p>
              {project.events.length === 0 ? (
                <p role="alert">
                  {tr(
                    "Unsupported event combination: this template declares no event handlers.",
                  )}
                </p>
              ) : preview ? (
                tab === "Design" ? (
                  <Canvas
                    preview={preview}
                    viewport={viewport}
                    components={schema["x-visual"]?.components || []}
                    selected={selectedLayer}
                    onSelect={setSelectedLayer}
                    settings={visualDraft || project.settings}
                    onChange={visualChange}
                    session={studioSession.current}
                  />
                ) : (
                  <iframe
                    data-widget-preview
                    title={tr("Isolated widget preview")}
                    sandbox="allow-scripts allow-same-origin"
                    src={
                      preview + "&lang=" + getLocale() + "&theme=" + getTheme()
                    }
                    style={{
                      width: Math.min(Number(viewport.split("×")[0]), 900),
                      height: Number(viewport.split("×")[1]),
                    }}
                  />
                )
              ) : (
                <div className="empty-preview">
                  <h2>{tr("Preview the published build")}</h2>
                  <p>
                    {tr(
                      "Build validates a candidate. Publish applies it to OBS. Author templates are trusted code.",
                    )}
                  </p>
                  <button
                    onClick={() => task("Preview", () => operation("preview"))}
                  >
                    {tr("Open isolated preview")}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </Panel>
      <PanelResizeHandle className="resize" />
      <Panel className="inspector-pane" defaultSize={25} minSize={16}>
        <section className="inspector">
          <Inspector
            key={project.id}
            revision={project.revision}
            schema={
              selectedLayer && schema["x-visual"]
                ? {
                    ...schema,
                    properties: Object.fromEntries(
                      Object.entries(schema.properties || {}).filter(([key]) =>
                        schema["x-visual"].components
                          .find((c: any) => c.id === selectedLayer)
                          ?.properties.includes(key),
                      ),
                    ),
                  }
                : schema
            }
            settings={visualDraft || project.settings}
            onDraft={(v) => visualChange(v)}
            onTestAudio={async (path) => {
              const outer = document.querySelector<HTMLIFrameElement>(
                "iframe[data-widget-preview]",
              );
              const inner =
                outer?.contentDocument?.querySelector<HTMLIFrameElement>(
                  "#preview",
                );
              const url = new URL(
                path,
                inner?.contentWindow?.location.href || location.href,
              );
              if (
                !path ||
                url.origin !== location.origin ||
                !["http:", "https:"].includes(url.protocol)
              )
                throw new Error("Preview a published local audio asset first.");
              await new Audio(url.href).play();
            }}
            assets={files
              .filter((f) => f.startsWith("assets/"))
              .map(
                (f) =>
                  "../".repeat(
                    (project.entry || "src/index.html").split("/").length - 1,
                  ) + f,
              )}
            onSave={async (settings, revision) => {
              const m = await call<Project>("widgets.settings.set", {
                id: project.id,
                settings,
                ifRevision: revision,
              });
              ++navigation.current;
              setProject(m);
              setVisualDraft(undefined);
              setNotice("Appearance saved; publish to update production.");
            }}
          />
        </section>
      </Panel>
    </PanelGroup>
  );
}
